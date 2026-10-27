import { describe, expect, it } from "vite-plus/test";
import {
  resolvePreferredThreadSidebarWidth,
  THREAD_SIDEBAR_DEFAULT_WIDTH,
  THREAD_SIDEBAR_MIN_WIDTH,
} from "./threadSidebarWidth";

describe("resolvePreferredThreadSidebarWidth", () => {
  it("keeps a stored width whatever the window size, so a narrow launch doesn't shrink it", () => {
    expect(resolvePreferredThreadSidebarWidth(420)).toBe(420);
    expect(resolvePreferredThreadSidebarWidth(null)).toBe(THREAD_SIDEBAR_DEFAULT_WIDTH);
    expect(resolvePreferredThreadSidebarWidth(100)).toBe(THREAD_SIDEBAR_MIN_WIDTH);
  });
});
