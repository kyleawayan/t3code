import { bridgeCall, evenAppBridge } from "../glasses/bridge";

/**
 * Key-value persistence that survives Even App relaunches. The Even App's
 * WebView does not reliably keep browser localStorage between launches, so
 * inside the app values live in the host's own storage through the bridge.
 * Outside the app (simulator, plain browser) browser localStorage is used, and
 * without a window at all (unit tests) nothing is stored.
 *
 * Values written by older builds to browser localStorage are carried over the
 * first time a key is read through the bridge and found empty.
 */
export const hostStorage = {
  async getItem(key: string): Promise<string | null> {
    if (typeof window === "undefined") {
      return null;
    }
    const bridge = await evenAppBridge();
    if (bridge === null) {
      return browserGet(key);
    }
    const stored = await bridgeCall(`getLocalStorage:${key}`, () => bridge.getLocalStorage(key));
    if (typeof stored === "string" && stored.length > 0) {
      return stored;
    }
    const legacy = browserGet(key);
    if (legacy !== null) {
      void bridgeCall(`setLocalStorage:${key}`, () => bridge.setLocalStorage(key, legacy));
    }
    return legacy;
  },

  async setItem(key: string, value: string): Promise<void> {
    if (typeof window === "undefined") {
      return;
    }
    const bridge = await evenAppBridge();
    if (bridge === null) {
      window.localStorage.setItem(key, value);
      return;
    }
    const ok = await bridgeCall(`setLocalStorage:${key}`, () => bridge.setLocalStorage(key, value));
    if (ok !== true) {
      throw new Error(`The Even App refused to store ${key}.`);
    }
  },
};

function browserGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
