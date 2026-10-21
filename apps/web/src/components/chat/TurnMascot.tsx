import claudeStandingPng from "../../assets/claude-standing.png";
import claudeThinkingGif from "../../assets/claude-thinking.gif";
import claudeTypingGif from "../../assets/claude-typing.gif";
import codeySpritesheet from "../../assets/codex-pets/codex-spritesheet.webp";
import styles from "./TurnMascot.module.css";

export type TurnMascotKind = "claude" | "codey";

/** The pixel mascot for a provider driver, or null when the provider has none. */
export function turnMascotForDriver(driverKind: string | null | undefined): TurnMascotKind | null {
  if (driverKind === "claudeAgent") return "claude";
  if (driverKind === "codex") return "codey";
  return null;
}

/**
 * Provider mascot beside a running turn: it types while the agent works and
 * floats while the agent thinks. Reduced motion holds a still frame.
 */
export function TurnMascot({ mascot, thinking }: { mascot: TurnMascotKind; thinking: boolean }) {
  const state = thinking ? "thinking" : "typing";
  return (
    <span aria-hidden className={styles.slot}>
      {mascot === "codey" ? (
        <span
          className={styles.codey}
          data-state={state}
          style={{ backgroundImage: `url(${codeySpritesheet})` }}
        />
      ) : (
        <picture className={styles.picture}>
          <source media="(prefers-reduced-motion: reduce)" srcSet={claudeStandingPng} />
          <img
            src={thinking ? claudeThinkingGif : claudeTypingGif}
            alt=""
            className={styles.claude}
            data-state={state}
          />
        </picture>
      )}
    </span>
  );
}
