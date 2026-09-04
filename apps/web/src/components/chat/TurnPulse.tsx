import { cn } from "~/lib/utils";

import claudeTypingGif from "../../assets/claude-typing.gif";
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
export function TurnPulse({
  verdict,
  mascot = false,
}: {
  verdict: TurnPulseVerdict;
  /** Show the Claude mascot perched above the bar. Claude threads only. */
  mascot?: boolean;
}) {
  if (verdict.kind === "hidden") return null;
  const stalled = verdict.kind === "stalled";
  // The whole turn is Claude's orange — including the pre-first-token wait and
  // tool pauses, which are still the turn working. The frozen fine bar already
  // signals a pause, so colour need not; only a stall changes it, to red.
  const barColor = stalled ? "bg-red-500" : "bg-[#d97757]";
  // Track is a dim tint of the fill's own colour, not grey: a mid-tone grey sits
  // at nearly the same luminance as the orange fill and the two blend. A faint
  // orange track keeps the solid fill clearly readable against it in both themes
  // and reads as the bar filling its own colour.
  const trackBg = stalled ? "bg-red-500/25" : "bg-[#d97757]/25";
  // A floor on each so a starting turn shows a sliver rather than nothing.
  const coarsePercent = Math.max(2, Math.min(100, verdict.fill.coarse * 100));
  return (
    <span
      className="relative inline-flex w-10 shrink-0 flex-col gap-[2px]"
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
      {mascot ? (
        // In normal flow above the bars, not absolutely positioned: the row's
        // height grows to include it, so the `contain: content` item wrapper
        // cannot clip its head (an absolutely-positioned gif poking above the
        // row box gets cut). The negative bottom margin pulls the bars up under
        // its feet — the gif has transparent foot padding — and is the knob for
        // how much the feet overlap the bar. Pixelated keeps the art crisp.
        <img
          src={claudeTypingGif}
          alt=""
          aria-hidden
          className="pointer-events-none -mb-[1px] h-6 w-auto self-start [image-rendering:pixelated]"
        />
      ) : null}
      {/* Overall progress: cumulative, only ever forward. */}
      <span className={cn("relative block h-[3px] overflow-hidden rounded-full", trackBg)}>
        <span
          className={cn(
            "absolute inset-y-0 left-0 rounded-full transition-[width,background-color] duration-500 ease-out",
            barColor,
          )}
          style={{ width: `${coarsePercent}%` }}
        />
      </span>
      {/* Current chunk heartbeat: rises to full, touches 100 for a beat, then
          the loop cuts instantly back to empty and repeats. Runs only while
          generating; holding or stalled freezes it where it is, so it still
          reads as liveness rather than decoration. */}
      <span className="relative block h-[2px] overflow-hidden rounded-full bg-[#d97757]/20">
        <span
          className={cn(
            "absolute inset-y-0 left-0 w-1 rounded-full opacity-80 animate-turn-fine-fill",
            barColor,
          )}
          style={{ animationPlayState: verdict.kind === "moving" ? "running" : "paused" }}
        />
      </span>
    </span>
  );
}
