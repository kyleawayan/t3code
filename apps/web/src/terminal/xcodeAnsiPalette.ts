import type { GhosttyColor } from "./ghostty/core";

// Ghostty's official "Xcode Dark hc" / "Xcode Light hc" ANSI palettes, verbatim.
// The high-contrast variants pair with the app's xcode-hc-{dark,light} diff
// themes (backgrounds #1f1f24 / #ffffff match exactly).
const hex = (value: string): GhosttyColor => ({
  r: Number.parseInt(value.slice(1, 3), 16),
  g: Number.parseInt(value.slice(3, 5), 16),
  b: Number.parseInt(value.slice(5, 7), 16),
});

export const XCODE_ANSI_DARK: readonly GhosttyColor[] = [
  "#43454b",
  "#ff8a7a",
  "#83c9bc",
  "#d9c668",
  "#4ec4e6",
  "#ff85b8",
  "#cda1ff",
  "#ffffff",
  "#838991",
  "#ff8a7a",
  "#b1faeb",
  "#ffa14f",
  "#6bdfff",
  "#ff85b8",
  "#e5cfff",
  "#ffffff",
].map(hex);

export const XCODE_ANSI_LIGHT: readonly GhosttyColor[] = [
  "#b4d8fd",
  "#ad1805",
  "#355d61",
  "#78492a",
  "#0058a1",
  "#9c2191",
  "#703daa",
  "#000000",
  "#8a99a6",
  "#ad1805",
  "#174145",
  "#78492a",
  "#003f73",
  "#9c2191",
  "#441ea1",
  "#000000",
].map(hex);
