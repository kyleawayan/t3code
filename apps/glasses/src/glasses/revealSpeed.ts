import { Atom } from "effect/unstable/reactivity";

import { appAtomRegistry } from "../connection/runtime";

/**
 * How fast agent replies type out on the glasses, in characters per second.
 * `null` shows new text at once. Adjusted from the phone page and kept in
 * localStorage so it survives Even App relaunches like the pairing catalog.
 */
export type RevealSpeed = number | null;

export const REVEAL_SPEED_MIN = 10;
export const REVEAL_SPEED_MAX = 120;
export const REVEAL_SPEED_STEP = 5;
export const DEFAULT_REVEAL_SPEED = 50;

const STORAGE_KEY = "t3code-glasses:reveal-speed:v1";

export function clampRevealSpeed(value: number): number {
  const stepped = Math.round(value / REVEAL_SPEED_STEP) * REVEAL_SPEED_STEP;
  return Math.min(REVEAL_SPEED_MAX, Math.max(REVEAL_SPEED_MIN, stepped));
}

/** Characters the reveal cursor advances per ticker run, never stalling at zero. */
export function revealCharsPerTick(speed: number, tickMs: number): number {
  return Math.max(1, Math.round((speed * tickMs) / 1000));
}

export function parseStoredRevealSpeed(raw: string | null): RevealSpeed {
  if (raw === null) {
    return DEFAULT_REVEAL_SPEED;
  }
  if (raw === "instant") {
    return null;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? clampRevealSpeed(parsed) : DEFAULT_REVEAL_SPEED;
}

function loadRevealSpeed(): RevealSpeed {
  try {
    return parseStoredRevealSpeed(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_REVEAL_SPEED;
  }
}

export const revealSpeedAtom = Atom.make<RevealSpeed>(loadRevealSpeed()).pipe(
  Atom.keepAlive,
  Atom.withLabel("glasses-reveal-speed"),
);

export function setRevealSpeed(speed: RevealSpeed) {
  const next = speed === null ? null : clampRevealSpeed(speed);
  appAtomRegistry.set(revealSpeedAtom, next);
  try {
    window.localStorage.setItem(STORAGE_KEY, next === null ? "instant" : String(next));
  } catch {
    // Storage can be unavailable in the simulator; the in-memory value still applies.
  }
}
