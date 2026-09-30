import {
  EventId,
  MessageId,
  ProjectId,
  ProviderInstanceId,
  TextGenerationError,
  ThreadId,
  type OrchestrationCommand,
  type OrchestrationEvent,
  type OrchestrationMessage,
  type OrchestrationThread,
  type OrchestrationThreadShell,
  type ThreadRecap,
} from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as Crypto from "effect/Crypto";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as PubSub from "effect/PubSub";
import * as Queue from "effect/Queue";
import * as Ref from "effect/Ref";
import * as Stream from "effect/Stream";

import {
  TextGeneration,
  type ThreadRecapGenerationInput,
  type ThreadRecapGenerationResult,
} from "../textGeneration/TextGeneration.ts";
import { OrchestrationEngineService } from "./Services/OrchestrationEngine.ts";
import { ProjectionSnapshotQuery } from "./Services/ProjectionSnapshotQuery.ts";
import * as ThreadRecapReactor from "./ThreadRecapReactor.ts";

const NOW = "2026-09-01T12:00:00.000Z";
const PROJECT_ID = ProjectId.make("project");
type RecapUpdate = Extract<OrchestrationCommand, { type: "thread.recap.update" }>;

const GENERATED: ThreadRecapGenerationResult = {
  goal: "Migrate to the new UI library",
  done: "E2E tests written",
  now: "Migrating Modal and Button components",
  next: "Get the E2E suite passing on the new UI",
  blocked: null,
  steps: [],
  links: [],
};

function message(id: string, role: OrchestrationMessage["role"], text: string) {
  return {
    id: MessageId.make(id),
    role,
    text,
    turnId: null,
    streaming: false,
    createdAt: NOW,
    updatedAt: NOW,
  } satisfies OrchestrationMessage;
}

function thread(
  id: string,
  recap: ThreadRecap | null,
  overrides: Partial<OrchestrationThread> = {},
): OrchestrationThread {
  return {
    id: ThreadId.make(id),
    projectId: PROJECT_ID,
    title: id,
    modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5" },
    runtimeMode: "full-access",
    interactionMode: "default",
    branch: null,
    worktreePath: null,
    pullRequests: [],
    latestTurn: null,
    createdAt: NOW,
    updatedAt: NOW,
    archivedAt: null,
    settledOverride: null,
    settledAt: null,
    snoozedUntil: null,
    snoozedAt: null,
    recap,
    deletedAt: null,
    messages: [message(`${id}-user`, "user", "Migrate to the new UI library")],
    proposedPlans: [],
    activities: [],
    checkpoints: [],
    session: null,
    ...overrides,
  };
}

function shellOf(current: OrchestrationThread): OrchestrationThreadShell {
  return {
    id: current.id,
    projectId: current.projectId,
    title: current.title,
    modelSelection: current.modelSelection,
    runtimeMode: current.runtimeMode,
    interactionMode: current.interactionMode,
    pullRequests: current.pullRequests,
    branch: current.branch,
    worktreePath: current.worktreePath,
    latestTurn: current.latestTurn,
    createdAt: current.createdAt,
    updatedAt: current.updatedAt,
    archivedAt: current.archivedAt,
    settledOverride: current.settledOverride,
    settledAt: current.settledAt,
    recap: current.recap ?? null,
    session: current.session,
    latestUserMessageAt: null,
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    hasActionableProposedPlan: false,
  };
}

const eventBase = (threadId: ThreadId, eventId: string) => ({
  sequence: 1,
  eventId: EventId.make(eventId),
  aggregateKind: "thread" as const,
  aggregateId: threadId,
  occurredAt: NOW,
  commandId: null,
  causationEventId: null,
  correlationId: null,
  metadata: {},
});

let eventCount = 0;
function turnEnded(threadId: ThreadId): OrchestrationEvent {
  return {
    ...eventBase(threadId, `session-ready-${++eventCount}`),
    type: "thread.session-set",
    payload: {
      threadId,
      session: {
        threadId,
        status: "ready",
        providerName: "Codex",
        runtimeMode: "full-access",
        activeTurnId: null,
        lastError: null,
        updatedAt: NOW,
      },
    },
  };
}

function recapTurnedOn(threadId: ThreadId): OrchestrationEvent {
  return {
    ...eventBase(threadId, `recap-on-${++eventCount}`),
    type: "thread.meta-updated",
    payload: {
      threadId,
      recap: { enabled: true, summary: null },
      recapRequested: true,
      updatedAt: NOW,
    },
  };
}

