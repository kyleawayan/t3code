import {
  CommandId,
  type ModelSelection,
  type OrchestrationEvent,
  ProviderInstanceId,
  type ThreadId,
} from "@t3tools/contracts";
import { makeDrainableWorker } from "@t3tools/shared/DrainableWorker";
import * as Cause from "effect/Cause";
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import type * as Scope from "effect/Scope";
import * as Stream from "effect/Stream";

import { resolveThreadWorkspaceCwd } from "../checkpointing/Utils.ts";
import { forkParked } from "../serverActivation.ts";
import { TextGeneration } from "../textGeneration/TextGeneration.ts";
import {
  detectLinearIssueIds,
  formatThreadRecapContext,
} from "../textGeneration/ThreadRecapContext.ts";
import * as OrchestrationEngine from "./Services/OrchestrationEngine.ts";
import * as ProjectionSnapshotQuery from "./Services/ProjectionSnapshotQuery.ts";

// Recaps always run on Claude Sonnet, whatever the text-generation setting says. The user
// chose it for recap quality independent of the cheaper title model.
const RECAP_MODEL_SELECTION: ModelSelection = {
  instanceId: ProviderInstanceId.make("claudeAgent"),
  // The alias follows the newest Sonnet in the Claude model manifest.
  model: "sonnet",
  options: [{ id: "effort", value: "medium" }],
};

/** Regenerates a thread's resume recap after each turn while the recap is enabled. */
export class ThreadRecapReactor extends Context.Service<
  ThreadRecapReactor,
  {
    readonly start: () => Effect.Effect<void, never, Scope.Scope>;
    readonly drain: Effect.Effect<void>;
  }
>()("t3/orchestration/ThreadRecapReactor") {}

interface RecapRequest {
  readonly threadId: ThreadId;
  /** Explicit requests run even when the summary already covers the latest message. */
  readonly force: boolean;
}

/** A starting or finished turn can leave the recap stale; turning it on or refreshing asks directly. */
function recapRequestFor(event: OrchestrationEvent): RecapRequest | null {
  if (event.type === "thread.meta-updated" && event.payload.recapRequested === true) {
    return { threadId: event.payload.threadId, force: true };
  }
  if (
    event.type === "thread.turn-start-requested" ||
    (event.type === "thread.session-set" && event.payload.session.status === "ready")
  ) {
    return { threadId: event.payload.threadId, force: false };
  }
  return null;
}

/** @public Service construction is part of the canonical Effect module API. */
export const make = Effect.gen(function* () {
  const engine = yield* OrchestrationEngine.OrchestrationEngineService;
  const snapshots = yield* ProjectionSnapshotQuery.ProjectionSnapshotQuery;
  const textGeneration = yield* TextGeneration;
  const crypto = yield* Crypto.Crypto;

  const regenerate = Effect.fn("ThreadRecapReactor.regenerate")(function* ({
    threadId,
    force,
  }: RecapRequest) {
    const thread = Option.getOrUndefined(
      yield* snapshots.getThreadDetailById(threadId, { activityKinds: [] }),
    );
    if (thread === undefined || thread.deletedAt !== null || thread.recap?.enabled !== true) {
      return;
    }
    const latestMessage = thread.messages.findLast((message) => message.role !== "system");
    const previousSummary = thread.recap.summary;
    // Sessions also report ready when they start or reconnect. Skip when nothing new was said.
    if (
      latestMessage === undefined ||
      (!force && previousSummary?.basedOnMessageId === latestMessage.id)
    ) {
      return;
    }

    const linearIssueIds = detectLinearIssueIds({
      ...thread,
      previousLinearIssueIds: previousSummary?.linearIssueIds,
    });
    const project = yield* snapshots.getProjectShellById(thread.projectId);
    const generated = yield* textGeneration.generateThreadRecap({
      cwd:
        resolveThreadWorkspaceCwd({ thread, projects: Option.toArray(project) }) ?? process.cwd(),
      message: formatThreadRecapContext(thread.messages),
      title: thread.title,
      previousSummary,
      linearIssueIds,
      modelSelection: RECAP_MODEL_SELECTION,
    });
    yield* engine.dispatch({
      type: "thread.recap.update",
      commandId: CommandId.make(`server:thread-recap:${yield* crypto.randomUUIDv4}`),
      threadId,
      summary: {
        ...generated,
        linearIssueIds,
        basedOnMessageId: latestMessage.id,
        generatedAt: DateTime.formatIso(yield* DateTime.now),
      },
    });
  });

  // One worker runs every generation, so a thread never has two at once. Each run
  // reads the thread fresh, so a request for a queued thread is already covered
  // (a forced one upgrades it), while a request during a run queues exactly one more.
  const queued = new Map<ThreadId, boolean>();
  const worker = yield* makeDrainableWorker((threadId: ThreadId) =>
    Effect.sync(() => {
      const force = queued.get(threadId) === true;
      queued.delete(threadId);
      return { threadId, force };
    }).pipe(
      Effect.flatMap((request) => regenerate(request)),
      Effect.catchCause((cause) =>
        Cause.hasInterruptsOnly(cause)
          ? Effect.failCause(cause)
          : Effect.logWarning("thread recap generation failed", {
              threadId,
              cause: Cause.pretty(cause),
            }),
      ),
    ),
  );

  const processEvent = Effect.fn("ThreadRecapReactor.processEvent")(
    function* (event: OrchestrationEvent) {
      const request = recapRequestFor(event);
      if (request === null) return;
      const { threadId, force } = request;
      if (queued.has(threadId)) {
        if (force) queued.set(threadId, true);
        return;
      }
      // Most threads never enable a recap. Rule them out before queueing a message load.
      const shell = yield* snapshots.getThreadShellById(threadId);
      if (Option.isNone(shell) || shell.value.recap?.enabled !== true) return;
      queued.set(threadId, force);
      yield* worker.enqueue(threadId);
    },
    (effect) =>
      effect.pipe(
        Effect.catchCause((cause) =>
          Cause.hasInterruptsOnly(cause)
            ? Effect.failCause(cause)
            : Effect.logWarning("thread recap request failed", { cause: Cause.pretty(cause) }),
        ),
      ),
  );

  const start: ThreadRecapReactor["Service"]["start"] = Effect.fn("ThreadRecapReactor.start")(
    function* () {
      const events = yield* engine.subscribeDomainEvents;
      yield* forkParked(Stream.runForEach(events, processEvent));
    },
  );

  return { start, drain: worker.drain } satisfies ThreadRecapReactor["Service"];
});

export const layer = Layer.effect(ThreadRecapReactor, make);
