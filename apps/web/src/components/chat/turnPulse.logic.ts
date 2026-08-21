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
  /** Nothing to show: no turn, or silence that needs no explanation. */
  | { readonly kind: "hidden" }
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
  // A tool call and a pending question are silent by nature. Showing a frozen
  // pulse through either would train you to ignore it, which costs the one time
  // it means something.
  if (activity.state === "tool" || activity.state === "waiting" || activity.state === "idle") {
    return { kind: "hidden" };
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
