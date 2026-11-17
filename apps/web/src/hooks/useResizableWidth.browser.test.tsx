import { describe, expect, it, vi } from "vite-plus/test";

import { act, render } from "../../test/render";
import { RESIZABLE_WIDTH_PROPERTY, useResizableWidth } from "./useResizableWidth";

const STORAGE_KEY = "test:responsive-panel-width";

function Panel({ defaultWidth, snap }: { defaultWidth: number; snap?: readonly number[] }) {
  const { width, setWidth, handlers } = useResizableWidth({
    storageKey: STORAGE_KEY,
    defaultWidth,
    minWidth: 160,
    maxWidth: 560,
    edge: "left",
    snapWidths: snap ? () => snap : undefined,
  });
  return (
    <>
      <button onClick={() => setWidth(350)}>{width}</button>
      <div role="separator" style={{ width: 8, height: 40 }} {...handlers}>
        <span />
      </div>
    </>
  );
}

describe("useResizableWidth", () => {
  it("follows a responsive default until the user saves a width", async () => {
    const previous = localStorage.getItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_KEY);
    try {
      // This hook only needs browser storage and React; no navigation is involved.
      await using screen = await render(<Panel defaultWidth={320} />, { router: false });
      expect(screen.container.textContent).toBe("320");
      await screen.rerender(<Panel defaultWidth={200} />);
      expect(screen.container.textContent).toBe("200");

      await act(() => screen.container.querySelector("button")!.click());
      await screen.rerender(<Panel defaultWidth={180} />);
      expect(screen.container.textContent).toBe("350");

      await screen.unmount();
      await using restored = await render(<Panel defaultWidth={200} />, { router: false });
      expect(restored.container.textContent).toBe("350");
    } finally {
      if (previous === null) localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, previous);
    }
  });

  it("keeps the default responsive after a stationary click and persists an actual drag", async () => {
    const previous = localStorage.getItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_KEY);
    try {
      // This hook only needs browser storage and React; no navigation is involved.
      await using screen = await render(<Panel defaultWidth={240} />, { router: false });
      await screen.getByRole("separator").click();
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
      await screen.rerender(<Panel defaultWidth={256} />);
      expect(screen.container.textContent).toBe("256");

      const handle = screen.container.querySelector<HTMLElement>('[role="separator"]')!;
      // Synthetic drag events have no active browser pointer to capture.
      using _capture = vi.spyOn(handle, "setPointerCapture").mockImplementation(() => {});
      const pointer = { bubbles: true, pointerId: 1, button: 0 };
      await act(() => {
        handle.dispatchEvent(new PointerEvent("pointerdown", { ...pointer, clientX: 500 }));
      });
      await screen.rerender(<Panel defaultWidth={280} />);
      await act(() => {
        handle.dispatchEvent(new PointerEvent("pointerup", { ...pointer, clientX: 500 }));
      });
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
      expect(screen.container.style.getPropertyValue(RESIZABLE_WIDTH_PROPERTY)).toBe("280px");

      await act(() => {
        handle.dispatchEvent(new PointerEvent("pointerdown", { ...pointer, clientX: 500 }));
        handle.dispatchEvent(new PointerEvent("pointerup", { ...pointer, clientX: 450 }));
      });
      expect(localStorage.getItem(STORAGE_KEY)).toBe("330");
      await screen.rerender(<Panel defaultWidth={200} />);
      expect(screen.container.textContent).toBe("330");
    } finally {
      if (previous === null) localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, previous);
    }
  });

  it("snaps to a snap width within 12px and lets go past it", async () => {
    const previous = localStorage.getItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_KEY);
    try {
      // This hook only needs browser storage and React; no navigation is involved.
      await using screen = await render(<Panel defaultWidth={300} snap={[400, 480]} />, {
        router: false,
      });
      const handle = screen.container.querySelector<HTMLElement>('[role="separator"]')!;
      // Synthetic drag events have no active browser pointer to capture.
      using _capture = vi.spyOn(handle, "setPointerCapture").mockImplementation(() => {});
      using pulse = vi.spyOn(handle.firstElementChild!, "animate");
      const pointer = { bubbles: true, pointerId: 1, button: 0 };
      const drag = (to: number) =>
        act(() => {
          handle.dispatchEvent(new PointerEvent("pointerdown", { ...pointer, clientX: 500 }));
          handle.dispatchEvent(new PointerEvent("pointerup", { ...pointer, clientX: to }));
        });
      // The left edge widens as the pointer moves left: 300 + 90 lands 10px short of 400.
      await drag(410);
      expect(localStorage.getItem(STORAGE_KEY)).toBe("400");
      // The line glows once as the drag lands on the snap width.
      expect(pulse).toHaveBeenCalledTimes(1);
      await drag(480);
      expect(localStorage.getItem(STORAGE_KEY)).toBe("420");
      expect(pulse).toHaveBeenCalledTimes(1);
      await drag(440);
      expect(localStorage.getItem(STORAGE_KEY)).toBe("480");
      expect(pulse).toHaveBeenCalledTimes(2);
      // Moving straight from one snap width to the other lands on a new one, so it glows again.
      await drag(580);
      expect(localStorage.getItem(STORAGE_KEY)).toBe("400");
      expect(pulse).toHaveBeenCalledTimes(3);
    } finally {
      if (previous === null) localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, previous);
    }
  });
});
