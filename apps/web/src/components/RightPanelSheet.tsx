import { type ReactNode, useEffect, useState } from "react";

import { isElectron } from "~/env";
import { useResizableWidth } from "~/hooks/useResizableWidth";
import { RIGHT_PANEL_SHEET_CLASS_NAME } from "../rightPanelLayout";
import { RightPanelResizeHandle } from "./preview/RightPanelResizeHandle";
import { Sheet, SheetPopup } from "./ui/sheet";

const RIGHT_PANEL_SHEET_WIDTH_STORAGE_KEY = "t3code:right-panel-sheet-width";
const RIGHT_PANEL_SHEET_MIN_WIDTH = 320;
/** Default the sheet to nearly the full viewport; a wide panel is the point. */
const RIGHT_PANEL_SHEET_DEFAULT_FRACTION = 0.9;
/**
 * On the macOS desktop the traffic lights sit at { x: 16 } (see
 * DesktopWindow.ts) and the cluster spans ~52px, so this gutter (16 + 52 + 16)
 * clears them with a matching 16px margin. The panel stays flush to the right
 * window edge but can't grow past this into the traffic lights on the left.
 */
const SHEET_LEFT_GUTTER = 84;

/**
 * Small-screen right panel. Slides in as an overlay sheet from the right,
 * user-resizable via a drag handle on its left edge with width persisted per
 * browser. Defaults to ~90% of the viewport; on desktop it stops short of the
 * traffic lights on the left instead of covering the whole window.
 */
export function RightPanelSheet(props: {
  children: ReactNode;
  open: boolean;
  onClose: () => void;
}) {
  const vw = useViewportWidth();
  const maxWidth = isElectron ? Math.max(RIGHT_PANEL_SHEET_MIN_WIDTH, vw - SHEET_LEFT_GUTTER) : vw;
  const { width, handlers } = useResizableWidth({
    storageKey: RIGHT_PANEL_SHEET_WIDTH_STORAGE_KEY,
    defaultWidth: Math.round(vw * RIGHT_PANEL_SHEET_DEFAULT_FRACTION),
    minWidth: Math.min(RIGHT_PANEL_SHEET_MIN_WIDTH, vw),
    maxWidth,
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
        side="right"
        showCloseButton={false}
        keepMounted
        className={RIGHT_PANEL_SHEET_CLASS_NAME}
        style={{ width: `${width}px` }}
      >
        <RightPanelResizeHandle handlers={handlers} />
        {props.children}
      </SheetPopup>
    </Sheet>
  );
}

/**
 * Live viewport width, used to derive the default (90%) and the max sheet
 * width. Resize-aware so dragging the OS window narrower re-clamps the stored
 * width on the next render.
 */
function useViewportWidth(): number {
  const [vw, setVw] = useState(() => (typeof window === "undefined" ? 1280 : window.innerWidth));
  useEffect(() => {
    if (typeof window === "undefined") return;
    let frame = 0;
    const onResize = () => {
      if (frame !== 0) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        setVw(window.innerWidth);
      });
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      if (frame !== 0) window.cancelAnimationFrame(frame);
    };
  }, []);
  return vw;
}
