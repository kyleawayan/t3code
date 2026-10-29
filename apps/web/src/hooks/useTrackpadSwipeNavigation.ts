import { type RefObject, useEffect } from "react";

import { isMacPlatform } from "../lib/utils";

const SWIPE_DISTANCE_PX = 120;
// A gesture ends when the desktop app reports its scroll ended; this pause is only a fallback.
// Short gaps can't mark an end: a busy renderer delivers queued momentum late, as one burst.
const GESTURE_TIMEOUT_MS = 1000;
// Wheel events stop arriving well within this once the fingers lift.
const INDICATOR_HIDE_MS = 150;
// Gestures often open with a zero or diagonal nudge, so the axis waits for this much movement.
const AXIS_LOCK_PX = 4;

export interface SwipeState {
  readonly lastTimeStamp: number;
  readonly distance: number;
  readonly settled: boolean;
  readonly pendingX: number;
  readonly pendingY: number;
  /**
   * Fingers never move perfectly sideways; a mouse thumb wheel or Shift+wheel does. Only events
   * that also move sideways count, so a turn of the main wheel can't stand in for a finger.
   */
  readonly sawVertical: boolean;
}

export const initialSwipeState: SwipeState = {
  lastTimeStamp: Number.NEGATIVE_INFINITY,
  distance: 0,
  settled: false,
  pendingX: 0,
  pendingY: 0,
  sawVertical: false,
};

export interface SwipeInput {
  readonly deltaX: number;
  readonly deltaY: number;
  readonly timeStamp: number;
  /** A panel already handled this event, so the gesture is that panel's. */
  readonly handled: boolean;
  /**
   * Whether something else owns a sideways gesture here, such as a scroller or an open modal.
   * Called once per gesture: it reads layout, which is too costly for every wheel event.
   */
  readonly claimed: (direction: number) => boolean;
  readonly canGoBack: boolean;
  readonly canGoForward: boolean;
}

/**
 * Like Chrome's two-finger history swipe: a gesture that starts horizontal where nothing else
 * claims it navigates once. Vertical and claimed gestures stay settled until they end.
 * `preview` is the distance to show, or 0 when it can't navigate that way.
 */
export function reduceSwipe(
  state: SwipeState,
  input: SwipeInput,
): {
  readonly state: SwipeState;
  readonly navigate: "back" | "forward" | null;
  readonly preview: number;
} {
  const timedOut = input.timeStamp - state.lastTimeStamp > GESTURE_TIMEOUT_MS;
  const current = timedOut ? initialSwipeState : state;
  const lastTimeStamp = input.timeStamp;
  if (current.settled || input.handled) {
    return { state: { ...current, lastTimeStamp, settled: true }, navigate: null, preview: 0 };
  }
  const sawVertical = current.sawVertical || (input.deltaY !== 0 && input.deltaX !== 0);
  let distance: number;
  if (current.distance === 0) {
    const pendingX = current.pendingX + input.deltaX;
    const pendingY = current.pendingY + input.deltaY;
    if (Math.abs(pendingX) + Math.abs(pendingY) < AXIS_LOCK_PX) {
      return {
        state: { ...current, lastTimeStamp, pendingX, pendingY, sawVertical },
        navigate: null,
        preview: 0,
      };
    }
    if (Math.abs(pendingY) >= Math.abs(pendingX) || input.claimed(pendingX)) {
      return {
        state: { ...initialSwipeState, lastTimeStamp, settled: true },
        navigate: null,
        preview: 0,
      };
    }
    distance = pendingX;
  } else {
    const reversed = current.distance * input.deltaX < 0;
    distance = reversed ? input.deltaX : current.distance + input.deltaX;
  }
  const canNavigate = sawVertical && (distance < 0 ? input.canGoBack : input.canGoForward);
  if (Math.abs(distance) < SWIPE_DISTANCE_PX || !canNavigate) {
    return {
      state: { ...current, lastTimeStamp, distance, sawVertical },
      navigate: null,
      preview: canNavigate ? distance : 0,
    };
  }
  return {
    state: { ...current, lastTimeStamp, distance, sawVertical, settled: true },
    navigate: distance < 0 ? "back" : "forward",
    preview: distance,
  };
}

