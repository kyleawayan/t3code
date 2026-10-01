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
import { ProjectionTurnRepository } from "../persistence/Services/ProjectionTurns.ts";
import { forkParked } from "../serverActivation.ts";
import { ServerSettingsService } from "../serverSettings.ts";
import { TextGeneration } from "../textGeneration/TextGeneration.ts";
import {
  detectLinearIssueIds,
  formatThreadRecapContext,
  interruptedRequests,
  markInterruptedTurns,
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

// Each run is a Claude CLI process for up to a couple of minutes; two keep one
// busy thread from holding back the others without spawning a process per thread.
const RECAP_WORKER_COUNT = 2;

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
  const turns = yield* ProjectionTurnRepository;
  const serverSettings = yield* ServerSettingsService;
  const crypto = yield* Crypto.Crypto;

  // Lets clients show that a summary is on its way; a new summary clears it.
  const setRefreshState = (threadId: ThreadId, refreshStartedAt: string | null) =>
    Effect.gen(function* () {
      yield* engine.dispatch({
        type: "thread.recap.refresh-state",
        commandId: CommandId.make(`server:thread-recap-refresh:${yield* crypto.randomUUIDv4}`),
        threadId,
        refreshStartedAt,
      });
    });

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
    const interruptedTurns = (yield* turns.listByThreadId({ threadId })).filter(
      (turn) => turn.state === "interrupted",
    );
    yield* setRefreshState(threadId, DateTime.formatIso(yield* DateTime.now));
    const generated = yield* textGeneration
      .generateThreadRecap({
        cwd:
          resolveThreadWorkspaceCwd({ thread, projects: Option.toArray(project) }) ?? process.cwd(),
        message: formatThreadRecapContext(markInterruptedTurns(thread.messages, interruptedTurns)),
        title: thread.title,
        previousSummary,
        linearIssueIds,
        interruptedRequests: interruptedRequests(thread.messages, interruptedTurns),
        modelSelection: RECAP_MODEL_SELECTION,
      })
      .pipe(Effect.onError(() => setRefreshState(threadId, null).pipe(Effect.ignoreCause)));
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

  // Each thread always goes to the same worker, so it never has two runs at once,
  // while threads on different workers generate side by side instead of waiting
  // a whole run behind each other. Each run reads the thread fresh, so a request
  // for a queued thread is already covered (a forced one upgrades it), while a
  // request during a run queues exactly one more.
  const queued = new Map<ThreadId, boolean>();
  const processRequest = (threadId: ThreadId) =>
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
    );
  const workers = yield* Effect.forEach(Array.from({ length: RECAP_WORKER_COUNT }), () =>
    makeDrainableWorker(processRequest),
  );
  const workerFor = (threadId: ThreadId) =>
    workers[
      Array.from(threadId).reduce((hash, char) => hash + char.charCodeAt(0), 0) % workers.length
    ]!;

  // Turning the recap on emits its own event, which then queues the first generation.
  const applyRecapDefault = Effect.fn("ThreadRecapReactor.applyRecapDefault")(function* (
    threadId: ThreadId,
  ) {
    const settings = yield* serverSettings.getSettings;
    if (!settings.recapEnabledByDefault) return;
    yield* engine.dispatch({
      type: "thread.meta.update",
      commandId: CommandId.make(`server:thread-recap-default:${yield* crypto.randomUUIDv4}`),
      threadId,
      recapEnabled: true,
    });
  });

  const processEvent = Effect.fn("ThreadRecapReactor.processEvent")(
    function* (event: OrchestrationEvent) {
      if (event.type === "thread.created") {
        yield* applyRecapDefault(event.payload.threadId);
        return;
      }
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
      yield* workerFor(threadId).enqueue(threadId);
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

  const drain = Effect.forEach(workers, (worker) => worker.drain, { discard: true });

  return { start, drain } satisfies ThreadRecapReactor["Service"];
});

export const layer = Layer.effect(ThreadRecapReactor, make);
