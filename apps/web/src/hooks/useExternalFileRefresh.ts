import { useEffect, useEffectEvent } from "react";

export const EXTERNAL_FILE_POLL_INTERVAL_MS = 2_000;

/**
 * Fork: nothing watches workspace files on disk, so an edit saved in another app (Obsidian) only
 * showed after the next agent turn. This re-reads when the window comes back and, when `poll` is
 * set, on a short interval while the page is visible, since that app usually sits beside T3
 * without taking its focus. A read that returns the same contents keeps the old references, so an
 * unchanged file doesn't re-render the preview's contents.
 *
 * `useLiveRefresh` doesn't fit: it waits 10s between reads and stops once T3 sees no input, which
 * is exactly the state while the user types in the other app.
 */
export function useExternalFileRefresh(input: {
  readonly enabled: boolean;
  readonly poll: boolean;
  readonly refresh: () => void;
}): void {
  const { enabled, poll } = input;
  const runRefresh = useEffectEvent(() => input.refresh());

  useEffect(() => {
    if (!enabled) return;
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") runRefresh();
    };
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    const timer = poll
      ? setInterval(refreshWhenVisible, EXTERNAL_FILE_POLL_INTERVAL_MS)
      : undefined;
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [enabled, poll]);
}
