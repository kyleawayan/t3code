import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vite-plus/test";

import { act, render } from "../../test/render";
import { HistorySwipeNavigation } from "./HistorySwipeNavigation";

function swipeBack(target: EventTarget, deltaY: number) {
  for (let index = 0; index < 8; index++) {
    target.dispatchEvent(
      new WheelEvent("wheel", {
        deltaX: -30,
        deltaY,
        bubbles: true,
        cancelable: true,
        composed: true,
      }),
    );
  }
  // An event with no movement marks the fingers lifting.
  target.dispatchEvent(new WheelEvent("wheel", { bubbles: true, composed: true }));
}

function setup() {
  const canGoBack = vi.spyOn(Navigation.prototype, "canGoBack", "get").mockReturnValue(true);
  const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
  return {
    back,
    [Symbol.dispose]() {
      back.mockRestore();
      canGoBack.mockRestore();
    },
  };
}

// Like the terminal and browser preview, which handle wheel events in non-passive listeners.
function CancelingPanel() {
  return (
    <div
      data-target
      ref={(element) => {
        if (!element) return;
        const cancel = (event: WheelEvent) => event.preventDefault();
        element.addEventListener("wheel", cancel, { passive: false });
        return () => element.removeEventListener("wheel", cancel);
      }}
    />
  );
}

// Like a diff line that scrolls sideways inside its shadow root.
function ShadowScroller() {
  return (
    <div
      data-target
      ref={(host) => {
        if (!host || host.shadowRoot) return;
        const scroller = document.createElement("div");
        scroller.style.cssText = "width: 100px; overflow-x: auto";
        scroller.innerHTML = '<div style="width: 400px; height: 10px"></div>';
        host.attachShadow({ mode: "open" }).append(scroller);
        scroller.scrollLeft = 50;
      }}
    />
  );
}

async function swipeOver(fixture: ReactNode, deltaY = -1) {
  // The component reads no route, and a router would add history entries of its own.
  await using screen = await render(
    <>
      <HistorySwipeNavigation />
      {fixture}
    </>,
    { router: false },
  );
  const host = screen.container.querySelector("[data-target]")!;
  await act(() => swipeBack(host.shadowRoot?.firstElementChild ?? host, deltaY));
}

describe("HistorySwipeNavigation", () => {
  it.each<[string, () => ReactNode]>([
    ["", () => <div data-target />],
    [
      " beside a dialog contained to another panel",
      () => (
        <>
          <div data-target />
          <div data-slot="dialog-backdrop" data-contained="" />
        </>
      ),
    ],
  ])("goes back once a two-finger swipe passes the threshold%s", async (_name, fixture) => {
    using mocks = setup();
    await swipeOver(fixture());
    expect(mocks.back).toHaveBeenCalledOnce();
  });

  it.each<[string, () => ReactNode, number?]>([
    ["a mouse thumb wheel, which scrolls perfectly sideways", () => <div data-target />, 0],
    ["a panel that cancels the wheel events it uses", () => <CancelingPanel />],
    ["a sideways scroller inside a shadow root", () => <ShadowScroller />],
    ["an open modal's backdrop", () => <div data-target data-slot="dialog-backdrop" />],
  ])("leaves %s alone", async (_name, fixture, deltaY) => {
    using mocks = setup();
    await swipeOver(fixture(), deltaY);
    expect(mocks.back).not.toHaveBeenCalled();
  });
});
