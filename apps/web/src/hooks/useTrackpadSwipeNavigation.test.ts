import { describe, expect, it } from "vite-plus/test";

import { initialSwipeState, reduceSwipe, type SwipeInput } from "./useTrackpadSwipeNavigation";

type TestInput = Partial<Omit<SwipeInput, "claimed">> & {
  readonly claimed?: boolean;
};

function run(inputs: readonly TestInput[], onScrollCheck?: () => void) {
  let state = initialSwipeState;
  const navigations: string[] = [];
  inputs.forEach(({ claimed = false, ...input }, index) => {
    const result = reduceSwipe(state, {
      deltaX: 0,
      deltaY: 0,
      timeStamp: index * 16,
      canGoBack: true,
      canGoForward: true,
      handled: false,
      ...input,
      claimed: () => {
        onScrollCheck?.();
        return claimed;
      },
    });
    state = result.state;
    if (result.navigate) navigations.push(result.navigate);
  });
  return navigations;
}

// Fingers never move perfectly sideways, so trackpad swipes carry a little vertical movement.
const swipe = (deltaX: number, count: number, extra: TestInput = {}) =>
  Array.from({ length: count }, () => ({ deltaX, deltaY: -1, ...extra }));

describe("reduceSwipe", () => {
  it("goes back on a rightward swipe and forward on a leftward one, once per gesture", () => {
    expect(run(swipe(-30, 20))).toEqual(["back"]);
    expect(run(swipe(30, 20))).toEqual(["forward"]);
  });

  it("ignores mouse thumb wheels, which scroll perfectly sideways", () => {
    // Recorded from a Logitech thumb wheel with smooth scrolling: deltaY is always exactly 0.
    const thumbWheel = [-4, -9, -61, -55, -95, -25, -25, -19].map((deltaX) => ({ deltaX }));
    expect(run(thumbWheel)).toEqual([]);
  });

  it("does not let a vertical-only event finish a thumb-wheel swipe", () => {
    const thumbWheel = [-30, -30, -30, -30, -30, -30].map((deltaX) => ({ deltaX }));
    expect(run([...thumbWheel, { deltaX: 0, deltaY: 5 }, { deltaX: -30 }])).toEqual([]);
  });

  it("ignores the rest of a gesture once a panel handled part of it", () => {
    expect(run([...swipe(-30, 3, { handled: true }), ...swipe(-30, 10)])).toEqual([]);
  });

  it("keeps one gesture across a render stall until the scroll ends", () => {
    // A sideways scroller claimed the gesture, then a stalled renderer delivered its momentum late.
    const scrolling = swipe(-30, 5, { claimed: true });
    const lateMomentum = [-900, -60, -50].map((deltaX, index) => ({
      deltaX,
      deltaY: -1,
      timeStamp: 64 + 300 + index * 16,
    }));
    expect(run([...scrolling, ...lateMomentum])).toEqual([]);
  });

  it("ignores short swipes", () => {
    expect(run(swipe(-30, 3))).toEqual([]);
  });

  it("ignores gestures that start vertical, even when they drift sideways", () => {
    expect(run([{ deltaX: -2, deltaY: 20 }, ...swipe(-30, 20)])).toEqual([]);
  });

  it("waits for real movement before choosing the axis", () => {
    expect(run([{ deltaX: 0, deltaY: 0 }, ...swipe(-30, 10)])).toEqual(["back"]);
    expect(run([{ deltaX: -1, deltaY: -1 }, ...swipe(-30, 10)])).toEqual(["back"]);
  });

  it("checks whether something claims the gesture once, and never for vertical scrolls", () => {
    let verticalChecks = 0;
    run(
      Array.from({ length: 20 }, () => ({ deltaX: -1, deltaY: 30 })),
      () => verticalChecks++,
    );
    let swipeChecks = 0;
    run(swipe(-30, 20), () => swipeChecks++);
    expect(verticalChecks).toBe(0);
    expect(swipeChecks).toBe(1);
  });

  it("ignores gestures something else claims, like a sideways scroller or an open modal", () => {
    expect(run(swipe(-30, 20, { claimed: true }))).toEqual([]);
  });

  it("ignores the momentum burst that lands after navigating", () => {
    const swipeBack = swipe(-30, 10);
    // Recorded on a real trackpad: rendering the new route stalls wheel events, and Chromium
    // delivers the queued momentum as one large event after a gap, then a decaying tail.
    const momentum = [-1106, -56, -53, -49, -40, -30].map((deltaX, index) => ({
      deltaX,
      timeStamp: 160 + 220 + index * 16,
    }));
    expect(run([...swipeBack, ...momentum])).toEqual(["back"]);
  });

  it("ignores swipes toward a direction with no history", () => {
    expect(run(swipe(-30, 20, { canGoBack: false }))).toEqual([]);
    expect(run(swipe(30, 20, { canGoForward: false }))).toEqual([]);
  });

  it("restarts the swipe when it reverses", () => {
    // Recorded: a new swipe often opens with the last swipe's leftover momentum in the other direction.
    expect(run([{ deltaX: 105 }, ...swipe(-30, 5)])).toEqual(["back"]);
  });

  it("starts a new gesture after a pause", () => {
    const first = swipe(-30, 10);
    const second = swipe(-30, 10).map((input, index) => ({
      ...input,
      timeStamp: 10_000 + index * 16,
    }));
    expect(run([...first, ...second])).toEqual(["back", "back"]);
  });
});
