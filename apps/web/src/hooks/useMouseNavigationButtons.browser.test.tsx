import { describe, expect, it, vi } from "vite-plus/test";

import { act, render, stubGlobal } from "../../test/render";
import { useMouseNavigationButtons } from "./useMouseNavigationButtons";

function Listener() {
  useMouseNavigationButtons();
  return null;
}

function mouseUp(button: number) {
  const event = new MouseEvent("mouseup", { button, bubbles: true, cancelable: true });
  document.body.dispatchEvent(event);
  return event;
}

describe("useMouseNavigationButtons", () => {
  it("goes back on the back button and forward on the forward button", async () => {
    using _bridge = stubGlobal("desktopBridge", {});
    using back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    using forward = vi.spyOn(window.history, "forward").mockImplementation(() => {});
    // The hook reads no route, and a router would add history entries of its own.
    await using _screen = await render(<Listener />, { router: false });

    const backEvent = await act(() => mouseUp(3));
    const forwardEvent = await act(() => mouseUp(4));

    expect(back).toHaveBeenCalledOnce();
    expect(forward).toHaveBeenCalledOnce();
    expect(backEvent.defaultPrevented).toBe(true);
    expect(forwardEvent.defaultPrevented).toBe(true);
  });

  it("leaves the primary, middle, and secondary buttons alone", async () => {
    using _bridge = stubGlobal("desktopBridge", {});
    using back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    using forward = vi.spyOn(window.history, "forward").mockImplementation(() => {});
    // The hook reads no route, and a router would add history entries of its own.
    await using _screen = await render(<Listener />, { router: false });

    const events = await act(() => [0, 1, 2].map(mouseUp));

    expect(back).not.toHaveBeenCalled();
    expect(forward).not.toHaveBeenCalled();
    expect(events.some((event) => event.defaultPrevented)).toBe(false);
  });

  it("leaves side buttons to the browser outside the desktop app", async () => {
    using back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    // The hook reads no route, and a router would add history entries of its own.
    await using _screen = await render(<Listener />, { router: false });

    const event = await act(() => mouseUp(3));

    expect(back).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });
});
