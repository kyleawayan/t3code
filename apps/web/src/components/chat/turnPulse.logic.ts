import type { ThreadTurnActivity } from "@t3tools/contracts";

/**
 * How long a turn may produce nothing, in a state where it should be producing,
 * before the pulse says so.
 *
 * Short on purpose. Every state where silence is legitimate — a running tool, a
 * question waiting on you — is a distinct activity state that hides the pulse
 * outright, so what is left is a turn that should be streaming. Healthy gaps
 * there are sub-second, and the CLI announces even its API retries, so ten
 * seconds of nothing is already unusual.
 */
export const TURN_PULSE_WARN_AFTER_MS = 10_000;

export type TurnPulseVerdict =
  /** Nothing to show: no turn running. */
  | { readonly kind: "hidden" }
  /**
   * Working, but not emitting — a tool is running or a question is waiting.
   * Distinct from stalled: this silence has a reason, so it must never alarm.
   */
  | { readonly kind: "paused"; readonly tokenChunks: number }
  /** Tokens are arriving. `tokenChunks` only ever advances on a real token. */
  | { readonly kind: "moving"; readonly tokenChunks: number }
  /** Should be producing and is not. */
  | { readonly kind: "stalled"; readonly quietForMs: number; readonly tokenChunks: number };

/**
 * Decide what the liveness pulse should show.
 *
 * The pulse is deliberately not a progress bar: a turn has no knowable end, so
 * anything that fills toward one is inventing a number. What it reports is
 * narrower and true — whether output is arriving right now — which is the
 * question a spinner cannot answer and the one that matters when a thread
 * silently wedges.
 */
export function resolveTurnPulse(input: {
  readonly activity: ThreadTurnActivity | undefined;
  readonly nowMs: number;
  readonly warnAfterMs?: number;
}): TurnPulseVerdict {
  const activity = input.activity;
  if (!activity) return { kind: "hidden" };
  if (activity.state === "idle") return { kind: "hidden" };
  // A tool call and a pending question are silent by nature, so they never
  // alarm — but they keep the same widget. Swapping it out for a different
  // indicator mid-turn made the row flicker between two shapes every time the
  // agent touched a tool, which is exactly the churn this is meant to remove.
  if (activity.state === "tool" || activity.state === "waiting") {
    return { kind: "paused", tokenChunks: activity.tokenChunks };
  }
  const updatedAtMs = Date.parse(activity.updatedAt);
  if (Number.isNaN(updatedAtMs)) {
    return { kind: "moving", tokenChunks: activity.tokenChunks };
  }
  const quietForMs = Math.max(0, input.nowMs - updatedAtMs);
  return quietForMs >= (input.warnAfterMs ?? TURN_PULSE_WARN_AFTER_MS)
    ? { kind: "stalled", quietForMs, tokenChunks: activity.tokenChunks }
    : { kind: "moving", tokenChunks: activity.tokenChunks };
}

/** Whole seconds of silence, for the warning copy. */
export function formatQuietFor(quietForMs: number): string {
  const seconds = Math.floor(quietForMs / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
