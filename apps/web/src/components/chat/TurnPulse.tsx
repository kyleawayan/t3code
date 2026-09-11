import { cn } from "~/lib/utils";

import claudeTypingGif from "../../assets/claude-typing.gif";
import codeySpritesheet from "../../assets/codex-pets/codex-spritesheet.webp";
import styles from "./TurnPulse.module.css";
import type { TurnPulseVerdict } from "./turnPulse.logic";

export type TurnMascot = "claude" | "codey";

/**
 * Liveness gauge for a running turn: a coarse+fine pair.
 *
 * A turn has no total to fill toward, so a single bar cannot both show overall
 * progress and stay legibly in motion — near the top a whole token moves a
 * cumulative fill by a pixel's fraction, and it looks frozen while work
 * continues. So this splits the job. The top track is cumulative overall
 * progress; the bottom track fills and repeats once per chunk of output, so
 * something is always visibly moving no matter how much has come before. Both
 * hold during silent phases. During thinking the lower track instead shows
 * indeterminate activity, while the upper track retains measured output.
 *
 * Growing means output is arriving; frozen means it stopped; dim means working
 * but quiet (a tool, or awaiting the first token); red means stalled.
 */
export function TurnPulse({
  verdict,
  mascot,
}: {
  verdict: TurnPulseVerdict;
  /** Provider mascot perched above the bar. */
  mascot?: TurnMascot | undefined;
}) {
  if (verdict.kind === "hidden") return null;
  const stalled = verdict.kind === "stalled";
  const barColor = stalled ? "bg-red-500" : mascot === "codey" ? "bg-[#6085f7]" : "bg-[#d97757]";
  // Tint both tracks with the fill colour to keep the gauge readable in either theme.
  const trackBg = stalled
    ? "bg-red-500/25"
    : mascot === "codey"
      ? "bg-[#6085f7]/25"
      : "bg-[#d97757]/25";
  // A floor on each so a starting turn shows a sliver rather than nothing.
  const coarsePercent = Math.max(2, Math.min(100, verdict.fill.coarse * 100));
  return (
    <span
      className="relative inline-flex w-10 shrink-0 flex-col gap-[2px]"
      role="status"
      aria-label={
        stalled
          ? "No agent output"
          : verdict.kind === "thinking"
            ? "Agent thinking"
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
      {mascot === "codey" ? (
        <span
          aria-hidden
          className={styles.codey}
          data-state={verdict.kind}
          style={{ backgroundImage: `url(${codeySpritesheet})` }}
        />
      ) : mascot === "claude" ? (
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
      {/* Thinking uses an indeterminate segment; output keeps the existing heartbeat. */}
      <span className={cn("relative block h-[2px] overflow-hidden rounded-full", trackBg)}>
        <span
          className={cn(
            "absolute inset-y-0 left-0 rounded-full opacity-80",
            verdict.kind === "thinking" ? styles.thinkingBar : "w-1 animate-turn-fine-fill",
            barColor,
          )}
          style={{
            animationPlayState:
              verdict.kind === "moving" || verdict.kind === "thinking" ? "running" : "paused",
          }}
        />
      </span>
    </span>
  );
}
