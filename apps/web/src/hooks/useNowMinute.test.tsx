import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { useNowMinute } from "./useNowMinute";

let renderer: ReactTestRenderer;
let windowEvents: EventTarget;
let documentEvents: EventTarget;

function Clock() {
  return <span>{useNowMinute()}</span>;
}

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T12:00:30Z"));
  windowEvents = new EventTarget();
  documentEvents = new EventTarget();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("window", {
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    addEventListener: windowEvents.addEventListener.bind(windowEvents),
    removeEventListener: windowEvents.removeEventListener.bind(windowEvents),
  });
  vi.stubGlobal("document", {
    visibilityState: "visible",
    addEventListener: documentEvents.addEventListener.bind(documentEvents),
    removeEventListener: documentEvents.removeEventListener.bind(documentEvents),
  });
  await act(() => {
    renderer = create(<Clock />);
  });
});

afterEach(async () => {
  await act(() => renderer.unmount());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("shared minute clock", () => {
  it("updates mounted consumers at minute boundaries", async () => {
    expect(renderer.toJSON()).toMatchObject({ children: ["2026-01-01T12:00"] });
    await act(() => vi.advanceTimersByTime(30_000));
    expect(renderer.toJSON()).toMatchObject({ children: ["2026-01-01T12:01"] });
    await act(() => vi.advanceTimersByTime(60_000));
    expect(renderer.toJSON()).toMatchObject({ children: ["2026-01-01T12:02"] });
  });

  it.each(["focus", "visibilitychange"])(
    "catches up after sleep on %s without waiting for a timer",
    async (event) => {
      vi.setSystemTime(new Date("2026-01-02T12:00:30Z"));
      await act(() => {
        (event === "focus" ? windowEvents : documentEvents).dispatchEvent(new Event(event));
      });
      expect(renderer.toJSON()).toMatchObject({ children: ["2026-01-02T12:00"] });
    },
  );

  it("catches up when a delayed timer resumes after sleep", async () => {
    vi.setSystemTime(new Date("2026-01-02T12:00:30Z"));
    await act(() => vi.advanceTimersByTime(30_000));
    expect(renderer.toJSON()).toMatchObject({ children: ["2026-01-02T12:01"] });
  });

  it("shares one timer and cleans it up after the last consumer unmounts", async () => {
    await act(() =>
      renderer.update(
        <>
          <Clock />
          <Clock />
        </>,
      ),
    );
    expect(vi.getTimerCount()).toBe(1);
    await act(() => renderer.unmount());
    expect(vi.getTimerCount()).toBe(0);
  });
});
