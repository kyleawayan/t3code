import { page, userEvent } from "vite-plus/test/browser";
import { describe, expect, it, vi } from "vite-plus/test";

import { act, fakeTimers, render } from "../../../test/render";
import { Sidebar, SidebarProvider, SidebarRail, SidebarTrigger, useSidebar } from "./sidebar";

function CollapseFromInside() {
  const { setOpen } = useSidebar();
  return (
    <button type="button" onClick={() => setOpen(false)}>
      Collapse
    </button>
  );
}

function Harness(props: { readonly onResize?: (width: number) => void }) {
  return (
    <SidebarProvider defaultOpen>
      <Sidebar
        collapsible="offcanvas"
        resizable={{
          minWidth: 200,
          maxWidth: 600,
          ...(props.onResize ? { onResize: props.onResize } : {}),
        }}
      >
        <CollapseFromInside />
        <SidebarRail />
      </Sidebar>
      <SidebarTrigger />
    </SidebarProvider>
  );
}

describe("Sidebar", () => {
  it("hands focus to the outside trigger when it collapses around the focused control", async () => {
    await page.viewport(1280, 800);
    await using screen = await render(<Harness />, { router: false /* no routes involved */ });

    await userEvent.click(screen.getByRole("button", { name: "Collapse" }));

    const sidebar = screen.container.querySelector<HTMLElement>('[data-slot="sidebar"]')!;
    await vi.waitFor(() => expect(sidebar.inert).toBe(true));
    const trigger = screen.container.querySelector('[data-slot="sidebar-trigger"]');
    await vi.waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("abandons a rail drag when the sidebar collapses mid-drag", async () => {
    await page.viewport(1280, 800);
    const onResize = vi.fn();
    await using screen = await render(<Harness onResize={onResize} />, {
      router: false /* no routes involved */,
    });
    const rail = screen.container.querySelector<HTMLElement>('[data-sidebar="rail"]')!;
    const { left, top } = rail.getBoundingClientRect();
    const pointer = { bubbles: true, cancelable: true, pointerId: 1, button: 0, clientY: top + 10 };
    const dragTo = (clientX: number) => {
      rail.dispatchEvent(new PointerEvent("pointerdown", { ...pointer, clientX: left }));
      rail.dispatchEvent(new PointerEvent("pointermove", { ...pointer, clientX }));
    };
    // A completed drag commits, so the abandoned one below is a real drag too.
    dragTo(left + 40);
    rail.dispatchEvent(new PointerEvent("pointerup", { ...pointer, clientX: left + 40 }));
    expect(onResize).toHaveBeenCalledTimes(1);

    dragTo(left + 80);
    await userEvent.click(
      screen.container.querySelector<HTMLElement>('[data-slot="sidebar-trigger"]')!,
    );
    rail.dispatchEvent(new PointerEvent("pointerup", { ...pointer, clientX: left + 80 }));

    expect(onResize).toHaveBeenCalledTimes(1);
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
