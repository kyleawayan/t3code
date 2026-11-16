import * as Schema from "effect/Schema";
import { useEffect, useRef, type MouseEvent, type PointerEvent } from "react";

import { useLocalStorage } from "~/hooks/useLocalStorage";

/** Fork: tool call groups ("Used 3 tools") start open, so activity shows without a click each. */
const OPEN_TOOL_GROUPS_STORAGE_KEY = "t3code:open-tool-groups:v1";

export function useOpenToolGroups() {
  return useLocalStorage(OPEN_TOOL_GROUPS_STORAGE_KEY, false, Schema.Boolean);
}

/** Fork: a running turn's closed work opens only on a press and hold, so a stray click can't peek. */
const HOLD_TO_OPEN_WORK_STORAGE_KEY = "t3code:hold-to-open-work:v1";
export const HOLD_TO_OPEN_MS = 500;

export function useHoldToOpenWork() {
  return useLocalStorage(HOLD_TO_OPEN_WORK_STORAGE_KEY, false, Schema.Boolean);
}

/**
 * Button handlers for a work disclosure. With `hold`, a pointer press opens it only after
 * `HOLD_TO_OPEN_MS` held down, and a quick click does nothing; keyboard presses still toggle.
 */
export function useHoldToOpen(hold: boolean, toggle: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The opened row re-renders without `hold`, so the release's click must not close it again.
  const openedByHold = useRef(false);
  const cancel = () => {
    if (timer.current === null) return;
    clearTimeout(timer.current);
    timer.current = null;
  };
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- clears a pending hold timer when the row unmounts mid-press
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );
  return {
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      openedByHold.current = false;
      if (!hold || event.button !== 0) return;
      cancel();
      timer.current = setTimeout(() => {
        timer.current = null;
        openedByHold.current = true;
        toggle();
      }, HOLD_TO_OPEN_MS);
    },
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
    // A pointer click reports its count in `detail`; Enter and Space report 0.
    onClick: (event: MouseEvent<HTMLElement>) => {
      if (openedByHold.current) {
        openedByHold.current = false;
        return;
      }
      if (!hold || event.detail === 0) toggle();
    },
  };
}
