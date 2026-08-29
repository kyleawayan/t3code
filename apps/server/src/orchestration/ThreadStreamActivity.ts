/**
 * ThreadStreamActivityService - in-memory per-thread liveness for a running
 * turn: when the provider last streamed anything, and whether the thread is
 * currently in a state where silence is expected.
 *
 * The sidebar stall pill (via ProjectionSnapshotQuery) uses this to tell a
 * wedged turn from a healthy quiet one. Every provider runtime event bumps the
 * thread's
 * timestamp, including thinking/text deltas, so a long "thinking" turn keeps
 * itself fresh and is never mistaken for a stall.
 *
 * Silence alone is not enough to judge a Claude turn, because the CLI goes
 * genuinely quiet in states that are perfectly healthy:
 *
 *   - A foreground tool call streams NOTHING between the tool_use block and
 *     the tool_result. `tool_progress` heartbeats exist but the CLI gates them
 *     behind CLAUDE_CODE_REMOTE / CLAUDE_CODE_CONTAINER_ID, neither of which
 *     T3 sets, so a Bash call is silent for its whole run — up to the CLI's
 *     600s default cap, and an MCP tool's default timeout is measured in hours.
 *   - Context compaction emits a start marker, then one long summarization
 *     call, then a boundary. The middle is silent for as long as the summary
 *     takes.
 *
 * So the thread also tracks open tool calls and compaction, and those states
 * suppress the stall verdict outright rather than widening a threshold.
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

/**
 * Silence past this long, in a state where the provider should be streaming,
 * is worth telling the user about. Bounded from below by what a healthy turn
 * does: deltas stream as generated, the CLI emits a "requesting" status at
 * request start, and its API retry loop re-announces every 30s — so a healthy
 * gap outside the exempt states is seconds, not minutes.
 */
export const STALL_WARN_MS = 2 * 60 * 1000;

export interface ThreadStalledInput {
  readonly activeTurnId: string | null | undefined;
  readonly lastActivityMs: number | undefined;
  readonly nowMs: number;
  readonly thresholdMs: number;
  readonly hasPendingApprovals: boolean;
  readonly hasPendingUserInput: boolean;
  readonly backgroundLiveness: "working" | "monitoring" | null | undefined;
  /** A tool call is open: the provider streams nothing until it returns. */
  readonly hasOpenToolCall?: boolean | undefined;
  /** Compaction is running: one long summarization call, no progress events. */
  readonly isCompacting?: boolean | undefined;
  /**
   * Threshold to use instead when a tool call is open or compaction is running.
   * Omitted means those states are exempt outright — which is what the warning
   * and the sidebar pill want, since a running tool is not news.
   */
  readonly quietStateThresholdMs?: number | undefined;
}

/**
 * A turn is "stalled" (wedged) when it is active but has streamed nothing past
 * `thresholdMs` from a state in which it should have. A missing activity entry
 * (e.g. right after a restart) is treated as fresh, never as silence. Consumed
 * by ProjectionSnapshotQuery to drive the sidebar stall pill. Detection only:
 * nothing acts on this verdict to stop a turn.
 */
export const computeThreadStalled = (input: ThreadStalledInput): boolean => {
  if (input.activeTurnId == null) return false;
  if (input.lastActivityMs === undefined) return false;
  // Waiting on a person, or on background work that outlives the turn, is
  // unbounded by nature — neither can ever be called wedged.
  if (input.hasPendingApprovals || input.hasPendingUserInput) return false;
  if (input.backgroundLiveness != null) return false;

  // A running tool or a compaction explains silence, so it is judged on a much
  // longer clock — or on none at all, for callers that only want to warn.
  const inQuietState = input.hasOpenToolCall === true || input.isCompacting === true;
  if (inQuietState && input.quietStateThresholdMs === undefined) return false;
  const thresholdMs = inQuietState ? input.quietStateThresholdMs! : input.thresholdMs;
  return input.nowMs - input.lastActivityMs >= thresholdMs;
};

export class ThreadStreamActivityService extends Context.Service<
  ThreadStreamActivityService,
  {
    /** Record that a provider stream event was seen for this thread at `atMs`. */
    readonly recordActivity: (threadId: string, atMs: number) => void;

    /** Last activity time in epoch ms, or undefined if none recorded yet. */
    readonly getLastActivityMs: (threadId: string) => number | undefined;

    /** A tool call opened; silence is expected until it closes. */
    readonly openToolCall: (threadId: string, itemId: string) => void;

    /** A tool call closed (completed, failed, or denied). */
    readonly closeToolCall: (threadId: string, itemId: string) => void;

    readonly hasOpenToolCall: (threadId: string) => boolean;

    /** Compaction started or ended; silence is expected while it runs. */
    readonly setCompacting: (threadId: string, compacting: boolean) => void;

    readonly isCompacting: (threadId: string) => boolean;

    /** Drop a thread's entry (e.g. on session death). */
    readonly clear: (threadId: string) => void;
  }
>()("t3/orchestration/ThreadStreamActivity/ThreadStreamActivityService") {}

export function make(): ThreadStreamActivityService["Service"] {
  const lastActivityMsByThreadId = new Map<string, number>();
  const openToolItemIdsByThreadId = new Map<string, Set<string>>();
  const compactingThreadIds = new Set<string>();

  return {
    recordActivity: (threadId, atMs) => {
      lastActivityMsByThreadId.set(threadId, atMs);
    },
    getLastActivityMs: (threadId) => lastActivityMsByThreadId.get(threadId),
    openToolCall: (threadId, itemId) => {
      const open = openToolItemIdsByThreadId.get(threadId);
      if (open) {
        open.add(itemId);
        return;
      }
      openToolItemIdsByThreadId.set(threadId, new Set([itemId]));
    },
    closeToolCall: (threadId, itemId) => {
      const open = openToolItemIdsByThreadId.get(threadId);
      if (!open) return;
      open.delete(itemId);
      if (open.size === 0) {
        openToolItemIdsByThreadId.delete(threadId);
      }
    },
    hasOpenToolCall: (threadId) => (openToolItemIdsByThreadId.get(threadId)?.size ?? 0) > 0,
    setCompacting: (threadId, compacting) => {
      if (compacting) {
        compactingThreadIds.add(threadId);
        return;
      }
      compactingThreadIds.delete(threadId);
    },
    isCompacting: (threadId) => compactingThreadIds.has(threadId),
    clear: (threadId) => {
      lastActivityMsByThreadId.delete(threadId);
      openToolItemIdsByThreadId.delete(threadId);
      compactingThreadIds.delete(threadId);
    },
  };
}

export const layer = Layer.effect(ThreadStreamActivityService, Effect.sync(make));
