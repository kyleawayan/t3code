import { minuteTick } from "@t3tools/client-runtime/clock";
import { useSyncExternalStore } from "react";

function currentMinute(): string {
  return new Date().toISOString().slice(0, 16);
}

// Timers stall while the machine sleeps, so catch up as soon as the window is
// back instead of showing a stale minute until the next tick. minuteTick caches
// its value while subscribed, so the snapshot reads the clock directly; the
// string only changes on a minute boundary, which keeps it stable for React.
const resumeListeners = new Set<() => void>();

function notifyResume() {
  for (const listener of resumeListeners) listener();
}

function onVisibilityChange() {
  if (document.visibilityState === "visible") notifyResume();
}

function subscribe(listener: () => void): () => void {
  const unsubscribe = minuteTick.subscribe(listener);
  // One pair of window listeners for every subscriber; each sidebar row's time label subscribes.
  if (resumeListeners.size === 0) {
    window.addEventListener("focus", notifyResume);
    document.addEventListener("visibilitychange", onVisibilityChange);
  }
  resumeListeners.add(listener);
  return () => {
    unsubscribe();
    resumeListeners.delete(listener);
    if (resumeListeners.size === 0) {
      window.removeEventListener("focus", notifyResume);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    }
  };
}

export function useNowMinute(): string {
  return useSyncExternalStore(subscribe, currentMinute, currentMinute);
}
