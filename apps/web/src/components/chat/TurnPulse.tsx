import { cn } from "~/lib/utils";

import type { TurnPulseVerdict } from "./turnPulse.logic";

/** How far one token chunk carries the pulse, as a fraction of the track. */
const TRAVEL_PER_CHUNK = 0.06;

/**
 * Liveness pulse for a running turn.
 *
 * A dash that travels the track by a fixed step per token chunk, so it advances
 * only on output that really arrived. That is the whole point: an animation on
 * a timer looks identical whether the agent is working or wedged, which is what
 * makes a spinner useless precisely when you need it. This one stops when the
 * tokens stop, so a glance answers the question without reading anything.
 */
export function TurnPulse({ verdict }: { verdict: TurnPulseVerdict }) {
  if (verdict.kind === "hidden") return null;
  const stalled = verdict.kind === "stalled";
  // Wraps rather than filling toward an end: a turn has no knowable finish, and
  // a bar that claims one is the lie we are trying to remove.
  const offset = ((verdict.tokenChunks * TRAVEL_PER_CHUNK) % 1) * 100;
  return (
    <span
      className={cn(
        "relative inline-block h-[3px] w-8 shrink-0 overflow-hidden rounded-full",
        stalled ? "bg-orange-500/25" : "bg-muted-foreground/20",
      )}
      role="status"
      aria-label={stalled ? "No agent output" : "Agent output streaming"}
    >
      <span
        className={cn(
          "absolute top-0 h-full w-1/3 rounded-full",
          // Eases between updates so the step reads as motion rather than a
          // stutter — but only ever toward a position a token paid for.
          "transition-transform duration-200 ease-linear",
          stalled ? "bg-orange-500" : "bg-sky-500",
        )}
        style={{ transform: `translateX(${offset * 3}%)` }}
      />
    </span>
  );
}
