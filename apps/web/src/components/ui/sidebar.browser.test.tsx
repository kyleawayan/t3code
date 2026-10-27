import { act, fakeTimers, render } from "../../../test/render";
import "../../index.css";

import { describe, expect, it, vi } from "vite-plus/test";

import { page, userEvent } from "vite-plus/test/browser";

import { Sidebar, SidebarProvider, SidebarTrigger, useSidebar } from "./sidebar";
import { resolveSidebarState } from "./sidebarState";

const sidebarUi = (open: boolean) => (
  <SidebarProvider open={open}>
    <Sidebar>
      <SidebarTrigger data-testid="internal-trigger" />
      <button data-testid="sidebar-control">Thread</button>
    </Sidebar>
    <SidebarTrigger data-testid="external-trigger" />
    <button data-testid="content-control">Content</button>
  </SidebarProvider>
);

describe("responsive sidebar state", () => {
  it("uses mobile sheet visibility for the shared responsive state", () => {
    expect(resolveSidebarState({ isMobile: true, open: true, openMobile: false })).toBe(
      "collapsed",
    );
    expect(resolveSidebarState({ isMobile: true, open: false, openMobile: true })).toBe("expanded");
    expect(resolveSidebarState({ isMobile: false, open: true, openMobile: false })).toBe(
      "expanded",
    );
  });
});

describe("desktop sidebar focus", () => {
  it("moves focus to the external toggle on collapse and restores sidebar access on expansion", async () => {
    await page.viewport(1280, 900);
    await using screen = await render(sidebarUi(true));
    const element = (selector: string) => screen.container.querySelector<HTMLElement>(selector)!;
    const control = element('[data-testid="sidebar-control"]');
    const sidebar = element('[data-slot="sidebar"]');
    control.focus();
    expect(document.activeElement).toBe(control);

    await screen.rerender(sidebarUi(false));

    expect(document.activeElement).toBe(element('[data-testid="external-trigger"]'));
    expect(sidebar.inert).toBe(true);
    control.focus();
    expect(document.activeElement).toBe(element('[data-testid="external-trigger"]'));
    await userEvent.keyboard("{Shift>}{Tab}{/Shift}");
    expect(document.activeElement).not.toBe(element('[data-testid="internal-trigger"]'));
    expect(document.activeElement).not.toBe(control);
    await userEvent.keyboard("{Tab}");
    expect(document.activeElement).toBe(element('[data-testid="external-trigger"]'));
    await userEvent.keyboard("{Tab}");
    expect(document.activeElement).toBe(element('[data-testid="content-control"]'));

    await screen.rerender(sidebarUi(true));

    expect(sidebar.inert).toBe(false);
    control.focus();
    expect(document.activeElement).toBe(control);
  });

  it("keeps focus in the content when the sidebar collapses", async () => {
    await page.viewport(1280, 900);
    await using screen = await render(sidebarUi(true));
    const element = (selector: string) => screen.container.querySelector<HTMLElement>(selector)!;
    const control = element('[data-testid="content-control"]');
    control.focus();
    expect(document.activeElement).toBe(control);

    await screen.rerender(sidebarUi(false));

    expect(document.activeElement).toBe(control);
  });
});

function PeekTrigger() {
  const { mobilePeek } = useSidebar();
  return (
    <>
      <button
        data-testid="peek-trigger"
        onPointerEnter={mobilePeek.start}
        onPointerLeave={mobilePeek.end}
      >
        Sidebar
      </button>
      <button data-testid="keyboard-toggle" onClick={mobilePeek.toggleFromKeyboard}>
        Cmd+B
      </button>
    </>
  );
}

// Fork: in sheet mode, hovering the trigger peeks the sidebar and Cmd+B opens it until the
// pointer visits the sheet and leaves.
describe("floating sidebar peek", () => {
  const peekUi = (
    <SidebarProvider mobileMediaQuery="(min-width: 0px)">
      <Sidebar mobileWidth="300px">
        <button data-testid="sidebar-control">Thread</button>
      </Sidebar>
      {/* Clear of the 300px sheet, so moving between them leaves it. */}
      <div style={{ position: "fixed", top: 40, right: 40, display: "flex", gap: 40 }}>
        <PeekTrigger />
        <button data-testid="content-control">Content</button>
      </div>
    </SidebarProvider>
  );
  // Closing starts an exit animation, so "open" is read from the sheet's state attribute instead
  // of waiting for it to unmount.
  const sheetOpen = () =>
    document
      .querySelector('[data-slot="sidebar"][data-mobile="true"]')
      ?.hasAttribute("data-open") ?? false;

  // React derives enter and leave from `pointerout`/`pointerover`, so the pointer's moves are
  // dispatched directly; the open sheet's modal backdrop blocks Playwright's own hover checks.
  const movePointer = (from: Element, to: Element) => {
    const init = { bubbles: true, pointerType: "mouse" };
    from.dispatchEvent(new PointerEvent("pointerout", { ...init, relatedTarget: to }));
    to.dispatchEvent(new PointerEvent("pointerover", { ...init, relatedTarget: from }));
  };

  it("opens while the trigger is hovered and closes after the pointer leaves", async () => {
    await page.viewport(800, 900);
    await using screen = await render(peekUi);
    const trigger = screen.getByTestId("peek-trigger").element();
    const content = screen.getByTestId("content-control").element();
    await act(() => movePointer(content, trigger));
    expect(sheetOpen()).toBe(true);

    using _timers = fakeTimers();
    await act(() => movePointer(trigger, content));
    await act(() => vi.advanceTimersByTime(200));
    expect(sheetOpen()).toBe(true);
    await act(() => vi.advanceTimersByTime(200));
    expect(sheetOpen()).toBe(false);
  });

  it("keeps a Cmd+B opening until the pointer visits the sheet and leaves", async () => {
    await page.viewport(800, 900);
    await using screen = await render(peekUi);
    const content = screen.getByTestId("content-control").element();
    await act(() => (screen.getByTestId("keyboard-toggle").element() as HTMLElement).click());
    expect(sheetOpen()).toBe(true);

    using _timers = fakeTimers();
    await act(() => vi.advanceTimersByTime(1_000));
    expect(sheetOpen()).toBe(true);

    const sheetControl = screen.getByTestId("sidebar-control").element();
    await act(() => {
      movePointer(content, sheetControl);
      movePointer(sheetControl, content);
    });
    await act(() => vi.advanceTimersByTime(400));
    expect(sheetOpen()).toBe(false);
  });
});
