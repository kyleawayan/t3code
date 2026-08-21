import { CommandId, EventId, type ThreadId, type TurnId } from "@t3tools/contracts";
import * as Clock from "effect/Clock";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schedule from "effect/Schedule";

import { OrchestrationEngineService } from "../../orchestration/Services/OrchestrationEngine.ts";
import { ProjectionSnapshotQuery } from "../../orchestration/Services/ProjectionSnapshotQuery.ts";
import { ProviderSessionDirectory } from "../Services/ProviderSessionDirectory.ts";
import {
  ProviderSessionReaper,
  type ProviderSessionReaperShape,
} from "../Services/ProviderSessionReaper.ts";
import { forkParked } from "../../serverActivation.ts";
import { ProviderService } from "../Services/ProviderService.ts";
import {
  computeThreadStalled,
  STALL_THRESHOLD_MS,
  ThreadStreamActivityService,
} from "../../orchestration/ThreadStreamActivity.ts";

const DEFAULT_INACTIVITY_THRESHOLD_MS = 30 * 60 * 1000;
const DEFAULT_SWEEP_INTERVAL_MS = 2 * 60 * 1000;
// Stall watchdog: an active turn with no provider stream events for this long is
// treated as wedged. The turn may still be alive (one long tool call emits
// nothing), so this only warns — it never kills a turn. Shared with the sidebar
// projection via STALL_THRESHOLD_MS so the pill and the notice agree.
const DEFAULT_STALL_THRESHOLD_MS = STALL_THRESHOLD_MS;
// Zombie recovery: a thread whose read model still names an active turn while
// no adapter holds a session for it has no process left to finish that turn.
// Wait this long after the binding was last written before believing it, so a
// session that is still coming up is never mistaken for a dead one.
const DEFAULT_DEAD_SESSION_GRACE_MS = 60 * 1000;

export interface ProviderSessionReaperLiveOptions {
  readonly inactivityThresholdMs?: number;
  readonly sweepIntervalMs?: number;
  readonly stallThresholdMs?: number;
  readonly deadSessionGraceMs?: number;
}

