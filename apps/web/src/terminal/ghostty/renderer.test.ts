import { describe, expect, it } from "vite-plus/test";

import { measureGhosttyCell } from "./renderer";

describe("measureGhosttyCell", () => {
  it("uses descender-aware metrics and a 1.2 line-height", () => {
    const measureText = (text: string) =>
      text === "M"
        ? { width: 7.2, actualBoundingBoxAscent: 9, actualBoundingBoxDescent: 0 }
        : { width: 14.4, actualBoundingBoxAscent: 9, actualBoundingBoxDescent: 3 };
    const context = {
      font: "",
      measureText,
    } as unknown as CanvasRenderingContext2D;

    expect(measureGhosttyCell(context, 12, "monospace")).toEqual({
      width: 7.2,
      height: 14,
      baseline: 10,
    });
  });
});
