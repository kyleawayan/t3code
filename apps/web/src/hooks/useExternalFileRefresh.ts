import { useEffect, useEffectEvent } from "react";

export const EXTERNAL_FILE_POLL_INTERVAL_MS = 2_000;

/**
 * Fork: nothing watches files on disk, so an edit saved in another app (Obsidian) showed only after
 * the next agent turn. Re-reads on window return and, with `poll`, on an interval while visible.
 * `useLiveRefresh` doesn't fit: it stops once T3 sees no input, which is the state while typing there.
 */
export function useExternalFileRefresh(input: {
  readonly enabled: boolean;
  readonly poll: boolean;
  readonly refresh: () => void;
}): void {
  const { enabled, poll } = input;
  const runRefresh = useEffectEvent(() => input.refresh());

  // oxlint-disable-next-line t3code/react-effect-budget -- subscribes to window focus and a poll timer.
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