const makeProviderSessionReaper = (options?: ProviderSessionReaperLiveOptions) =>
  Effect.gen(function* () {
    const providerService = yield* ProviderService;
    const directory = yield* ProviderSessionDirectory;
    const projectionSnapshotQuery = yield* ProjectionSnapshotQuery;
    const threadStreamActivity = yield* ThreadStreamActivityService;
    const orchestrationEngine = yield* OrchestrationEngineService;

    const inactivityThresholdMs = Math.max(
      1,
      options?.inactivityThresholdMs ?? DEFAULT_INACTIVITY_THRESHOLD_MS,
    );
    const sweepIntervalMs = Math.max(1, options?.sweepIntervalMs ?? DEFAULT_SWEEP_INTERVAL_MS);
    const stallThresholdMs = Math.max(1, options?.stallThresholdMs ?? DEFAULT_STALL_THRESHOLD_MS);
    const deadSessionGraceMs = Math.max(
      0,
      options?.deadSessionGraceMs ?? DEFAULT_DEAD_SESSION_GRACE_MS,
    );

    // One stall notice per wedged turn, not one per sweep. Cleared as soon as
    // the turn stops looking stalled so a thread that wedges again still warns.
    const noticedStallKeyByThreadId = new Map<ThreadId, string>();

    /**
     * Put the stall in front of the user instead of only in the server log.
     *
     * A stalled thread emits nothing, so nothing refreshes the clients either:
     * the sidebar pill is derived from a shell snapshot that is only recomputed
     * when a thread changes. Appending an activity is both the visible warning
     * in the transcript and the change that pushes the refreshed shell (and its
     * stall pill) to every connected client.
     */
    const announceStall = (input: {
      readonly threadId: ThreadId;
      readonly turnId: TurnId;
      readonly silenceMs: number;
    }) =>
      Effect.gen(function* () {
        const key = `${input.threadId}:${input.turnId}`;
        if (noticedStallKeyByThreadId.get(input.threadId) === key) {
          return;
        }
        const createdAt = yield* Effect.map(DateTime.now, DateTime.formatIso);
        const silenceMinutes = Math.max(1, Math.round(input.silenceMs / 60_000));
        // Deterministic ids: the engine dedupes by command id, so a retried
        // sweep can never append the same notice twice.
        const id = `server:thread-stalled:${input.threadId}:${input.turnId}`;
        yield* orchestrationEngine.dispatch({
          type: "thread.activity.append",
          commandId: CommandId.make(id),
          threadId: input.threadId,
          activity: {
            id: EventId.make(id),
            tone: "error",
            kind: "provider.turn.stalled",
            summary: `No agent output for ${silenceMinutes} minutes — this turn may be stuck.`,
            payload: {
              detail:
                "The provider session is still open but has streamed nothing. Stop the turn to recover the thread, then send it again.",
              silenceMs: input.silenceMs,
            },
            turnId: input.turnId,
            createdAt,
          },
          createdAt,
        });
        noticedStallKeyByThreadId.set(input.threadId, key);
      }).pipe(
        Effect.catchCause((cause) =>
          Effect.logWarning("provider.session.stall-notice-failed", {
            threadId: input.threadId,
            cause,
          }),
        ),
      );

    const sweep = Effect.gen(function* () {
      const bindings = yield* directory.listBindings();
      const now = yield* Clock.currentTimeMillis;
      // Threads an adapter actually holds a session for. Everything else is
      // persisted bookkeeping that may outlive the process that backed it.
      // Undefined means we could not tell, and then zombie recovery sits this
      // sweep out — never the other way round, since guessing "dead" here would
      // end a live turn.
      const liveThreadIds = yield* providerService.listSessions().pipe(
        Effect.map((sessions) => new Set(sessions.map((session) => session.threadId))),
        Effect.catchCause((cause) =>
          Effect.logWarning("provider.session.reaper.live-sessions-unavailable", { cause }).pipe(
            Effect.as(undefined),
          ),
        ),
      );
      let reapedCount = 0;
      let recoveredZombieCount = 0;

      for (const binding of bindings) {
        if (binding.status === "stopped") {
          noticedStallKeyByThreadId.delete(binding.threadId);
          continue;
        }

        const stallThread = yield* projectionSnapshotQuery
          .getThreadShellById(binding.threadId)
          .pipe(Effect.map(Option.getOrUndefined));
        const stallActiveTurnId = stallThread?.session?.activeTurnId ?? null;
        if (stallActiveTurnId == null) {
          noticedStallKeyByThreadId.delete(binding.threadId);
        }

        const lastSeenMs = Date.parse(binding.lastSeenAt);

        // Zombie recovery. The read model says a turn is running, but no adapter
        // holds a session for this thread: the process that would finish that
        // turn is gone (server killed mid-turn, crashed child, evicted session)
        // and nothing is left to emit the exit that clears it. Left alone the
        // thread renders "Working" forever, Stop is a no-op, and the decider
        // refuses to settle it. This is not a heuristic like the stall check
        // below — there is provably nothing running — so it acts. stopSession
        // announces the exit for a session no adapter owns, which is what
        // releases the thread.
        if (
          stallActiveTurnId != null &&
          liveThreadIds !== undefined &&
          !liveThreadIds.has(binding.threadId)
        ) {
          const bindingAgeMs = Number.isNaN(lastSeenMs)
            ? Number.POSITIVE_INFINITY
            : now - lastSeenMs;
          if (bindingAgeMs >= deadSessionGraceMs) {
            const recovered = yield* providerService
              .stopSession({ threadId: binding.threadId })
              .pipe(
                Effect.as(true),
                Effect.catchCause((cause) =>
                  Effect.logWarning("provider.session.zombie-recovery-failed", {
                    threadId: binding.threadId,
                    provider: binding.provider,
                    cause,
                  }).pipe(Effect.as(false)),
                ),
              );
            if (recovered) {
              recoveredZombieCount += 1;
              threadStreamActivity.clear(binding.threadId);
              noticedStallKeyByThreadId.delete(binding.threadId);
              yield* Effect.logWarning("provider.session.zombie-recovered", {
                threadId: binding.threadId,
                provider: binding.provider,
                activeTurnId: stallActiveTurnId,
                bindingAgeMs,
                reason: "no_live_provider_session",
              });
            }
            continue;
          }
        }

        // Stall watchdog (warn-only): an active turn that has emitted no
        // provider stream events for stallThresholdMs is likely wedged. The
        // session is still live here, so the turn may simply be inside one long
        // tool call — we warn, we never kill it. Exempt threads waiting on the
        // human (approvals / user-input) or running background work, so a
        // healthy-but-quiet turn is never flagged.
        if (stallActiveTurnId != null) {
          const lastActivityMs = threadStreamActivity.getLastActivityMs(binding.threadId);
          if (lastActivityMs === undefined) {
            // Never treat a missing entry (e.g. right after a restart) as
            // infinite silence — seed it so the thread gets a full window.
            threadStreamActivity.recordActivity(binding.threadId, now);
          } else if (
            computeThreadStalled({
              activeTurnId: stallActiveTurnId,
              lastActivityMs,
              nowMs: now,
              thresholdMs: stallThresholdMs,
              hasPendingApprovals: stallThread?.hasPendingApprovals === true,
              hasPendingUserInput: stallThread?.hasPendingUserInput === true,
              backgroundLiveness: stallThread?.backgroundLiveness ?? null,
            })
          ) {
            const silenceMs = now - lastActivityMs;
            yield* Effect.logWarning("provider.session.stall-detected", {
              threadId: binding.threadId,
              provider: binding.provider,
              activeTurnId: stallActiveTurnId,
              silenceMs,
              stallThresholdMs,
            });
            yield* announceStall({
              threadId: binding.threadId,
              turnId: stallActiveTurnId,
              silenceMs,
            });
          } else {
            noticedStallKeyByThreadId.delete(binding.threadId);
          }
        }

        if (Number.isNaN(lastSeenMs)) {
          yield* Effect.logWarning("provider.session.reaper.invalid-last-seen", {
            threadId: binding.threadId,
            provider: binding.provider,
            lastSeenAt: binding.lastSeenAt,
          });
          continue;
        }

        const idleDurationMs = now - lastSeenMs;
        if (idleDurationMs < inactivityThresholdMs) {
          continue;
        }

        // Reuses the shell read the checks above already did: one query per
        // binding per sweep, not two.
        if (stallActiveTurnId != null) {
          yield* Effect.logDebug("provider.session.reaper.skipped-active-turn", {
            threadId: binding.threadId,
            activeTurnId: stallActiveTurnId,
            idleDurationMs,
          });
          continue;
        }

        // The turn can settle while background work runs on (subagent
        // fleets, workflow runs, Monitor watch loops). Those live inside the
        // provider process, so stopping the session would kill them silently,
        // and nothing bumps lastSeenAt between turns.
        if (stallThread?.backgroundLiveness != null) {
          yield* Effect.logDebug("provider.session.reaper.skipped-background-work", {
            threadId: binding.threadId,
            backgroundLiveness: stallThread.backgroundLiveness,
            idleDurationMs,
          });
          continue;
        }

        const reaped = yield* providerService.stopSession({ threadId: binding.threadId }).pipe(
          Effect.tap(() =>
            Effect.logInfo("provider.session.reaped", {
              threadId: binding.threadId,
              provider: binding.provider,
              idleDurationMs,
              reason: "inactivity_threshold",
            }),
          ),
          Effect.as(true),
          Effect.catchCause((cause) =>
            Effect.logWarning("provider.session.reaper.stop-failed", {
              threadId: binding.threadId,
              provider: binding.provider,
              idleDurationMs,
              cause,
            }).pipe(Effect.as(false)),
          ),
        );

        if (reaped) {
          reapedCount += 1;
        }
      }

      // Threads whose binding is gone can never clear their own entry.
      const sweptThreadIds = new Set(bindings.map((binding) => binding.threadId));
      for (const threadId of noticedStallKeyByThreadId.keys()) {
        if (!sweptThreadIds.has(threadId)) {
          noticedStallKeyByThreadId.delete(threadId);
        }
      }

      if (reapedCount > 0 || recoveredZombieCount > 0) {
        yield* Effect.logInfo("provider.session.reaper.sweep-complete", {
          reapedCount,
          recoveredZombieCount,
          totalBindings: bindings.length,
        });
      }
    });

    const start: ProviderSessionReaperShape["start"] = () =>
      Effect.gen(function* () {
        yield* forkParked(
          sweep.pipe(
            Effect.catch((error: unknown) =>
              Effect.logWarning("provider.session.reaper.sweep-failed", {
                error,
              }),
            ),
            Effect.catchDefect((defect: unknown) =>
              Effect.logWarning("provider.session.reaper.sweep-defect", {
                defect,
              }),
            ),
            Effect.repeat(Schedule.spaced(Duration.millis(sweepIntervalMs))),
          ),
        );

        yield* Effect.logInfo("provider.session.reaper.started", {
          inactivityThresholdMs,
          sweepIntervalMs,
          stallThresholdMs,
          deadSessionGraceMs,
        });
      });

    return {
      start,
    } satisfies ProviderSessionReaperShape;
  });

export const makeProviderSessionReaperLive = (options?: ProviderSessionReaperLiveOptions) =>
  Layer.effect(ProviderSessionReaper, makeProviderSessionReaper(options));

export const ProviderSessionReaperLive = makeProviderSessionReaperLive();
