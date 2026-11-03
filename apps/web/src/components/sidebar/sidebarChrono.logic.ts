import * as Schema from "effect/Schema";

/** The display shows HH:MM:SS, so it holds at 99:59:59. */
export const CHRONO_MAX_SECONDS = 99 * 3600 + 59 * 60 + 59;

export const ChronoStateSchema = Schema.Union([
  Schema.Struct({ phase: Schema.Literal("reset") }),
  Schema.Struct({ phase: Schema.Literal("running"), startedAt: Schema.Number }),
  Schema.Struct({ phase: Schema.Literal("stopped"), elapsedSeconds: Schema.Number }),
]);
export type ChronoState = typeof ChronoStateSchema.Type;

export const CHRONO_RESET: ChronoState = { phase: "reset" };

const SECOND_MS = 1000;

/** Successive pushes start, stop, then reset, like the Boeing 737 CHR control. */
export function pressChrono(state: ChronoState, now: number): ChronoState {
  switch (state.phase) {
    case "reset":
      return { phase: "running", startedAt: now };
    case "running":
      return {
        phase: "stopped",
        elapsedSeconds: Math.floor(Math.max(0, now - state.startedAt) / 1000),
      };
    case "stopped":
      return CHRONO_RESET;
  }
}

/** The display text, or null when the display is blank. */
export function chronoDisplay(state: ChronoState, now: number): string | null {
  switch (state.phase) {
    case "reset":
      return null;
    case "running":
      return formatChronoSeconds(Math.max(0, now - state.startedAt) / 1000);
    case "stopped":
      return formatChronoSeconds(state.elapsedSeconds);
  }
}

/** Milliseconds until a chrono started at `startedAt` next changes its display, or null once capped. */
export function msUntilNextChronoTick(startedAt: number, now: number): number | null {
  const elapsedMs = Math.max(0, now - startedAt);
  if (elapsedMs >= CHRONO_MAX_SECONDS * SECOND_MS) return null;
  return SECOND_MS - (elapsedMs % SECOND_MS);
}

export function formatChronoSeconds(totalSeconds: number): string {
  const seconds = Math.min(CHRONO_MAX_SECONDS, Math.floor(Math.max(0, totalSeconds)));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(seconds / 3600))}:${pad(Math.floor(seconds / 60) % 60)}:${pad(seconds % 60)}`;
}
