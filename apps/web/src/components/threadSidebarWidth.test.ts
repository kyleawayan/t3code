import { describe, expect, it } from "vite-plus/test";

import {
  clampThreadSidebarWidth,
  resolveInitialThreadSidebarWidth,
  resolveThreadSidebarMaximumWidth,
  resolveThreadSidebarMinimumWidth,
} from "./threadSidebarWidth";

function renderedWidth(sidebarWidth: number, viewportWidth: number): number {
  const minimumWidth = resolveThreadSidebarMinimumWidth(0);
  return clampThreadSidebarWidth(
    sidebarWidth,
    minimumWidth,
    resolveThreadSidebarMaximumWidth(viewportWidth, minimumWidth),
  );
}

describe("thread sidebar width", () => {
  it("restores the stored width when the viewport widens after a narrow startup", () => {
    const sidebarWidth = resolveInitialThreadSidebarWidth(350);
    // Fork: the floor is 10rem, so a narrow window keeps narrowing the sidebar down to 160px.
    expect(renderedWidth(sidebarWidth, 700)).toBe(160);
    expect(renderedWidth(sidebarWidth, 840)).toBe(200);
    expect(renderedWidth(sidebarWidth, 1638)).toBe(350);
  });

  it("restores the default width when the viewport widens after a narrow startup", () => {
    const sidebarWidth = resolveInitialThreadSidebarWidth(null);
    expect(renderedWidth(sidebarWidth, 840)).toBe(200);
    expect(renderedWidth(sidebarWidth, 1638)).toBe(256);
  });
});
