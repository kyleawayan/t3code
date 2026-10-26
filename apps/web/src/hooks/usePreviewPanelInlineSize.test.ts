import { describe, expect, it } from "vite-plus/test";

import { getPreviewPanelMaxWidth } from "./usePreviewPanelInlineSize";

describe("getPreviewPanelMaxWidth", () => {
  it("leaves the chat column only its 150px floor when the flex row is known", () => {
    expect(getPreviewPanelMaxWidth(1_512, 1_100)).toBe(950);
    expect(getPreviewPanelMaxWidth(1_512, 1_100.6)).toBe(950);
  });

  it("never drops the panel below its own minimum", () => {
    expect(getPreviewPanelMaxWidth(1_000, 400)).toBe(360);
  });
});
