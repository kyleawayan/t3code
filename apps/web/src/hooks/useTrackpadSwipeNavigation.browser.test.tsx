import { describe, expect, it, vi } from "vite-plus/test";

import { act, render, stubGlobal } from "../../test/render";
import { TrackpadSwipeIndicator } from "../components/TrackpadSwipeIndicator";

function swipeBack() {
  for (let index = 0; index < 8; index++) {
    document.body.dispatchEvent(
      new WheelEvent("wheel", { deltaX: -30, deltaY: -1, bubbles: true, cancelable: true }),
    );
  }
}

function setup() {
  const bridge = stubGlobal("desktopBridge", {});
  const platform = vi.spyOn(Navigator.prototype, "platform", "get").mockReturnValue("MacIntel");
  const canGoBack = vi.spyOn(Navigation.prototype, "canGoBack", "get").mockReturnValue(true);
  const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
  return {
    back,
    [Symbol.dispose]() {
      back.mockRestore();
      canGoBack.mockRestore();
      platform.mockRestore();
      bridge[Symbol.dispose]();
    },
  };
}

describe("useTrackpadSwipeNavigation", () => {
  it("goes back on a two-finger swipe", async () => {
    using mocks = setup();
    // The hook reads no route, and a router would add history entries of its own.
    await using _screen = await render(<TrackpadSwipeIndicator />, { router: false });

    await act(swipeBack);

    expect(mocks.back).toHaveBeenCalledOnce();
  });

  it("leaves the page alone while a modal dialog is open", async () => {
    using mocks = setup();
    // The hook reads no route, and a router would add history entries of its own.
    await using _screen = await render(
      <>
        <TrackpadSwipeIndicator />
        <div data-slot="dialog-backdrop" />
      </>,
      { router: false },
    );

    await act(swipeBack);

    expect(mocks.back).not.toHaveBeenCalled();
  });
});
