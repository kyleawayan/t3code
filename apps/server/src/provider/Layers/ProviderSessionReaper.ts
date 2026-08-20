import * as Clock from "effect/Clock";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schedule from "effect/Schedule";

import { ProjectionSnapshotQuery } from "../../orchestration/Services/ProjectionSnapshotQuery.ts";
import { ProviderSessionDirectory } from "../Services/ProviderSessionDirectory.ts";
import {
  ProviderSessionReaper,
  type ProviderSessionReaperShape,
} from "../Services/ProviderSessionReaper.ts";
import { forkParked } from "../../serverActivation.ts";
import { ProviderService } from "../Services/ProviderService.ts";
import { ThreadStreamActivityService } from "../../orchestration/ThreadStreamActivity.ts";

const DEFAULT_INACTIVITY_THRESHOLD_MS = 30 * 60 * 1000;
const DEFAULT_SWEEP_INTERVAL_MS = 2 * 60 * 1000;
// Stall watchdog: an active turn with no provider stream events for this long
// is treated as wedged. Currently detection-only (logs), so it errs toward
// surfacing candidates; raise to ~15 min when the reap action is enabled.
const DEFAULT_STALL_THRESHOLD_MS = 8 * 60 * 1000;

export interface ProviderSessionReaperLiveOptions {
  readonly inactivityThresholdMs?: number;
  readonly sweepIntervalMs?: number;
  readonly stallThresholdMs?: number;
}

const makeProviderSessionReaper = (options?: ProviderSessionReaperLiveOptions) =>
  Effect.gen(function* () {
    const providerService = yield* ProviderService;
    const directory = yield* ProviderSessionDirectory;
    const projectionSnapshotQuery = yield* ProjectionSnapshotQuery;
    const threadStreamActivity = yield* ThreadStreamActivityService;

    const inactivityThresholdMs = Math.max(
      1,
      options?.inactivityThresholdMs ?? DEFAULT_INACTIVITY_THRESHOLD_MS,
    );
    const sweepIntervalMs = Math.max(1, options?.sweepIntervalMs ?? DEFAULT_SWEEP_INTERVAL_MS);
    const stallThresholdMs = Math.max(1, options?.stallThresholdMs ?? DEFAULT_STALL_THRESHOLD_MS);

    const sweep = Effect.gen(function* () {
      const bindings = yield* directory.listBindings();
      const now = yield* Clock.currentTimeMillis;
      let reapedCount = 0;

      for (const binding of bindings) {
        if (binding.status === "stopped") {
          continue;
        }

        // Stall watchdog (detection-only): an active turn that has emitted no
        // provider stream events for stallThresholdMs is likely wedged. We only
        // log a candidate here — the reap action stays gated off until the
        // signal is validated against real logs. Exempt threads waiting on the
        // human (approvals / user-input) or running background work, so a
        // healthy-but-quiet turn is never flagged.
        const stallThread = yield* projectionSnapshotQuery
          .getThreadShellById(binding.threadId)
          .pipe(Effect.map(Option.getOrUndefined));
        const stallActiveTurnId = stallThread?.session?.activeTurnId ?? null;
        if (stallActiveTurnId != null) {
          const lastActivityMs = threadStreamActivity.getLastActivityMs(binding.threadId);
          if (lastActivityMs === undefined) {
            // Never treat a missing entry (e.g. right after a restart) as
            // infinite silence — seed it so the thread gets a full window.
            threadStreamActivity.recordActivity(binding.threadId, now);
          } else if (
            now - lastActivityMs >= stallThresholdMs &&
            stallThread?.hasPendingApprovals !== true &&
            stallThread?.hasPendingUserInput !== true &&
            stallThread?.backgroundLiveness == null
          ) {
            yield* Effect.logWarning("provider.session.stall-detected", {
              threadId: binding.threadId,
              provider: binding.provider,
              activeTurnId: stallActiveTurnId,
              silenceMs: now - lastActivityMs,
              stallThresholdMs,
              mode: "watch-only",
            });
          }
        }

        const lastSeenMs = Date.parse(binding.lastSeenAt);
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

        const thread = yield* projectionSnapshotQuery
          .getThreadShellById(binding.threadId)
          .pipe(Effect.map(Option.getOrUndefined));
        if (thread?.session?.activeTurnId != null) {
          yield* Effect.logDebug("provider.session.reaper.skipped-active-turn", {
            threadId: binding.threadId,
            activeTurnId: thread.session.activeTurnId,
            idleDurationMs,
          });
          continue;
        }

        // The turn can settle while background work runs on (subagent
        // fleets, workflow runs, Monitor watch loops). Those live inside the
        // provider process, so stopping the session would kill them silently,
        // and nothing bumps lastSeenAt between turns.
        if (thread?.backgroundLiveness != null) {
          yield* Effect.logDebug("provider.session.reaper.skipped-background-work", {
            threadId: binding.threadId,
            backgroundLiveness: thread.backgroundLiveness,
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

      if (reapedCount > 0) {
        yield* Effect.logInfo("provider.session.reaper.sweep-complete", {
          reapedCount,
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
        });
      });

    return {
      start,
    } satisfies ProviderSessionReaperShape;
  });

export const makeProviderSessionReaperLive = (options?: ProviderSessionReaperLiveOptions) =>
  Layer.effect(ProviderSessionReaper, makeProviderSessionReaper(options));

export const ProviderSessionReaperLive = makeProviderSessionReaperLive();
