import { useRef, useState } from "react";

import { type ResizableWidthHandlers, useResizableWidth } from "./useResizableWidth";
import { observeResize } from "../lib/observeResize";

export interface PreviewPanelInlineSize {
  readonly width: number;
  readonly handlers: ResizableWidthHandlers;
  /** Ref-callback body for the panel host: measures the row the panel shares. */
  readonly observeRow: (host: HTMLElement) => () => void;
}

const PREVIEW_PANEL_WIDTH_STORAGE_KEY = "t3code:preview-panel-width";
/** Fork: the panel narrows as far as the chat column beside it. */
export const PREVIEW_PANEL_MIN_WIDTH = 150;
const PREVIEW_PANEL_MAX_WIDTH_FRACTION = 0.7;
/**
 * Floor for the column beside the panel, kept small so diffs get the room. Below about 300px
 * the composer's controls stop fitting and scroll sideways, which the fork accepts.
 */
export const SIBLING_COLUMN_MIN_WIDTH = 150;
const PREVIEW_PANEL_DEFAULT_WIDTH = 540;

export function usePreviewPanelInlineSize(
  options: {
    readonly enabled?: boolean | undefined;
    readonly widthStorageKey?: string | undefined;
    readonly defaultWidth?: number | undefined;
    readonly container?: HTMLElement | null | undefined;
  } = {},
): PreviewPanelInlineSize {
  const enabled = options.enabled ?? true;
  const container = options.container;
  const [maxWidth, setMaxWidth] = useState(() =>
    getPreviewPanelMaxWidth(typeof window === "undefined" ? 1280 : window.innerWidth),
  );
  const rowRef = useRef<HTMLElement | null>(null);
  const { width, handlers } = useResizableWidth({
    storageKey: options.widthStorageKey ?? PREVIEW_PANEL_WIDTH_STORAGE_KEY,
    defaultWidth: options.defaultWidth ?? PREVIEW_PANEL_DEFAULT_WIDTH,
    minWidth: PREVIEW_PANEL_MIN_WIDTH,
    maxWidth,
    edge: "left",
    snapWidths: () => (rowRef.current ? getPreviewPanelSnapWidths(rowRef.current.clientWidth) : []),
    snapLabel: (index) => PREVIEW_PANEL_SNAPS[index]?.label,
  });
  const observeRow = (host: HTMLElement) => {
    const row = container ?? (enabled ? host.parentElement : null) ?? null;
    rowRef.current = row;
    // Ref callbacks run before paint, so the width is clamped without an over-wide
    // flash on mount. Only the derived cap is stored: the row resizes every frame
    // of a sidebar drag, but an unchanged cap skips re-rendering the owner.
    const measure = () => {
      setMaxWidth(getPreviewPanelMaxWidth(window.innerWidth, row?.clientWidth));
    };
    measure();
    let frame = 0;
    const onResize = () => {
      if (frame !== 0) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        measure();
      });
    };
    window.addEventListener("resize", onResize);
    const stopObserving = row ? observeResize(row, measure) : undefined;
    return () => {
      window.removeEventListener("resize", onResize);
      if (frame !== 0) window.cancelAnimationFrame(frame);
      stopObserving?.();
      if (rowRef.current === row) rowRef.current = null;
    };
  };
  return { width, handlers, observeRow };
}

export function getPreviewPanelMaxWidth(viewportWidth: number, containerWidth?: number): number {
  const fractionCap = Math.floor(viewportWidth * PREVIEW_PANEL_MAX_WIDTH_FRACTION);
  const containerCap =
    containerWidth === undefined ? Infinity : Math.floor(containerWidth) - SIBLING_COLUMN_MIN_WIDTH;
  // Keep max >= min; an inverted clamp would overwrite the saved width on drag end.
  return Math.max(PREVIEW_PANEL_MIN_WIDTH, Math.min(fractionCap, containerCap));
}

/**
 * Fork: the splits the divider snaps to, as the panel's share of the row it shares with the
 * column on its left (the chat, or the pull request list), which ends at the sidebar. Labels read
 * left · right.
 */
const PREVIEW_PANEL_SNAPS = [
  { panelShare: 1 / 2, label: "1/2 · 1/2" },
  { panelShare: 3 / 5, label: "2/5 · 3/5" },
  { panelShare: 2 / 3, label: "1/3 · 2/3" },
] as const;

function getPreviewPanelSnapWidths(rowWidth: number): readonly number[] {
  return PREVIEW_PANEL_SNAPS.map(({ panelShare }) => Math.round(rowWidth * panelShare));
}
