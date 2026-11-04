import { expect, it, vi } from "vite-plus/test";

import { act, fakeTimers, render } from "../../test/render";
import { useNowMinute } from "./useNowMinute";

function Clock() {
  return <span>{useNowMinute()}</span>;
}

it.each(["focus", "visibilitychange"] as const)(
  "catches up after sleep on %s without waiting for a timer",
  async (event) => {
    using _timers = fakeTimers();
    vi.setSystemTime(new Date("2026-01-01T12:00:30Z"));
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    try {
      await using screen = await render(<Clock />, { router: false });
      expect(screen.container.textContent).toBe("2026-01-01T12:00");

      vi.setSystemTime(new Date("2026-01-02T12:00:30Z"));
      await act(() => {
        (event === "focus" ? window : document).dispatchEvent(new Event(event));
      });
      expect(screen.container.textContent).toBe("2026-01-02T12:00");
    } finally {
      Reflect.deleteProperty(document, "visibilityState");
    }
  },
);
