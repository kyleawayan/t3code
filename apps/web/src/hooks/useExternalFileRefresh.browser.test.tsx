import { describe, expect, it, vi } from "vite-plus/test";

import { act, fakeTimers, render } from "../../test/render";
import { EXTERNAL_FILE_POLL_INTERVAL_MS, useExternalFileRefresh } from "./useExternalFileRefresh";

function Preview(props: { enabled: boolean; poll: boolean; refresh: () => void }) {
  useExternalFileRefresh(props);
  return null;
}

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
}

describe("useExternalFileRefresh", () => {
  it("re-reads when the window regains focus or becomes visible", async () => {
    const refresh = vi.fn();
    setVisibility("visible");
    try {
      // The hook reads no route, so the default router only adds noise.
      await using _screen = await render(<Preview enabled poll={false} refresh={refresh} />, {
        router: false,
      });
      await act(() => window.dispatchEvent(new Event("focus")));
      await act(() => document.dispatchEvent(new Event("visibilitychange")));
      expect(refresh).toHaveBeenCalledTimes(2);
    } finally {
      Reflect.deleteProperty(document, "visibilityState");
    }
  });

  it("polls while visible and pauses while hidden", async () => {
    using _timers = fakeTimers();
    const refresh = vi.fn();
    setVisibility("visible");
    try {
      // The hook reads no route, so the default router only adds noise.
      await using _screen = await render(<Preview enabled poll refresh={refresh} />, {
        router: false,
      });
      await act(() => vi.advanceTimersByTime(EXTERNAL_FILE_POLL_INTERVAL_MS * 3));
      expect(refresh).toHaveBeenCalledTimes(3);

      setVisibility("hidden");
      await act(() => vi.advanceTimersByTime(EXTERNAL_FILE_POLL_INTERVAL_MS * 3));
      expect(refresh).toHaveBeenCalledTimes(3);
    } finally {
      Reflect.deleteProperty(document, "visibilityState");
    }
  });

  it("does nothing while disabled", async () => {
    using _timers = fakeTimers();
    const refresh = vi.fn();
    setVisibility("visible");
    try {
      // The hook reads no route, so the default router only adds noise.
      await using _screen = await render(<Preview enabled={false} poll refresh={refresh} />, {
        router: false,
      });
      await act(() => {
        window.dispatchEvent(new Event("focus"));
        vi.advanceTimersByTime(EXTERNAL_FILE_POLL_INTERVAL_MS * 3);
      });
      expect(refresh).not.toHaveBeenCalled();
    } finally {
      Reflect.deleteProperty(document, "visibilityState");
    }
  });
});
