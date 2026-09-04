import { describe, expect, it } from "vite-plus/test";

import {
  clampRevealSpeed,
  DEFAULT_REVEAL_SPEED,
  parseStoredRevealSpeed,
  revealCharsPerTick,
} from "./revealSpeed";

describe("revealSpeed", () => {
  it("snaps to the slider step and range", () => {
    expect(clampRevealSpeed(27)).toBe(25);
    expect(clampRevealSpeed(28)).toBe(30);
    expect(clampRevealSpeed(0)).toBe(10);
    expect(clampRevealSpeed(999)).toBe(120);
  });

  it("advances at least one character per tick", () => {
    expect(revealCharsPerTick(25, 200)).toBe(5);
    expect(revealCharsPerTick(120, 200)).toBe(24);
    expect(revealCharsPerTick(1, 200)).toBe(1);
  });

  it("reads stored values and falls back to the default", () => {
    expect(parseStoredRevealSpeed(null)).toBe(DEFAULT_REVEAL_SPEED);
    expect(parseStoredRevealSpeed("instant")).toBeNull();
    expect(parseStoredRevealSpeed("60")).toBe(60);
    expect(parseStoredRevealSpeed("garbage")).toBe(DEFAULT_REVEAL_SPEED);
  });
});
