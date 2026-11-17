import { type PointerEvent, useState } from "react";

export interface ResizeBounds {
  readonly min: number;
  readonly max: number;
}

interface ResizeSession {
  width: number;
  edge: "left" | "right";
  /** Pointer widths are clamped to these before `resize` sees them. */
  bounds: ResizeBounds;
  /** Widths the drag sticks to once the pointer comes within `SNAP_DISTANCE_PX` of one. */
  snap?: readonly number[];
  /** Called when the drag lands on a snap width, not on every frame it stays there. */
  onSnap?: () => void;
  /** The index in `snap` a moved drag sits on, and undefined once it leaves or the drag ends. */
  onSnapChange?: (index: number | undefined) => void;
  resize: (width: number) => number;
  finish: (width: number, moved: boolean) => void;
  cleanup?: (committed: boolean) => void;
}

const SNAP_DISTANCE_PX = 12;

function clampToBounds(width: number, bounds: ResizeBounds): number {
  return Math.max(bounds.min, Math.min(bounds.max, width));
}

function snapIndex(width: number, session: ResizeSession): number | undefined {
  const index =
    session.snap?.findIndex(
      (point) =>
        Math.abs(point - width) <= SNAP_DISTANCE_PX &&
        point >= session.bounds.min &&
        point <= session.bounds.max,
    ) ?? -1;
  return index === -1 ? undefined : index;
}

interface ActiveDrag<T extends HTMLElement> {
  session: ResizeSession;
  target: T;
  pointerId: number;
  startX: number;
  pendingX: number;
  width: number;
  moved: boolean;
  snappedIndex: number | undefined;
  shownSnap: number | undefined;
  frame: number | null;
  onBlur: () => void;
}

function createResizeDrag<T extends HTMLElement>() {
  let drag: ActiveDrag<T> | null = null;

  // `ending`: the release's own flush, which drops the snap label instead of setting it.
  const flush = (ending = false) => {
    const active = drag;
    if (!active) return;
    const delta = (active.pendingX - active.startX) * (active.session.edge === "left" ? -1 : 1);
    if (Math.abs(delta) > 2) active.moved = true;
    const width = clampToBounds(active.session.width + delta, active.session.bounds);
    const index = snapIndex(width, active.session);
    const target = index === undefined ? undefined : active.session.snap?.[index];
    if (index !== undefined && index !== active.snappedIndex) active.session.onSnap?.();
    active.snappedIndex = index;
    const shown = active.moved && !ending ? index : undefined;
    if (shown !== active.shownSnap) {
      active.shownSnap = shown;
      active.session.onSnapChange?.(shown);
    }
    active.width = active.session.resize(target ?? width);
  };

  const finish = (commit: boolean) => {
    const active = drag;
    if (!active) return;
    if (active.frame !== null) cancelAnimationFrame(active.frame);
    window.removeEventListener("blur", active.onBlur);
    if (commit) flush(true);
    // Release can synchronously dispatch lostpointercapture.
    drag = null;
    try {
      if (active.target.hasPointerCapture(active.pointerId)) {
        active.target.releasePointerCapture(active.pointerId);
      }
    } catch {}
    document.body.style.removeProperty("cursor");
    document.body.style.removeProperty("user-select");
    if (active.shownSnap !== undefined) {
      active.shownSnap = undefined;
      active.session.onSnapChange?.(undefined);
    }
    active.session.cleanup?.(commit);
    if (commit) active.session.finish(active.width, active.moved);
  };

  const end = (event: PointerEvent<T>, usePosition: boolean) => {
    const active = drag;
    if (!active || active.pointerId !== event.pointerId) return;
    event.preventDefault();
    if (usePosition) active.pendingX = event.clientX;
    finish(true);
  };

  return {
    ref: (node: T | null) => (node === null ? undefined : () => finish(false)),
    cancel: () => finish(false),
    /** Re-applies the pointer after the row changes, with new bounds and snap widths if given. */
    refresh(bounds?: ResizeBounds, readSnap?: () => readonly number[]) {
      if (!drag) return;
      if (bounds) drag.session.bounds = bounds;
      if (readSnap) drag.session.snap = readSnap();
      flush();
    },
    begin(event: PointerEvent<T>, start: (event: PointerEvent<T>) => ResizeSession | null) {
      if (event.button !== 0 || drag) return;
      const session = start(event);
      if (!session) return;
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        session.cleanup?.(false);
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      // Leaving the window mid-drag commits where the pointer was.
      const onBlur = () => finish(true);
      window.addEventListener("blur", onBlur);
      drag = {
        session,
        target: event.currentTarget,
        pointerId: event.pointerId,
        startX: event.clientX,
        pendingX: event.clientX,
        width: session.width,
        moved: false,
        // A drag that starts on a snap width hasn't landed on it, so it doesn't glow.
        snappedIndex: snapIndex(session.width, session),
        shownSnap: undefined,
        frame: null,
        onBlur,
      };
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    onPointerMove(event: PointerEvent<T>) {
      const active = drag;
      if (!active || active.pointerId !== event.pointerId) return;
      event.preventDefault();
      active.pendingX = event.clientX;
      if (Math.abs(event.clientX - active.startX) > 2) active.moved = true;
      if (active.frame !== null) return;
      active.frame = requestAnimationFrame(() => {
        active.frame = null;
        flush();
      });
    },
    onPointerUp: (event: PointerEvent<T>) => end(event, true),
    onPointerCancel: (event: PointerEvent<T>) => end(event, false),
    onLostPointerCapture: (event: PointerEvent<T>) => end(event, false),
  };
}

/**
 * A pointer drag that resizes along one edge. The session `start` returns owns
 * everything the drag needs, so options read at pointer-down hold for the whole
 * drag. Attach `ref` to the handle so unmounting it abandons the drag.
 */
export function useResizeDrag<T extends HTMLElement>(
  start: (event: PointerEvent<T>) => ResizeSession | null,
) {
  // Created once: `ref` must keep its identity, or a re-render mid-drag would run its cleanup.
  const [drag] = useState(createResizeDrag<T>);
  const { begin, ...rest } = drag;
  return { ...rest, onPointerDown: (event: PointerEvent<T>) => begin(event, start) };
}
