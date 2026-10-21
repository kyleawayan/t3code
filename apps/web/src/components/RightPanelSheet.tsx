import { type CSSProperties, type ReactNode, useSyncExternalStore } from "react";

import { isElectron } from "~/env";
import { RESIZABLE_WIDTH_PROPERTY, useResizableWidth } from "~/hooks/useResizableWidth";
import { RightPanelResizeHandle } from "./preview/RightPanelResizeHandle";
import { Sheet, SheetPopup } from "./ui/sheet";

const RIGHT_PANEL_SHEET_WIDTH_STORAGE_KEY = "t3code:right-panel-sheet-width";
const RIGHT_PANEL_SHEET_MIN_WIDTH = 320;
/** Default the sheet to nearly the full viewport; a wide panel is the point. */
const RIGHT_PANEL_SHEET_DEFAULT_FRACTION = 0.9;
/**
 * On the macOS desktop the traffic lights sit at { x: 16 } (see
 * DesktopWindow.ts) and the cluster spans ~52px, so this gutter (16 + 52 + 16)
 * clears them with a matching 16px margin.
 */
const SHEET_LEFT_GUTTER = 84;

function subscribeToViewportWidth(onChange: () => void): () => void {
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
}

function readViewportWidth(): number {
  return window.innerWidth;
}

/**
 * Small-screen right panel. Slides in as an overlay sheet from the right and is
 * resizable from its left edge, with the width persisted per browser. Defaults to
 * ~90% of the viewport; on desktop it stops short of the traffic lights.
 */
export function RightPanelSheet(props: {
  animationDurationMs: number;
  children: ReactNode;
  open: boolean;
  onClose: () => void;
}) {
  const viewportWidth = useSyncExternalStore(subscribeToViewportWidth, readViewportWidth);
  const { width, handlers } = useResizableWidth({
    storageKey: RIGHT_PANEL_SHEET_WIDTH_STORAGE_KEY,
    defaultWidth: Math.round(viewportWidth * RIGHT_PANEL_SHEET_DEFAULT_FRACTION),
    minWidth: Math.min(RIGHT_PANEL_SHEET_MIN_WIDTH, viewportWidth),
    maxWidth: isElectron
      ? Math.max(RIGHT_PANEL_SHEET_MIN_WIDTH, viewportWidth - SHEET_LEFT_GUTTER)
      : viewportWidth,
    edge: "left",
  });

  return (
    <Sheet
      open={props.open}
      onOpenChange={(open) => {
        if (!open) {
          props.onClose();
        }
      }}
    >
      <SheetPopup
        transitionDurationMs={props.animationDurationMs}
        side="right"
        showCloseButton={false}
        keepMounted
        className="max-w-none wco:mt-(--workspace-topbar-height) wco:h-[calc(100%-var(--workspace-topbar-height))] wco:max-h-[calc(100%-var(--workspace-topbar-height))]"
        style={
          {
            [RESIZABLE_WIDTH_PROPERTY]: `${width}px`,
            width: `var(${RESIZABLE_WIDTH_PROPERTY})`,
          } as CSSProperties
        }
      >
        <RightPanelResizeHandle handlers={handlers} />
        {props.children}
      </SheetPopup>
    </Sheet>
  );
}
