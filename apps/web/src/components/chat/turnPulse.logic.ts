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

/**
 * The same warning, for a turn that is between activities rather than
 * mid-sentence.
 *
 * Silence means different things in the two cases. Tokens that were flowing and
 * stopped is abnormal within seconds. Waiting for the *first* token — at turn
 * start, or after a tool result hands a large context back to the model — is
 * routinely ten to twenty seconds and entirely healthy. Judging both on the
 * short clock painted every gap between tool calls orange, which is worse than
 * no warning at all: an indicator that cries wolf gets ignored the once it
 * matters.
 */
export const TURN_PULSE_QUIET_WARN_AFTER_MS = 45_000;

export type TurnPulseVerdict =
  /** Nothing to show: no turn running. */
  | { readonly kind: "hidden" }
  /**
   * Working, but not emitting — a tool is running or a question is waiting.
   * Distinct from stalled: this silence has a reason, so it must never alarm.
   */
  | { readonly kind: "paused"; readonly tokenChunks: number; readonly travel: number }
  /**
   * The turn should be producing and has not started yet — before the first
   * token, or after a tool result while the model reads the context back.
   * Calling this "streaming" claimed output that had not arrived, which is why
   * the bar appeared frozen at the start of every turn.
   */
  | { readonly kind: "waiting"; readonly tokenChunks: number; readonly travel: number }
  /** Tokens are arriving. `tokenChunks` only ever advances on a real token. */
  | { readonly kind: "moving"; readonly tokenChunks: number; readonly travel: number }
  /** Should be producing and is not. */
  | {
      readonly kind: "stalled";
      readonly quietForMs: number;
      readonly tokenChunks: number;
      readonly travel: number;
    };

/**
 * Output that fills the bar to roughly two thirds.
 *
 * The fill is asymptotic — it approaches full and never arrives — so it can
 * grow with real work without ever claiming the turn is nearly done, which a
 * turn with no knowable end cannot honestly say.
 */
const TOKENS_TO_TWO_THIRDS = 400;
/** Frames standing in for volume when a provider reports none. */
const FRAMES_TO_TWO_THIRDS = 30;

/**
 * How full the bar is, from 0 to just under 1.
 *
 * Real generated volume when the provider reports it, so a burst fills visibly
 * faster than a grind; frame count stands in for providers that stream deltas
 * but no measurable text. Growth slows as it goes, which reads as "still
 * going" rather than "nearly done", and it only ever moves forward — a bar
 * that resets mid-turn reads as losing progress.
 */
function resolveTravel(activity: ThreadTurnActivity): number {
  const units =
    activity.generatedTokens !== undefined
      ? activity.generatedTokens / TOKENS_TO_TWO_THIRDS
      : activity.tokenChunks / FRAMES_TO_TWO_THIRDS;
  return 1 - Math.exp(-units);
}

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
  readonly quietWarnAfterMs?: number;
}): TurnPulseVerdict {
  const activity = input.activity;
  if (!activity) return { kind: "hidden" };
  if (activity.state === "idle") return { kind: "hidden" };
  // A tool call and a pending question are silent by nature, so they never
  // alarm — but they keep the same widget. Swapping it out for a different
  // indicator mid-turn made the row flicker between two shapes every time the
  // agent touched a tool, which is exactly the churn this is meant to remove.
  if (activity.state === "tool" || activity.state === "waiting") {
    return {
      kind: "paused",
      tokenChunks: activity.tokenChunks,
      travel: resolveTravel(activity),
    };
  }
  const updatedAtMs = Date.parse(activity.updatedAt);
  if (Number.isNaN(updatedAtMs)) {
    return { kind: "moving", tokenChunks: activity.tokenChunks, travel: resolveTravel(activity) };
  }
  const quietForMs = Math.max(0, input.nowMs - updatedAtMs);
  const travel = resolveTravel(activity);
  // "generating" means the last thing we saw was a token, so staleness here is
  // output that stopped mid-stream. "quiet" means we are waiting on the first
  // token of a stretch, which is legitimately slow.
  const threshold =
    activity.state === "generating"
      ? (input.warnAfterMs ?? TURN_PULSE_WARN_AFTER_MS)
      : (input.quietWarnAfterMs ?? TURN_PULSE_QUIET_WARN_AFTER_MS);
  if (quietForMs >= threshold) {
    return { kind: "stalled", quietForMs, tokenChunks: activity.tokenChunks, travel };
  }
  return activity.state === "generating"
    ? { kind: "moving", tokenChunks: activity.tokenChunks, travel }
    : { kind: "waiting", tokenChunks: activity.tokenChunks, travel };
}

/** Whole seconds of silence, for the warning copy. */
export function formatQuietFor(quietForMs: number): string {
  const seconds = Math.floor(quietForMs / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
