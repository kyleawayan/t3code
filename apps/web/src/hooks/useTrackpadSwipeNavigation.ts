import { type RefObject, useEffect } from "react";

import { isMacPlatform } from "../lib/utils";

const SWIPE_DISTANCE_PX = 120;
// A trackpad gesture, momentum included, sends wheel events far closer together than this.
const GESTURE_GAP_MS = 150;
// Rendering the new route stalls wheel events, so its momentum lands after a gap that looks like a
// new gesture. After navigating, only a scroll end or a pause this long starts one.
const POST_NAVIGATION_GAP_MS = 1000;
// Gestures often open with a zero or diagonal nudge, so the axis waits for this much movement.
const AXIS_LOCK_PX = 4;

export interface SwipeState {
  readonly lastTimeStamp: number;
  readonly distance: number;
  readonly settled: boolean;
  readonly navigated: boolean;
  readonly pendingX: number;
  readonly pendingY: number;
  /** Fingers never move perfectly sideways; a mouse thumb wheel or Shift+wheel does. */
  readonly sawVertical: boolean;
}

export const initialSwipeState: SwipeState = {
  lastTimeStamp: Number.NEGATIVE_INFINITY,
  distance: 0,
  settled: false,
  navigated: false,
  pendingX: 0,
  pendingY: 0,
  sawVertical: false,
};

export interface SwipeInput {
  readonly deltaX: number;
  readonly deltaY: number;
  readonly timeStamp: number;
  /** Called once per gesture: it reads layout, which is too costly for every wheel event. */
  readonly canScrollHorizontally: (direction: number) => boolean;
  readonly canGoBack: boolean;
  readonly canGoForward: boolean;
}

/**
 * Like Chrome's two-finger history swipe: a gesture that starts horizontal on content that can't
 * scroll that way navigates once. Vertical and scrolling gestures stay settled until they end.
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
  const gap = state.navigated ? POST_NAVIGATION_GAP_MS : GESTURE_GAP_MS;
  const current = input.timeStamp - state.lastTimeStamp > gap ? initialSwipeState : state;
  const lastTimeStamp = input.timeStamp;
  if (current.settled) {
    return { state: { ...current, lastTimeStamp }, navigate: null, preview: 0 };
  }
  const sawVertical = current.sawVertical || input.deltaY !== 0;
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
    if (Math.abs(pendingY) >= Math.abs(pendingX) || input.canScrollHorizontally(pendingX)) {
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
    state: { ...current, lastTimeStamp, distance, sawVertical, settled: true, navigated: true },
    navigate: distance < 0 ? "back" : "forward",
    preview: distance,
  };
}

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
      // Panels that handle horizontal wheel input themselves (device orbit, preview stream,
      // dialogs) cancel or stop it, so only unclaimed events reach this bubble listener.
      if (event.ctrlKey || event.defaultPrevented) return;
      const result = reduceSwipe(state, {
        deltaX: event.deltaX,
        deltaY: event.deltaY,
        timeStamp: event.timeStamp,
        canScrollHorizontally: (direction) => canScrollHorizontally(event, direction),
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
          result.navigate ? 0 : GESTURE_GAP_MS,
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
