import { describe, expect, it, vi } from "vite-plus/test";

import { LINEAR_HISTORY_STEP_CHANNEL } from "./linearChannels.ts";
import { routeSwipeToLinearTab, setLinearHistoryClaim } from "./linearSwipe.ts";

describe("routeSwipeToLinearTab", () => {
  it("sends swipes to a claiming Linear tab and leaves others to the window", () => {
    const send = vi.fn();
    const webContents = { id: 41, send };

    expect(routeSwipeToLinearTab(webContents, "left")).toBe(false);

    setLinearHistoryClaim(41, true);
    expect(routeSwipeToLinearTab(webContents, "left")).toBe(true);
    expect(routeSwipeToLinearTab(webContents, "right")).toBe(true);
    expect(routeSwipeToLinearTab(webContents, "up")).toBe(false);
    expect(routeSwipeToLinearTab({ id: 42, send }, "left")).toBe(false);
    expect(send.mock.calls).toEqual([
      [LINEAR_HISTORY_STEP_CHANNEL, -1],
      [LINEAR_HISTORY_STEP_CHANNEL, 1],
    ]);

    setLinearHistoryClaim(41, false);
    expect(routeSwipeToLinearTab(webContents, "left")).toBe(false);
  });
});
