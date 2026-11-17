import * as Schema from "effect/Schema";
import { type PointerEvent as ReactPointerEvent, useLayoutEffect, useState } from "react";

import { getLocalStorageItem, setLocalStorageItem } from "./useLocalStorage";
import { useResizeDrag } from "./useResizeDrag";
import { useStableCallback } from "./useStableCallback";

const WidthSchema = Schema.Finite;

/** The host must size itself from this custom property. */
export const RESIZABLE_WIDTH_PROPERTY = "--resizable-width";

export interface UseResizableWidthOptions {
  readonly storageKey: string;
  readonly defaultWidth: number;
  readonly minWidth: number;
  readonly maxWidth: number;
  readonly edge: "left" | "right";
  /** Read when a drag starts: widths it snaps to, such as half the row. */
  readonly snapWidths?: (() => readonly number[]) | undefined;
  /** Names the snap width at an index of `snapWidths`, shown on the handle while a drag sits on it. */
  readonly snapLabel?: ((index: number) => string | undefined) | undefined;
}

export interface ResizableWidthHandlers {
  readonly ref: (node: HTMLElement | null) => (() => void) | undefined;
  readonly onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  readonly onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  readonly onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
  readonly onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void;
  readonly onLostPointerCapture: (event: ReactPointerEvent<HTMLElement>) => void;
}

/** One glow on the handle's line (its first child) as a drag lands on a snap width. */
function pulseSnapLine(handle: HTMLElement) {
  const line = handle.firstElementChild;
  if (!line || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  line.animate(
    [
      {
        backgroundColor: "var(--primary)",
        boxShadow: "0 0 0 3px color-mix(in srgb, var(--primary) 45%, transparent)",
      },
      { boxShadow: "0 0 0 6px transparent" },
    ],
    { duration: 450, easing: "ease-out" },
  );
}

function showSnapLabel(handle: HTMLElement, label: string | undefined) {
  if (label === undefined) delete handle.dataset.snapLabel;
  else handle.dataset.snapLabel = label;
}

/** Uses the current default until a width is chosen; persists on drag end, not every frame. */
export function useResizableWidth(options: UseResizableWidthOptions): {
  readonly width: number;
  readonly setWidth: (width: number) => void;
  readonly handlers: ResizableWidthHandlers;
} {
  const { storageKey, defaultWidth, minWidth, maxWidth, edge } = options;

  const clamp = (value: number): number => {
    if (!Number.isFinite(value)) return defaultWidth;
    return Math.max(minWidth, Math.min(maxWidth, value));
  };

  const readWidth = (): number | null => {
    if (typeof window === "undefined") return null;
    try {
      const stored = getLocalStorageItem(storageKey, WidthSchema);
      return stored === null ? null : clamp(stored);
    } catch (error) {
      console.error("Could not read persisted panel width.", error);
      return null;
    }
  };
  const [widthState, setWidthState] = useState(() => ({ storageKey, width: readWidth() }));
  if (widthState.storageKey !== storageKey) {
    setWidthState({ storageKey, width: readWidth() });
  }

  const clampedWidth = clamp(widthState.width ?? defaultWidth);
  const restoreWidth = useStableCallback((host: HTMLElement | null) => {
    host?.style.setProperty(RESIZABLE_WIDTH_PROPERTY, `${clampedWidth}px`);
  });

  const commitWidth = (nextStorageKey: string, nextWidth: number) => {
    // Resizing remains usable for this session when browser storage is unavailable.
    setWidthState({ storageKey: nextStorageKey, width: nextWidth });
    try {
      setLocalStorageItem(nextStorageKey, nextWidth, WidthSchema);
    } catch (error) {
      console.error("Could not persist panel width.", error);
    }
  };

  const drag = useResizeDrag<HTMLElement>((event) => {
    const handle = event.currentTarget;
    const host = handle.parentElement;
    // Disable drag transitions through transition-property; the host renders transition-duration.
    host?.style.setProperty("transition-property", "none");
    // The drag commits to the key and width it started from, even if the panel
    // switches keys before the pointer is released.
    const startStorageKey = storageKey;
    const startWidth = clampedWidth;
    return {
      width: startWidth,
      edge,
      bounds: { min: minWidth, max: maxWidth },
      snap: options.snapWidths?.() ?? [],
      onSnap: () => pulseSnapLine(handle),
      onSnapChange: (index) =>
        showSnapLabel(handle, index === undefined ? undefined : options.snapLabel?.(index)),
      resize(nextWidth) {
        host?.style.setProperty(RESIZABLE_WIDTH_PROPERTY, `${nextWidth}px`);
        return nextWidth;
      },
      finish(finalWidth, moved) {
        if (moved) commitWidth(startStorageKey, finalWidth);
        else restoreWidth(host);
      },
      cleanup(committed) {
        host?.style.removeProperty("transition-property");
        if (!committed) host?.style.setProperty(RESIZABLE_WIDTH_PROPERTY, `${startWidth}px`);
      },
    };
  });

  // Bounds can change mid-drag (sidebar opens, window narrows), and the render
  // that carries them rewrites the committed width, so re-apply the live pointer position.
  // Snap widths follow the row too, or the snap label would name a split the panel no longer has.
  const { refresh } = drag;
  const readSnapWidths = useStableCallback(() => options.snapWidths?.() ?? []);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- reapplies the live drag pointer position to the DOM before paint when the bounds change
  useLayoutEffect(
    () => refresh({ min: minWidth, max: maxWidth }, readSnapWidths),
    [refresh, minWidth, maxWidth, readSnapWidths],
  );

  return {
    width: clampedWidth,
    setWidth: (value) => commitWidth(storageKey, clamp(value)),
    handlers: {
      ref: drag.ref,
      onPointerDown: drag.onPointerDown,
      onPointerMove: drag.onPointerMove,
      onPointerUp: drag.onPointerUp,
      onPointerCancel: drag.onPointerCancel,
      onLostPointerCapture: drag.onLostPointerCapture,
    },
  };
}
