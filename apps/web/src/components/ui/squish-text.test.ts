import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  SQUISH_TEXT_MIN_SCALE,
  observeSquishTarget,
  resolveSquishScale,
  splitSquishTextHalves,
} from "./squish-text";

describe("resolveSquishScale", () => {
  it("leaves text that fits at full width", () => {
    expect(resolveSquishScale(120, 100)).toBe(1);
    expect(resolveSquishScale(100, 100)).toBe(1);
  });

  it("ignores a shortfall inside the rounding tolerance", () => {
    expect(resolveSquishScale(99, 100)).toBe(1);
  });

  it("squishes text to exactly the available width", () => {
    expect(resolveSquishScale(75, 100)).toBe(0.75);
  });

  it("stops at the minimum scale and leaves the rest to clip", () => {
    expect(resolveSquishScale(20, 100)).toBe(SQUISH_TEXT_MIN_SCALE);
    expect(resolveSquishScale(0, 100)).toBe(SQUISH_TEXT_MIN_SCALE);
  });

  it("treats unmeasured text as fitting", () => {
    expect(resolveSquishScale(0, 0)).toBe(1);
  });
});

describe("splitSquishTextHalves", () => {
  it("keeps the wider half at least the minimum scale's share of the text", () => {
    // The wider half is the min-content floor, so anything shorter would let
    // layout squeeze the text below its minimum scale.
    const halves = splitSquishTextHalves("Claude Opus 4.5");
    expect(halves.join("")).toBe("Claude Opus 4.5");
    expect(Math.max(...halves.map((half) => half.length))).toBeGreaterThanOrEqual(
      15 * SQUISH_TEXT_MIN_SCALE,
    );
  });

  it("keeps spaces at the seam so the halves add up to the full text", () => {
    expect(splitSquishTextHalves("ab cd")).toEqual(["ab ", "cd"]);
  });

  it("does not split a surrogate pair", () => {
    expect(splitSquishTextHalves("a😀")).toEqual(["a", "😀"]);
  });

  it("handles text too short to split", () => {
    expect(splitSquishTextHalves("a")).toEqual(["a", ""]);
    expect(splitSquishTextHalves("")).toEqual(["", ""]);
  });
});

describe("observeSquishTarget", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("fits every SquishText through one shared observer", () => {
    const observers: FakeResizeObserver[] = [];
    class FakeResizeObserver {
      readonly observed = new Set<Element>();
      constructor(readonly callback: (entries: ResizeObserverEntry[]) => void) {
        observers.push(this);
      }
      observe(element: Element) {
        this.observed.add(element);
      }
      unobserve(element: Element) {
        this.observed.delete(element);
      }
      notify(elements: Element[]) {
        this.callback(elements.map((target) => ({ target }) as ResizeObserverEntry));
      }
    }
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    const box = (width: number) => {
      const element = { clientWidth: width, offsetWidth: width, style: { transform: "" } };
      return element as unknown as HTMLElement;
    };
    const squished = { root: box(60), text: box(100) };
    const roomy = { root: box(120), text: box(100) };
    roomy.text.style.transform = "scaleX(0.5)";

    const stopSquished = observeSquishTarget(squished);
    const stopRoomy = observeSquishTarget(roomy);
    expect(observers).toHaveLength(1);
    const [observer] = observers;

    // Both boxes of one SquishText can change in the same frame.
    observer!.notify([squished.root, squished.text, roomy.root]);
    expect(squished.text.style.transform).toBe("scaleX(0.6)");
    expect(roomy.text.style.transform).toBe("");

    stopSquished();
    stopRoomy();
    expect(observer!.observed.size).toBe(0);
  });
});
