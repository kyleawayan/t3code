import { cn } from "~/lib/utils";

import type { TurnPulseVerdict } from "./turnPulse.logic";

/**
 * Liveness pulse for a running turn.
 *
 * A soft band of light that sweeps across the track and off its right edge,
 * carried by how much the agent has actually generated. Not a slider and not a
 * progress bar: it never rests at a position you could read as a value, and it
 * has no destination to fill toward — a turn has no knowable end, and a bar
 * that claims one is the lie this replaces.
 *
 * Everything it does is paid for by real output. An indicator that animates on
 * a timer looks identical whether the agent is working or wedged, which is what
 * makes a spinner useless exactly when it matters. This one stops dead when the
 * tokens stop, so a glance answers the question without reading anything.
 */
export function TurnPulse({ verdict }: { verdict: TurnPulseVerdict }) {
  if (verdict.kind === "hidden") return null;
  const stalled = verdict.kind === "stalled";
  // Working with a reason to be silent (a tool, a pending question): same
  // widget, held still and muted, so the row never swaps shape mid-turn.
  const paused = verdict.kind === "paused";
  // Fractional lap position. The band is wider than the track and starts fully
  // off to the left, so it enters, crosses, and exits — there is no moment
  // where it reads as parked at a percentage.
  const lap = ((verdict.travel % 1) + 1) % 1;
  const offsetPercent = -100 + lap * 200;
  return (
    <span
      className={cn(
        "relative inline-block h-[3px] w-10 shrink-0 overflow-hidden rounded-full",
        stalled ? "bg-orange-500/25" : "bg-muted-foreground/15",
      )}
      role="status"
      aria-label={
        stalled ? "No agent output" : paused ? "Agent running a tool" : "Agent output streaming"
      }
    >
      <span
        className={cn(
          "absolute inset-y-0 w-full rounded-full",
          // Eases between updates so the step reads as flow rather than a
          // stutter — but only ever toward a position output paid for.
          "transition-transform duration-300 ease-linear",
          // Faded at both ends: a smear of light, never an edge you could
          // mistake for a handle.
          stalled
            ? "bg-gradient-to-r from-transparent via-orange-500 to-transparent"
            : paused
              ? "bg-gradient-to-r from-transparent via-muted-foreground/45 to-transparent"
              : "bg-gradient-to-r from-transparent via-sky-500 to-transparent",
        )}
        style={{ transform: `translateX(${offsetPercent}%)` }}
      />
    </span>
  );
}
