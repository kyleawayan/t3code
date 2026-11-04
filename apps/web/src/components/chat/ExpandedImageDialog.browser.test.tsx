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

describe("ExpandedImageDialog", () => {
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

  it("opens over its container and leaves the rest of the window usable", async () => {
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

    // The panel is the page's first div, so screen-scoped queries can't find the render root.
    await userEvent.click(page.getByRole("button", { name: "Composer" }));
    expect(onComposerClick).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();
    await expect.element(dialog).toBeVisible();
  });
});
