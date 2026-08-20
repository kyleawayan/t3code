/**
 * ThreadStreamActivityService - in-memory per-thread timestamp of the last
 * observed provider stream event.
 *
 * The stall watchdog (ProviderSessionReaper) uses this to tell a wedged turn
 * (no stream events for many minutes while a turn is active) from a healthy
 * one. Every provider runtime event bumps the thread's timestamp, including
 * thinking/text deltas, so a long "thinking" turn keeps itself fresh and is
 * never mistaken for a stall.
 *
 * Not persisted: after a server restart the map is empty. A missing entry must
 * be treated as "just seen" by callers, never as infinite silence, or every
 * active-turn thread would look stalled on the first sweep after a restart.
 *
 * @module ThreadStreamActivityService
 */
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

export class ThreadStreamActivityService extends Context.Service<
  ThreadStreamActivityService,
  {
    /** Record that a provider stream event was seen for this thread at `atMs`. */
    readonly recordActivity: (threadId: string, atMs: number) => void;

    /** Last activity time in epoch ms, or undefined if none recorded yet. */
    readonly getLastActivityMs: (threadId: string) => number | undefined;

    /** Drop a thread's entry (e.g. on session death). */
    readonly clear: (threadId: string) => void;
  }
>()("t3/orchestration/ThreadStreamActivity/ThreadStreamActivityService") {}

export function make(): ThreadStreamActivityService["Service"] {
  const lastActivityMsByThreadId = new Map<string, number>();

  return {
    recordActivity: (threadId, atMs) => {
      lastActivityMsByThreadId.set(threadId, atMs);
    },
    getLastActivityMs: (threadId) => lastActivityMsByThreadId.get(threadId),
    clear: (threadId) => {
      lastActivityMsByThreadId.delete(threadId);
    },
  };
}

export const layer = Layer.effect(ThreadStreamActivityService, Effect.sync(make));