const makeHarness = Effect.fn("makeThreadRecapHarness")(function* (options: {
  readonly threads: ReadonlyArray<OrchestrationThread>;
  readonly generate?: (
    input: ThreadRecapGenerationInput,
  ) => Effect.Effect<ThreadRecapGenerationResult, TextGenerationError>;
}) {
  const threads = yield* Ref.make(new Map(options.threads.map((entry) => [entry.id, entry])));
  const events = yield* PubSub.unbounded<OrchestrationEvent>();
  const shellReads = yield* Queue.unbounded<ThreadId>();
  const updates = yield* Queue.unbounded<RecapUpdate>();
  const generations = yield* Ref.make<ReadonlyArray<ThreadRecapGenerationInput>>([]);
  let uuid = 0;

  const dependencies = Layer.mergeAll(
    Layer.mock(ProjectionSnapshotQuery)({
      getThreadShellById: (threadId) =>
        Queue.offer(shellReads, threadId).pipe(
          Effect.andThen(Ref.get(threads)),
          Effect.map((current) =>
            Option.fromNullishOr(current.get(threadId)).pipe(Option.map(shellOf)),
          ),
        ),
      getThreadDetailById: (threadId) =>
        Ref.get(threads).pipe(Effect.map((current) => Option.fromNullishOr(current.get(threadId)))),
      getProjectShellById: () => Effect.succeed(Option.none()),
    }),
    Layer.mock(TextGeneration)({
      generateThreadRecap: (input) =>
        Ref.update(generations, (current) => [...current, input]).pipe(
          Effect.andThen(options.generate?.(input) ?? Effect.succeed(GENERATED)),
        ),
    }),
    Layer.mock(OrchestrationEngineService)({
      subscribeDomainEvents: PubSub.subscribe(events).pipe(
        Effect.map((subscription) => Stream.fromSubscription(subscription)),
      ),
      dispatch: (command) => {
        if (command.type !== "thread.recap.update") {
          return Effect.die(`Unexpected command: ${command.type}`);
        }
        return Ref.update(threads, (current) => {
          const target = current.get(command.threadId);
          if (target?.recap?.enabled !== true) return current;
          return new Map(current).set(command.threadId, {
            ...target,
            recap: { enabled: true, summary: command.summary },
          });
        }).pipe(Effect.andThen(Queue.offer(updates, command)), Effect.as({ sequence: 1 }));
      },
    }),
    Layer.succeed(
      Crypto.Crypto,
      Crypto.make({
        randomBytes: (size) => new Uint8Array(size).fill(++uuid),
        digest: (_algorithm, data) => Effect.succeed(data),
      }),
    ),
  );

  return {
    threads,
    shellReads,
    updates,
    generations,
    publish: (event: OrchestrationEvent) => PubSub.publish(events, event),
    layer: ThreadRecapReactor.layer.pipe(Layer.provide(dependencies)),
  };
});

const startReactor = Effect.gen(function* () {
  const reactor = yield* ThreadRecapReactor.ThreadRecapReactor;
  yield* reactor.start();
  return reactor;
});

