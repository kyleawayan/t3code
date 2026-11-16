import { contextBridge, ipcRenderer } from "electron";

import * as Channels from "./linearChannels.ts";

/** Fork: `window.t3Linear` for the Linear tab. The key goes in once and never comes back out. */
export function exposeLinearBridge() {
  // A reload or crash skips the tab's own release, which would leave every swipe going to it.
  void ipcRenderer.invoke(Channels.LINEAR_HISTORY_CLAIM_CHANNEL, false).catch(() => undefined);
  contextBridge.exposeInMainWorld("t3Linear", {
    status: () => ipcRenderer.invoke(Channels.LINEAR_KEY_STATUS_CHANNEL),
    setKey: (key: string) => ipcRenderer.invoke(Channels.LINEAR_SET_KEY_CHANNEL, key),
    clearKey: () => ipcRenderer.invoke(Channels.LINEAR_CLEAR_KEY_CHANNEL),
    request: (query: string, variables: Record<string, unknown>) =>
      ipcRenderer.invoke(Channels.LINEAR_REQUEST_CHANNEL, { query, variables }),
    claimHistory: (claimed: boolean) =>
      ipcRenderer.invoke(Channels.LINEAR_HISTORY_CLAIM_CHANNEL, claimed),
    onHistoryStep: (listener: (delta: -1 | 1) => void) => {
      const handler = (_event: unknown, delta: unknown) => listener(delta === -1 ? -1 : 1);
      ipcRenderer.on(Channels.LINEAR_HISTORY_STEP_CHANNEL, handler);
      return () => {
        ipcRenderer.removeListener(Channels.LINEAR_HISTORY_STEP_CHANNEL, handler);
      };
    },
  });
}