// Modal dialogs and sheets only lock scrolling; they don't stop wheel events reaching the page.
const MODAL_BACKDROP = '[data-slot$="dialog-backdrop"], [data-slot="sheet-backdrop"]';

function canScrollHorizontally(event: WheelEvent, direction: number): boolean {
  for (const node of event.composedPath()) {
    if (!(node instanceof Element) || node.scrollWidth <= node.clientWidth) continue;
    const { overflowX } = getComputedStyle(node);
    if (overflowX !== "auto" && overflowX !== "scroll") continue;
    const canMove =
      direction < 0
        ? node.scrollLeft > 0
        : node.scrollLeft + node.clientWidth < node.scrollWidth - 1;
    if (canMove) return true;
  }
  return false;
}

const INDICATOR_SIZE_PX = 128;
// How far the indicator's center slides past the window edge at full progress.
const INDICATOR_REACH_PX = 8;

function showIndicator(element: HTMLElement, distance: number): void {
  const progress = Math.min(Math.abs(distance) / SWIPE_DISTANCE_PX, 1);
  const side = distance < 0 ? "left" : "right";
  const travel = progress * (INDICATOR_SIZE_PX / 2 + INDICATOR_REACH_PX);
  const x = side === "left" ? -INDICATOR_SIZE_PX + travel : INDICATOR_SIZE_PX - travel;
  element.dataset.side = side;
  element.style.transition = "none";
  element.style.opacity = String(0.3 + 0.7 * progress);
  element.style.transform = `translate(${x}px, -50%)`;
}

function hideIndicator(element: HTMLElement): void {
  element.style.transition = "opacity 200ms ease-out";
  element.style.opacity = "0";
}

/**
 * Fork: Electron has no two-finger history swipe. Browsers already do, so desktop only.
 * The indicator is styled directly so a gesture never re-renders React.
 */
export function useTrackpadSwipeNavigation(indicator: RefObject<HTMLElement | null>): void {
  // oxlint-disable-next-line t3code/react-effect-budget -- subscribes to window wheel events.
  useEffect(() => {
    if (window.desktopBridge === undefined || !isMacPlatform(navigator.platform)) return;
    let state = initialSwipeState;
    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    let visible = false;
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey) return;
      const result = reduceSwipe(state, {
        deltaX: event.deltaX,
        deltaY: event.deltaY,
        timeStamp: event.timeStamp,
        // Panels with their own wheel handling (device orbit, preview stream, tab strip) cancel
        // the events they use, or stop them before this bubble listener.
        handled: event.defaultPrevented,
        claimed: (direction) =>
          document.querySelector(MODAL_BACKDROP) !== null ||
          canScrollHorizontally(event, direction),
        canGoBack: navigation.canGoBack,
        canGoForward: navigation.canGoForward,
      });
      state = result.state;
      const element = indicator.current;
      clearTimeout(hideTimer);
      if (element && result.preview !== 0) {
        showIndicator(element, result.preview);
        visible = true;
        // The gesture's last wheel event never says it is the last, so hide once they stop.
        hideTimer = setTimeout(
          () => {
            hideIndicator(element);
            visible = false;
          },
          result.navigate ? 0 : INDICATOR_HIDE_MS,
        );
      } else if (element && visible) {
        hideIndicator(element);
        visible = false;
      }
      if (result.navigate === "back") window.history.back();
      if (result.navigate === "forward") window.history.forward();
    };
    window.addEventListener("wheel", onWheel, { passive: true });
    const stopScrollEnd = window.desktopBridge.onTrackpadScrollEnd?.(() => {
      state = initialSwipeState;
    });
    return () => {
      stopScrollEnd?.();
      clearTimeout(hideTimer);
      window.removeEventListener("wheel", onWheel);
    };
  }, [indicator]);
}
