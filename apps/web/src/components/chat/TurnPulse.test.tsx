import type { ReactElement } from "react";
import { describe, expect, it } from "vite-plus/test";

import { TurnPulse } from "./TurnPulse";
import type { TurnPulseFill, TurnPulseVerdict } from "./turnPulse.logic";

type FillEl = ReactElement<{
  key?: string | number | null;
  className: string;
  style: { width?: string; animationPlayState?: string };
}>;
type TrackEl = ReactElement<{ className: string; children: FillEl }>;

/**
 * The component is pure, so its tree can be read without a renderer. Children
 * are [mascot | null, coarse track, fine track]; render() omits the mascot.
 */
function render(verdict: TurnPulseVerdict) {
  return TurnPulse({ verdict }) as ReactElement<{
    "aria-label": string;
    children: [ReactElement | null, TrackEl, TrackEl];
  }> | null;
}

const coarseWidth = (el: ReturnType<typeof render>) =>
  Number(/([\d.]+)%/.exec(el!.props.children[1].props.children.props.style.width!)![1]);
const fineFill = (el: ReturnType<typeof render>) => el!.props.children[2].props.children;
const finePlayState = (el: ReturnType<typeof render>) =>
  fineFill(el).props.style.animationPlayState;
const barClass = (el: ReturnType<typeof render>) =>
  el!.props.children[1].props.children.props.className;

const fill = (over: Partial<TurnPulseFill> = {}): TurnPulseFill => ({
  coarse: 0.4,
  fine: 0.4,
  fineCycle: 0,
  phase: undefined,
  ...over,
});

const mascotSrc = (over: Partial<TurnPulseFill> = {}) => {
  const el = TurnPulse({
    verdict: { kind: "moving", tokenChunks: 1, fill: fill(over) },
    mascot: true,
  }) as ReactElement<{ children: unknown[] }>;
  const img = el.props.children.find(
    (c): c is ReactElement<{ src: string }> =>
      c != null && typeof c === "object" && (c as ReactElement).type === "img",
  );
  return img?.props.src;
};

describe("TurnPulse", () => {
  it("renders nothing when there is nothing to report", () => {
    expect(render({ kind: "hidden" })).toBeNull();
  });

  it("widens the coarse track with cumulative progress, never reaching full", () => {
    expect(
      coarseWidth(render({ kind: "moving", tokenChunks: 1, fill: fill({ coarse: 0.6 }) })),
    ).toBeGreaterThan(
      coarseWidth(render({ kind: "moving", tokenChunks: 1, fill: fill({ coarse: 0.3 }) })),
    );
    expect(
      coarseWidth(render({ kind: "moving", tokenChunks: 1, fill: fill({ coarse: 0.999 }) })),
    ).toBeLessThan(100);
  });

  it("rises the fine track while generating and freezes it otherwise", () => {
    // Each chunk animates a full rise to 100 (a CSS one-shot); it runs only
    // while generating, and a tool, first-token wait, or stall freezes it.
    expect(
      fineFill(render({ kind: "moving", tokenChunks: 1, fill: fill() })).props.className,
    ).toContain("animate-turn-fine-fill");
    expect(finePlayState(render({ kind: "moving", tokenChunks: 1, fill: fill() }))).toBe("running");
    expect(finePlayState(render({ kind: "paused", tokenChunks: 1, fill: fill() }))).toBe("paused");
    expect(finePlayState(render({ kind: "waiting", tokenChunks: 0, fill: fill() }))).toBe("paused");
    expect(
      finePlayState(render({ kind: "stalled", tokenChunks: 1, quietForMs: 12_000, fill: fill() })),
    ).toBe("paused");
  });

  it("shows a coarse sliver from the very first frame", () => {
    expect(
      coarseWidth(render({ kind: "waiting", tokenChunks: 0, fill: fill({ coarse: 0, fine: 0 }) })),
    ).toBeGreaterThan(0);
  });

  it("colours every working state Claude orange, only stall red", () => {
    // The pre-first-token wait and tool pauses are still the turn working, so
    // they stay orange; the frozen fine bar signals the pause, not the colour.
    expect(barClass(render({ kind: "moving", tokenChunks: 5, fill: fill() }))).toContain(
      "bg-[#d97757]",
    );
    expect(barClass(render({ kind: "waiting", tokenChunks: 0, fill: fill() }))).toContain(
      "bg-[#d97757]",
    );
    expect(barClass(render({ kind: "paused", tokenChunks: 5, fill: fill() }))).toContain(
      "bg-[#d97757]",
    );
    expect(
      barClass(render({ kind: "stalled", tokenChunks: 5, quietForMs: 12_000, fill: fill() })),
    ).toContain("bg-red-500");
  });

  it("labels each state for screen readers", () => {
    expect(render({ kind: "moving", tokenChunks: 1, fill: fill() })!.props["aria-label"]).toBe(
      "Agent output streaming",
    );
    expect(render({ kind: "waiting", tokenChunks: 0, fill: fill() })!.props["aria-label"]).toBe(
      "Waiting for agent output",
    );
    expect(render({ kind: "paused", tokenChunks: 1, fill: fill() })!.props["aria-label"]).toBe(
      "Agent running a tool",
    );
    expect(
      render({ kind: "stalled", tokenChunks: 1, quietForMs: 12_000, fill: fill() })!.props[
        "aria-label"
      ],
    ).toBe("No agent output");
  });

  it("shows the mascot only for Claude turns", () => {
    const hasImg = (mascot: boolean) => {
      const el = TurnPulse({
        verdict: { kind: "moving", tokenChunks: 1, fill: fill() },
        mascot,
      }) as ReactElement<{ children: unknown[] }>;
      return el.props.children.some(
        (c) => c != null && typeof c === "object" && (c as ReactElement).type === "img",
      );
    };
    expect(hasImg(true)).toBe(true);
    expect(hasImg(false)).toBe(false);
  });

  it("swaps the mascot to the dancing gif while thinking, typing otherwise", () => {
    const thinking = mascotSrc({ phase: "thinking" });
    const answering = mascotSrc({ phase: "answering" });
    const noPhase = mascotSrc({ phase: undefined });
    // Thinking gets its own gif; answering and a phaseless turn share the typing
    // gif. The exact URLs are Vite-hashed, so assert the relationship, not values.
    expect(thinking).not.toBe(answering);
    expect(answering).toBe(noPhase);
  });

  it("holds the coarse fill when a tool runs instead of resetting", () => {
    expect(
      coarseWidth(render({ kind: "paused", tokenChunks: 5, fill: fill({ coarse: 0.5 }) })),
    ).toBe(coarseWidth(render({ kind: "moving", tokenChunks: 5, fill: fill({ coarse: 0.5 }) })));
  });
});
