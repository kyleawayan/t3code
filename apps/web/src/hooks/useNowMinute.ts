import { useSyncExternalStore } from "react";

function currentMinute(): string {
  return new Date().toISOString().slice(0, 16);
}

let nowMinute = currentMinute();
let timerId: number | null = null;
let timerIsInterval = false;
const listeners = new Set<() => void>();

function tick(): void {
  const next = currentMinute();
  if (next !== nowMinute) {
    nowMinute = next;
    for (const listener of listeners) listener();
  }
}

function startTimer(): void {
  timerIsInterval = false;
  timerId = window.setTimeout(
    () => {
      tick();
      timerIsInterval = true;
      timerId = window.setInterval(tick, 60_000);
    },
    60_000 - (Date.now() % 60_000),
  );
}

// Timers stall while the machine sleeps, so catch up as soon as the window is
// back instead of showing a stale minute until the next tick.
function onVisibilityChange(): void {
  if (document.visibilityState === "visible") tick();
}

function subscribe(listener: () => void): () => void {
  if (listeners.size === 0) {
    startTimer();
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", onVisibilityChange);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timerId !== null) {
      if (timerIsInterval) window.clearInterval(timerId);
      else window.clearTimeout(timerId);
      timerId = null;
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    }
  };
}

function getSnapshot(): string {
  // While the timer runs the cached value is returned untouched, as
  // useSyncExternalStore requires between change notifications.
  if (timerId === null) {
    nowMinute = currentMinute();
  }
  return nowMinute;
}

export function useNowMinute(): string {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