describe("ThreadRecapReactor", () => {
  it.effect("generates when a recap is turned on and records what it covers", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const previousSummary = {
          ...GENERATED,
          linearIssueIds: [],
          basedOnMessageId: MessageId.make("older"),
          generatedAt: NOW,
        };
        const fixture = yield* makeHarness({
          threads: [
            thread(
              "recap",
              { enabled: true, summary: previousSummary },
              {
                branch: "dev/eng-42-new-ui",
                messages: [
                  message("first", "user", "Migrate to the new UI library, see ENG-42"),
                  message("reply", "assistant", "Wrote the E2E tests."),
                ],
              },
            ),
          ],
        });
        yield* Effect.gen(function* () {
          yield* startReactor;
          yield* fixture.publish(recapTurnedOn(ThreadId.make("recap")));
          const update = yield* Queue.take(fixture.updates);

          expect(update.summary).toMatchObject({
            ...GENERATED,
            linearIssueIds: ["ENG-42"],
            basedOnMessageId: "reply",
          });
          const [input] = yield* Ref.get(fixture.generations);
          expect(input?.previousSummary).toEqual(previousSummary);
          expect(input?.linearIssueIds).toEqual(["ENG-42"]);
          expect(input?.message).toContain("Wrote the E2E tests.");
        }).pipe(Effect.provide(fixture.layer));
      }),
    ),
  );

  it.effect("always generates with Claude Opus and the 1M context window", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fixture = yield* makeHarness({
          threads: [thread("recap", { enabled: true, summary: null })],
        });
        yield* Effect.gen(function* () {
          yield* startReactor;
          yield* fixture.publish(turnEnded(ThreadId.make("recap")));
          yield* Queue.take(fixture.updates);
          const [input] = yield* Ref.get(fixture.generations);
          expect(input?.modelSelection).toEqual({
            instanceId: "claudeAgent",
            model: "claude-opus-5-5",
            options: [
              { id: "effort", value: "medium" },
              { id: "contextWindow", value: "1m" },
            ],
          });
        }).pipe(Effect.provide(fixture.layer));
      }),
    ),
  );

  it.effect("ignores threads without an enabled recap and turns already covered", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fixture = yield* makeHarness({
          threads: [
            thread("never-enabled", null),
            thread("disabled", { enabled: false, summary: null }),
            thread("enabled", { enabled: true, summary: null }),
          ],
        });
        yield* Effect.gen(function* () {
          const reactor = yield* startReactor;
          yield* fixture.publish(turnEnded(ThreadId.make("never-enabled")));
          yield* fixture.publish(turnEnded(ThreadId.make("disabled")));
          yield* fixture.publish(turnEnded(ThreadId.make("enabled")));
          yield* Queue.take(fixture.updates);
          // The session reports ready again without a new message.
          yield* fixture.publish(turnEnded(ThreadId.make("enabled")));
          // Events are handled in order, so the last read proves the repeat was queued.
          yield* fixture.publish(turnEnded(ThreadId.make("disabled")));
          expect(yield* Queue.takeN(fixture.shellReads, 5)).toEqual([
            "never-enabled",
            "disabled",
            "enabled",
            "enabled",
            "disabled",
          ]);
          yield* reactor.drain;

          const generations = yield* Ref.get(fixture.generations);
          expect(generations).toHaveLength(1);
          expect(yield* Queue.size(fixture.updates)).toBe(0);
        }).pipe(Effect.provide(fixture.layer));
      }),
    ),
  );

  it.effect("runs one more generation for turns that end during a run", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const started = yield* Deferred.make<void>();
        const release = yield* Deferred.make<void>();
        let active = 0;
        let maxActive = 0;
        const fixture = yield* makeHarness({
          threads: [
            thread("busy", { enabled: true, summary: null }),
            thread("marker", { enabled: false, summary: null }),
          ],
          generate: () =>
            Effect.acquireUseRelease(
              Effect.sync(() => {
                active += 1;
                maxActive = Math.max(maxActive, active);
              }),
              () =>
                Deferred.succeed(started, undefined).pipe(
                  Effect.andThen(Deferred.await(release)),
                  Effect.as(GENERATED),
                ),
              () =>
                Effect.sync(() => {
                  active -= 1;
                }),
            ),
        });
        yield* Effect.gen(function* () {
          const reactor = yield* startReactor;
          const threadId = ThreadId.make("busy");
          yield* fixture.publish(turnEnded(threadId));
          yield* Deferred.await(started);

          yield* Ref.update(fixture.threads, (current) => {
            const busy = current.get(threadId)!;
            return new Map(current).set(threadId, {
              ...busy,
              messages: [...busy.messages, message("later", "assistant", "Migrated Modal.")],
            });
          });
          yield* fixture.publish(turnEnded(threadId));
          yield* fixture.publish(turnEnded(threadId));
          // Events are handled in order, so the marker read proves both requests arrived
          // mid-run. The second needs no read because the thread is already queued.
          yield* fixture.publish(turnEnded(ThreadId.make("marker")));
          expect(yield* Queue.takeN(fixture.shellReads, 3)).toEqual(["busy", "busy", "marker"]);
          yield* Deferred.succeed(release, undefined);
          yield* reactor.drain;

          expect(yield* Ref.get(fixture.generations)).toHaveLength(2);
          expect(maxActive).toBe(1);
          expect(yield* Queue.take(fixture.updates)).toMatchObject({ threadId });
          expect((yield* Queue.take(fixture.updates)).summary.basedOnMessageId).toBe("later");
        }).pipe(Effect.provide(fixture.layer));
      }),
    ),
  );

  it.effect("keeps the old summary and keeps working after a generation fails", () =>
    Effect.scoped(
      Effect.gen(function* () {
        let calls = 0;
        const fixture = yield* makeHarness({
          threads: [
            thread("flaky", { enabled: true, summary: null }),
            thread("healthy", { enabled: true, summary: null }),
          ],
          generate: () =>
            ++calls === 1
              ? Effect.fail(
                  new TextGenerationError({ operation: "generateThreadRecap", detail: "offline" }),
                )
              : Effect.succeed(GENERATED),
        });
        yield* Effect.gen(function* () {
          const reactor = yield* startReactor;
          yield* fixture.publish(turnEnded(ThreadId.make("flaky")));
          yield* fixture.publish(turnEnded(ThreadId.make("healthy")));
          expect((yield* Queue.take(fixture.updates)).threadId).toBe("healthy");
          yield* reactor.drain;

          expect((yield* Ref.get(fixture.threads)).get(ThreadId.make("flaky"))?.recap).toEqual({
            enabled: true,
            summary: null,
          });
        }).pipe(Effect.provide(fixture.layer));
      }),
    ),
  );
});
