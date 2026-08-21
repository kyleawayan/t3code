import { cn } from "~/lib/utils";

import type { TurnPulseVerdict } from "./turnPulse.logic";

/**
 * Liveness gauge for a running turn: a coarse+fine pair.
 *
 * A turn has no total to fill toward, so a single bar cannot both show overall
 * progress and stay legibly in motion — near the top a whole token moves a
 * cumulative fill by a pixel's fraction, and it looks frozen while work
 * continues. So this splits the job. The top track is cumulative overall
 * progress; the bottom track fills and repeats once per chunk of output, so
 * something is always visibly moving no matter how much has come before. Both
 * freeze the instant tokens stop, which is the stall.
 *
 * Growing means output is arriving; frozen means it stopped; dim means working
 * but quiet (a tool, or awaiting the first token); orange means stalled.
 */
export function TurnPulse({ verdict }: { verdict: TurnPulseVerdict }) {
  if (verdict.kind === "hidden") return null;
  const stalled = verdict.kind === "stalled";
  // Working with a reason to be quiet: hold both tracks and dim, never alarm.
  const holding = verdict.kind === "paused" || verdict.kind === "waiting";
  const barColor = stalled ? "bg-orange-500" : holding ? "bg-muted-foreground/40" : "bg-sky-500";
  // A floor on each so a starting turn shows a sliver rather than nothing.
  const coarsePercent = Math.max(2, Math.min(100, verdict.fill.coarse * 100));
  const finePercent = Math.max(2, Math.min(100, verdict.fill.fine * 100));
  return (
    <span
      className="inline-flex w-10 shrink-0 flex-col gap-[2px]"
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
      data-turn-coarse={verdict.fill.coarse.toFixed(4)}
      data-turn-fine={verdict.fill.fine.toFixed(4)}
      data-turn-chunks={verdict.tokenChunks}
    >
      {/* Overall progress: cumulative, only ever forward. */}
      <span
        className={cn(
          "relative block h-[3px] overflow-hidden rounded-full",
          stalled ? "bg-orange-500/25" : "bg-muted-foreground/15",
        )}
      >
        <span
          className={cn(
            "absolute inset-y-0 left-0 rounded-full transition-[width,background-color] duration-500 ease-out",
            barColor,
          )}
          style={{ width: `${coarsePercent}%` }}
        />
      </span>
      {/* Current chunk: cycles, so motion stays visible when the overall bar
          has flattened near the top. Dimmer — it is the detail line. */}
      <span className="relative block h-[2px] overflow-hidden rounded-full bg-muted-foreground/10">
        <span
          className={cn(
            "absolute inset-y-0 left-0 rounded-full opacity-70 transition-[width,background-color] duration-300 ease-linear",
            barColor,
          )}
          style={{ width: `${finePercent}%` }}
        />
      </span>
    </span>
  );
}
