import { type CSSProperties, type ReactNode, useSyncExternalStore } from "react";

import { RESIZABLE_WIDTH_PROPERTY, useResizableWidth } from "~/hooks/useResizableWidth";
import { RightPanelResizeHandle } from "./preview/RightPanelResizeHandle";
import { Sheet, SheetPopup } from "./ui/sheet";

const RIGHT_PANEL_SHEET_WIDTH_STORAGE_KEY = "t3code:right-panel-sheet-width";
const RIGHT_PANEL_SHEET_MIN_WIDTH = 320;
/** Default the sheet to nearly the full viewport; a wide panel is the point. */
const RIGHT_PANEL_SHEET_DEFAULT_FRACTION = 0.9;

function subscribeToViewportWidth(onChange: () => void): () => void {
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
}

function readViewportWidth(): number {
  return window.innerWidth;
}

/** The sidebar stays usable beside the sheet, so pressing it is not a dismissal. */
function isSidebarPress(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest("[data-app-sidebar], [data-sidebar-control]") !== null
  );
}

/**
 * Small-screen right panel: an overlay sheet, resizable from its left edge with the width
 * persisted per browser. Maximized, it spans the window. It mounts inside the workspace
 * layout so it can sit beside an open sidebar and keep the titlebar controls where they
 * were before it opened.
 */
export function RightPanelSheet(props: {
  animationDurationMs: number;
  children: ReactNode;
  open: boolean;
  maximized: boolean;
  container: HTMLElement | null;
  onClose: () => void;
}) {
  const viewportWidth = useSyncExternalStore(subscribeToViewportWidth, readViewportWidth);
  const { width, handlers } = useResizableWidth({
    storageKey: RIGHT_PANEL_SHEET_WIDTH_STORAGE_KEY,
    defaultWidth: Math.round(viewportWidth * RIGHT_PANEL_SHEET_DEFAULT_FRACTION),
    minWidth: Math.min(RIGHT_PANEL_SHEET_MIN_WIDTH, viewportWidth),
    maxWidth: viewportWidth,
    edge: "left",
  });

  return (
    // Non-modal: a modal dialog blocks pointer and keyboard access to the sidebar beside it.
    <Sheet
      open={props.open}
      modal={false}
      onOpenChange={(open, details) => {
        if (open) return;
        // Non-modal dialogs also close when focus leaves them; this sheet closes only on
        // Escape, its toggle, or a press outside both it and the sidebar.
        if (details.reason === "focus-out") return;
        if (details.reason === "outside-press" && isSidebarPress(details.event.target)) return;
        props.onClose();
      }}
    >
      <SheetPopup
        transitionDurationMs={props.animationDurationMs}
        side="right"
        showCloseButton={false}
        keepMounted
        portalContainer={props.container}
        data-right-panel-sheet=""
        data-maximized={props.maximized ? "true" : undefined}
        className="max-w-none wco:mt-(--workspace-topbar-height) wco:h-[calc(100%-var(--workspace-topbar-height))] wco:max-h-[calc(100%-var(--workspace-topbar-height))]"
        style={
          props.maximized
            ? { width: "100%" }
            : ({
                [RESIZABLE_WIDTH_PROPERTY]: `${width}px`,
                width: `var(${RESIZABLE_WIDTH_PROPERTY})`,
                // Stops short of the titlebar's left controls (macOS traffic lights) and of
                // an open sidebar beside the sheet, which the viewport clamp can't see.
                maxWidth: "calc(100% - var(--workspace-controls-left))",
              } as CSSProperties)
        }
      >
        {props.maximized ? null : <RightPanelResizeHandle handlers={handlers} />}
        {props.children}
      </SheetPopup>
    </Sheet>
  );
}
