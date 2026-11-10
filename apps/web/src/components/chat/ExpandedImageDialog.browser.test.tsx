import type { SnapShotSource } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import "~/index.css";
import { render } from "../../../test/render";
import { ExpandedImageDialog } from "./ExpandedImageDialog";

const PIXEL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

const snapShotSource: SnapShotSource = {
  kind: "snap-shot",
  capturedAt: "2026-01-01T00:00:00.000Z",
  appName: "Finder",
  windowTitle: "Downloads",
};

const D2_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1174 920"><rect width="1174" height="920"/></svg>';

describe("ExpandedImageDialog", () => {
  it.each(["/work/pipeline.svg", "/work/diagram#v2.svg", "/work/diagram?v2.svg"])(
    "fits a markdown SVG without intrinsic size to the viewer: %s",
    async (path) => {
      const src = URL.createObjectURL(new Blob([D2_SVG], { type: "image/svg+xml" }));
      using _src = { [Symbol.dispose]: () => URL.revokeObjectURL(src) };
      await using screen = await render(
        <ExpandedImageDialog
          preview={{
            images: [
              {
                src,
                name: "Pipeline",
                actionsSource: {
                  kind: "image",
                  name: "Pipeline",
                  src,
                  reference: { kind: "file", path },
                },
              },
            ],
            index: 0,
          }}
          onClose={vi.fn()}
        />,
        // The dialog renders no links and reads no route.
        { router: false },
      );

      const viewer = screen.getByRole("region", { name: "Pipeline, zoomable image" });
      const availableWidth = window.innerWidth * 0.92 - (window.innerWidth >= 640 ? 96 : 0);
      await vi.waitFor(() =>
        expect(viewer.element().getBoundingClientRect().width).toBeCloseTo(availableWidth, 0),
      );
    },
  );

  it("Escape closes a popup opened inside the dialog before the dialog", async () => {
    const onClose = vi.fn();
    await using screen = await render(
      <ExpandedImageDialog
        preview={{ images: [{ src: PIXEL, name: "shot.png", source: snapShotSource }], index: 0 }}
        onClose={onClose}
      />,
      // The dialog renders no links and reads no route.
      { router: false },
    );

    await userEvent.click(screen.getByRole("button", { name: "No accessibility data" }));
    await expect.element(screen.getByText("Accessibility data")).toBeVisible();

    await userEvent.keyboard("{Escape}");
    await expect.element(screen.getByText("Accessibility data")).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    // Focus returns to the popup's trigger and opens its tooltip; leave it for a plain control.
    (screen.getByRole("button", { name: "Close image preview" }).element() as HTMLElement).focus();
    await userEvent.keyboard("{Escape}");
    await vi.waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });

  it("fills its container, ignores clicks, and leaves the rest of the window usable", async () => {
    const onClose = vi.fn();
    const onComposerClick = vi.fn();
    const panel = document.createElement("div");
    panel.style.cssText = "position: fixed; top: 0; right: 0; width: 320px; height: 320px";
    document.body.append(panel);
    using _panel = { [Symbol.dispose]: () => panel.remove() };
    await using _screen = await render(
      <>
        <button type="button" onClick={onComposerClick}>
          Composer
        </button>
        <ExpandedImageDialog
          preview={{ images: [{ src: PIXEL, name: "diagram.png" }], index: 0 }}
          onClose={onClose}
          container={panel}
        />
      </>,
      // The dialog renders no links and reads no route.
      { router: false },
    );

    const dialog = page.getByRole("dialog");
    await expect.element(dialog).toBeVisible();
    expect(panel.contains(dialog.element())).toBe(true);
    const panelBox = panel.getBoundingClientRect();
    const viewport = page.getByRole("region", { name: "diagram.png, zoomable image" });
    await vi.waitFor(() => {
      const viewportBox = viewport.element().getBoundingClientRect();
      expect(viewportBox.width).toBe(panelBox.width);
      expect(viewportBox.top).toBe(panelBox.top);
    });

    // A drag habit releases as a click; it must not zoom.
    await userEvent.click(viewport);
    await expect.element(page.getByText("100% zoom")).toBeInTheDocument();

    // The panel is the page's first div, so screen-scoped queries can't find the render root.
    await userEvent.click(page.getByRole("button", { name: "Composer" }));
    expect(onComposerClick).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();
    await expect.element(dialog).toBeVisible();
  });
});
