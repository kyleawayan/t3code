import { useEffect, useRef, type MouseEvent, type PointerEvent } from "react";

/** Matches the fill's transition on `[data-hold-to-open]` in index.css. */
export const HOLD_TO_OPEN_MS = 500;

/**
 * Button handlers for a disclosure that opens on a press and hold. With `hold`, a pointer press
 * opens it only after `HOLD_TO_OPEN_MS` held down, and a quick click does nothing; keyboard
 * presses still toggle. Without it, a click toggles as usual.
 */
export function useHoldToOpen(hold: boolean, toggle: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef<HTMLElement | null>(null);
  // The opened disclosure re-renders without `hold`, so the release's click must not close it.
  const openedByHold = useRef(false);
  const release = () => {
    if (held.current) delete held.current.dataset.holding;
    held.current = null;
  };
  const cancel = () => {
    release();
    if (timer.current === null) return;
    clearTimeout(timer.current);
    timer.current = null;
  };
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- clears a pending hold timer when the control unmounts mid-press
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );
  return {
    // The fill shown while holding (index.css) keys off these two attributes.
    "data-hold-to-open": hold ? "" : undefined,
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      openedByHold.current = false;
      if (!hold || event.button !== 0) return;
      cancel();
      held.current = event.currentTarget;
      held.current.dataset.holding = "";
      timer.current = setTimeout(() => {
        timer.current = null;
        release();
        openedByHold.current = true;
        toggle();
      }, HOLD_TO_OPEN_MS);
    },
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
    // A pointer click reports its count in `detail`; Enter and Space report 0.
    onClick: (event: MouseEvent<HTMLElement>) => {
      // Only the hold's own release is a pointer click; a later Enter or Space still toggles.
      if (openedByHold.current) {
        openedByHold.current = false;
        if (event.detail !== 0) return;
      }
      if (!hold || event.detail === 0) toggle();
    },
  };
}
