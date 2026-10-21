import { minuteTick } from "@t3tools/client-runtime/clock";
import { useSyncExternalStore } from "react";

function currentMinute(): string {
  return new Date().toISOString().slice(0, 16);
}

// Timers stall while the machine sleeps, so catch up as soon as the window is
// back instead of showing a stale minute until the next tick. minuteTick caches
// its value while subscribed, so the snapshot reads the clock directly; the
// string only changes on a minute boundary, which keeps it stable for React.
function subscribe(listener: () => void): () => void {
  const unsubscribe = minuteTick.subscribe(listener);
  const onVisibilityChange = () => {
    if (document.visibilityState === "visible") listener();
  };
  window.addEventListener("focus", listener);
  document.addEventListener("visibilitychange", onVisibilityChange);
  return () => {
    unsubscribe();
    window.removeEventListener("focus", listener);
    document.removeEventListener("visibilitychange", onVisibilityChange);
  };
}

export function useNowMinute(): string {
  return useSyncExternalStore(subscribe, currentMinute, currentMinute);
}
