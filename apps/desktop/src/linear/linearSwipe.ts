import * as Channels from "./linearChannels.ts";

// The renderers whose Linear tab is under the pointer. Read synchronously by the window's swipe
// handler, so it lives outside Effect.
const claims = new Set<number>();

export function setLinearHistoryClaim(webContentsId: number, claimed: boolean): void {
  if (claimed) claims.add(webContentsId);
  else claims.delete(webContentsId);
}

/**
 * Fork: Linear tab. Mouse drivers send Back/Forward as macOS swipes, which the window handles by
 * moving the whole app. While the pointer is over a Linear tab, its history moves instead.
 */
export function routeSwipeToLinearTab(
  webContents: {
    readonly id: number;
    readonly send: (channel: string, ...args: unknown[]) => void;
  },
  direction: string,
): boolean {
  if (!claims.has(webContents.id) || (direction !== "left" && direction !== "right")) return false;
  webContents.send(Channels.LINEAR_HISTORY_STEP_CHANNEL, direction === "left" ? -1 : 1);
  return true;
}
