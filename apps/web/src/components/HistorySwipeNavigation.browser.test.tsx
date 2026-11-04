import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vite-plus/test";

import { act, render } from "../../test/render";
import { HistorySwipeNavigation } from "./HistorySwipeNavigation";

const navigateHistory = vi.hoisted(() => vi.fn());
vi.mock("../navigationHistory", () => ({ canNavigateHistory: () => true, navigateHistory }));

// Fingers drift a little vertically; only a gesture with a diagonal event navigates.
function swipe(target: Element, deltaX: number, deltaY = 1) {
  for (const delta of [deltaX, 0]) {
    target.dispatchEvent(
      new WheelEvent("wheel", {
        deltaX: delta,
        deltaY: delta === 0 ? 0 : deltaY,
        bubbles: true,
        cancelable: true,
        composed: true,
      }),
    );
  }
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

async function swipeOver(fixture: ReactNode, deltaY?: number) {
  navigateHistory.mockReset();
  await using screen = await render(
    <>
      <HistorySwipeNavigation />
      {fixture}
    </>,
  );
  await act(() => swipe(screen.container.querySelector("[data-target]")!, -130, deltaY));
}

describe("HistorySwipeNavigation", () => {
  it.each([
    ["scrolling left inside a shadow-root scroller keeps the thread", "shadow", 100, -130, false],
    ["scrolling right inside a shadow-root scroller keeps the thread", "shadow", 100, 130, false],
    [
      "scrolling after a shadow scroller remount keeps the thread",
      "shadow-remount",
      100,
      130,
      false,
    ],
    ["scrolling left inside a scroller keeps the thread", "light", 100, -130, false],
    ["swiping back at a shadow-root scroller's left edge navigates", "shadow", 0, -130, true],
    ["swiping back over a panel without overflow navigates", "none", 0, -130, true],
    ["a swipe that started in a closed dialog keeps the thread", "closed-dialog", 0, -130, false],
  ] as const)("%s", async (_name, scroller, scrollLeft, deltaX, navigates) => {
    navigateHistory.mockReset();
    await using screen = await render(<HistorySwipeNavigation />);
    const panel = screen.container.appendChild(document.createElement("div"));
    const root = scroller.startsWith("shadow") ? panel.attachShadow({ mode: "open" }) : panel;
    const viewport = root.appendChild(document.createElement("div"));
    const noOverflow = scroller === "none" || scroller === "closed-dialog";
    viewport.style.cssText = `width: 200px; overflow-x: ${noOverflow ? "visible" : "auto"}`;
    const content = viewport.appendChild(document.createElement("div"));
    content.style.cssText = `height: 20px; width: ${noOverflow ? 100 : 1000}px`;
    viewport.scrollLeft = scrollLeft;

    if (scroller === "closed-dialog") {
      panel.setAttribute("role", "dialog");
      content.dispatchEvent(new WheelEvent("wheel", { deltaX: -1, bubbles: true, composed: true }));
      panel.remove();
      screen.container.appendChild(viewport);
    }

    if (scroller === "shadow-remount") {
      content.dispatchEvent(new WheelEvent("wheel", { deltaX: 1, bubbles: true, composed: true }));
      const replacement = viewport.cloneNode(true) as HTMLDivElement;
      viewport.replaceWith(replacement);
      replacement.scrollLeft = scrollLeft;
      swipe(replacement, deltaX);
    } else {
      swipe(content, deltaX);
    }

    expect(navigateHistory).toHaveBeenCalledTimes(navigates ? 1 : 0);
  });

  it("goes back beside a dialog contained to another panel", async () => {
    await swipeOver(
      <>
        <div data-target />
        <div data-slot="dialog-backdrop" data-contained="" />
      </>,
    );
    expect(navigateHistory).toHaveBeenCalledOnce();
  });

  it.each<[string, () => ReactNode, number?]>([
    ["a mouse thumb wheel, which scrolls perfectly sideways", () => <div data-target />, 0],
    ["a panel that cancels the wheel events it uses", () => <CancelingPanel />],
    ["an open modal's backdrop", () => <div data-target data-slot="dialog-backdrop" />],
  ])("leaves %s alone", async (_name, fixture, deltaY) => {
    await swipeOver(fixture(), deltaY);
    expect(navigateHistory).not.toHaveBeenCalled();
  });
});
