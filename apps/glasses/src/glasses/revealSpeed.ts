import { Atom } from "effect/unstable/reactivity";

import { hostStorage } from "../connection/hostStorage";
import { appAtomRegistry } from "../connection/runtime";

/**
 * How fast agent replies type out on the glasses, in characters per second.
 * `null` shows new text at once. Adjusted from the phone page and kept in
 * the Even App's storage so it survives relaunches like the pairing catalog.
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

export const revealSpeedAtom = Atom.make<RevealSpeed>(DEFAULT_REVEAL_SPEED).pipe(
  Atom.keepAlive,
  Atom.withLabel("glasses-reveal-speed"),
);

// Storage answers asynchronously (a bridge round trip inside the Even App);
// a slider move that lands first wins over the stored value.
let touched = false;
void hostStorage.getItem(STORAGE_KEY).then((raw) => {
  if (!touched && raw !== null) {
    appAtomRegistry.set(revealSpeedAtom, parseStoredRevealSpeed(raw));
  }
});

// The slider fires on every pixel and bridge writes share the BLE link with
// rendering, so only the settled value is written.
const PERSIST_DEBOUNCE_MS = 400;
let persistTimer: ReturnType<typeof setTimeout> | null = null;

export function setRevealSpeed(speed: RevealSpeed) {
  const next = speed === null ? null : clampRevealSpeed(speed);
  touched = true;
  appAtomRegistry.set(revealSpeedAtom, next);
  if (persistTimer !== null) {
    clearTimeout(persistTimer);
  }
  persistTimer = setTimeout(() => {
    persistTimer = null;
    void hostStorage
      .setItem(STORAGE_KEY, next === null ? "instant" : String(next))
      .catch((cause: unknown) => console.warn("[glasses] typing speed not saved", cause));
  }, PERSIST_DEBOUNCE_MS);
}
