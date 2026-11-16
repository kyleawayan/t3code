import { useState } from "react";
import { expect, it, vi } from "vite-plus/test";

import { act, fakeTimers, render } from "../../../test/render";
import { HOLD_TO_OPEN_MS, useHoldToOpen } from "./timelineActivityPrefs";

// Like a work row: only a closed disclosure needs the hold.
function Disclosure() {
  const [open, setOpen] = useState(false);
  const handlers = useHoldToOpen(!open, () => setOpen((value) => !value));
  return (
    <button type="button" aria-expanded={open} {...handlers}>
      Work
    </button>
  );
}

it("opens held work only after the hold, keeps it open on release, and ignores a quick click", async () => {
  // A bare button; no navigation is involved.
  await using screen = await render(<Disclosure />, { router: false });
  using _timers = fakeTimers();
  const button = screen.container.querySelector("button")!;
  const press = async (ms: number) => {
    await act(() => {
      button.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
      vi.advanceTimersByTime(ms);
    });
    await act(() => {
      button.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0 }));
      button.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
    });
  };
  const expanded = () => button.getAttribute("aria-expanded");

  await press(HOLD_TO_OPEN_MS - 100);
  expect(expanded()).toBe("false");
  await press(HOLD_TO_OPEN_MS);
  expect(expanded()).toBe("true");
  // Open, a plain click closes it.
  await press(0);
  expect(expanded()).toBe("false");
  // Enter and Space dispatch a click with no pointer count.
  await act(() => button.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 0 })));
  expect(expanded()).toBe("true");
});
