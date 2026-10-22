import { describe, expect, it, vi } from "vite-plus/test";

import {
  SQUISH_TEXT_MIN_SCALE,
  SQUISH_TEXT_TIGHT_MIN_SCALE,
  observeSquishTarget,
  resolveSquishEllipsisWidth,
  resolveSquishScale,
  resolveSquishVariant,
  splitSquishTextHalves,
  splitSquishTextParts,
} from "./SquishText";

describe("resolveSquishVariant", () => {
  it("keeps the longest form while it still reads at the minimum scale", () => {
    // "Claude Opus 5.5" at 120px, "Opus 5.5" at 64px, "5.5" at 24px.
    expect(resolveSquishVariant(80, [120, 64, 24])).toBe(0);
    expect(resolveSquishVariant(60, [120, 64, 24])).toBe(0);
  });

  it("switches to a shorter form once the longer one would squish past the minimum", () => {
    expect(resolveSquishVariant(50, [120, 64, 24])).toBe(1);
    expect(resolveSquishVariant(20, [120, 64, 24])).toBe(2);
  });

  it("falls back to the shortest form when nothing reads", () => {
    expect(resolveSquishVariant(5, [120, 64, 24])).toBe(2);
  });
});

describe("resolveSquishEllipsisWidth", () => {
  it("narrows the text box so its readable floor fills the room exactly", () => {
    const scale = resolveSquishScale(60, 100, 0.8);
    expect(scale).toBe(0.8);
    expect(resolveSquishEllipsisWidth(60, 100, scale)).toBe(75);
  });

  it("leaves text whole while squishing alone fits it", () => {
    const scale = resolveSquishScale(90, 100, 0.8);
    expect(scale).toBe(0.9);
    expect(resolveSquishEllipsisWidth(90, 100, scale)).toBeNull();
  });
});

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

describe("splitSquishTextParts", () => {
  it("keeps every character and caps the widest run at the minimum scale's share", () => {
    const parts = splitSquishTextParts("Opus 5.5", Math.ceil(1 / SQUISH_TEXT_TIGHT_MIN_SCALE));
    expect(parts.join("")).toBe("Opus 5.5");
    expect(Math.max(...parts.map((part) => part.length))).toBeLessThanOrEqual(
      Math.ceil(8 * SQUISH_TEXT_TIGHT_MIN_SCALE),
    );
  });

  it("drops empty runs from short text", () => {
    expect(splitSquishTextParts("Hi", 3)).toEqual(["H", "i"]);
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
  it("fits each observed SquishText, and stops once cleaned up", async () => {
    let deliver: ((entries: ResizeObserverEntry[]) => void) | undefined;
    class FakeResizeObserver {
      constructor(callback: (entries: ResizeObserverEntry[]) => void) {
        deliver = callback;
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    using _resizeObserver = stubResizeObserver(FakeResizeObserver);
    const box = (width: number) => {
      const element = { clientWidth: width, offsetWidth: width, style: { transform: "" } };
      return element as unknown as HTMLElement;
    };
    const squishedText = box(100);
    const roomyText = box(100);
    const textBox = (text: HTMLElement) =>
      ({ firstElementChild: text, children: [text] }) as unknown as HTMLElement;
    const squished = { root: box(60), textBox: textBox(squishedText) };
    const roomy = { root: box(120), textBox: textBox(roomyText) };
    roomyText.style.transform = "scaleX(0.5)";

    const stopSquished = observeSquishTarget(squished);
    const stopRoomy = observeSquishTarget(roomy);
    // Both boxes of one SquishText can change in the same frame.
    deliver!([squished.root, squishedText, roomy.root].map((target) => ({ target }) as never));
    await Promise.resolve();
    expect(squishedText.style.transform).toBe("scaleX(0.6)");
    expect(roomyText.style.transform).toBe("");

    stopSquished();
    squishedText.style.transform = "";
    deliver!([{ target: squished.root } as never]);
    await Promise.resolve();
    expect(squishedText.style.transform).toBe("");
    stopRoomy();
  });
});

function stubResizeObserver(value: unknown): Disposable {
  vi.stubGlobal("ResizeObserver", value);
  return { [Symbol.dispose]: () => void vi.unstubAllGlobals() };
}
