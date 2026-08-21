import { cn } from "~/lib/utils";

import type { TurnPulseVerdict } from "./turnPulse.logic";

/**
 * Liveness bar for a running turn.
 *
 * A single bar that fills with how much the agent has actually generated. It
 * only ever grows, and its growth slows as it goes — approaching full without
 * ever arriving, because a turn has no knowable end and a bar that reaches
 * 100% would be claiming one. Growing means output is arriving; frozen means it
 * stopped. That is the whole reading, and it needs no legend.
 *
 * Earlier versions swept a band across a track. It was honest but unreadable —
 * motion with no memory cannot answer "how far along", and two bands crossing
 * looked like noise. Filling carries the same truth and can be read at a
 * glance.
 */
export function TurnPulse({ verdict }: { verdict: TurnPulseVerdict }) {
  if (verdict.kind === "hidden") return null;
  const stalled = verdict.kind === "stalled";
  // Working with a reason to be quiet: a tool is running, a question is
  // waiting, or the model has not sent its first token back yet. The bar holds
  // where it is and dims, so it never claims output that has not arrived.
  const holding = verdict.kind === "paused" || verdict.kind === "waiting";
  const percent = Math.max(2, Math.min(100, verdict.travel * 100));
  return (
    <span
      className={cn(
        "relative inline-block h-[3px] w-10 shrink-0 overflow-hidden rounded-full",
        stalled ? "bg-orange-500/25" : "bg-muted-foreground/15",
      )}
      role="status"
      aria-label={
        stalled
          ? "No agent output"
          : verdict.kind === "paused"
            ? "Agent running a tool"
            : verdict.kind === "waiting"
              ? "Waiting for agent output"
              : "Agent output streaming"
      }
      data-turn-travel={verdict.travel.toFixed(4)}
      data-turn-chunks={verdict.tokenChunks}
    >
      <span
        className={cn(
          "absolute inset-y-0 left-0 rounded-full",
          // Eases toward each new width so growth reads as motion rather than
          // a jump — but only ever toward a width real output paid for.
          "transition-[width,background-color] duration-500 ease-out",
          stalled ? "bg-orange-500" : holding ? "bg-muted-foreground/40" : "bg-sky-500",
        )}
        style={{ width: `${percent}%` }}
      />
    </span>
  );
}
