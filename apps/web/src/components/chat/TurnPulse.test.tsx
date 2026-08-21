import type { ReactElement } from "react";
import { describe, expect, it } from "vite-plus/test";

import { TurnPulse } from "./TurnPulse";
import type { TurnPulseFill, TurnPulseVerdict } from "./turnPulse.logic";

type FillEl = ReactElement<{
  className: string;
  style: { width?: string; animationPlayState?: string };
}>;
type TrackEl = ReactElement<{ className: string; children: FillEl }>;

/** The component is pure, so its element tree can be read without a renderer. */
function render(verdict: TurnPulseVerdict) {
  return TurnPulse({ verdict }) as ReactElement<{
    "aria-label": string;
    children: [TrackEl, TrackEl];
  }> | null;
}

const coarseWidth = (el: ReturnType<typeof render>) =>
  Number(/([\d.]+)%/.exec(el!.props.children[0].props.children.props.style.width!)![1]);
const fineFill = (el: ReturnType<typeof render>) => el!.props.children[1].props.children;
const finePlayState = (el: ReturnType<typeof render>) =>
  fineFill(el).props.style.animationPlayState;
const fineClass = (el: ReturnType<typeof render>) => fineFill(el).props.className;
const barClass = (el: ReturnType<typeof render>) =>
  el!.props.children[0].props.children.props.className;

const fill = (over: Partial<TurnPulseFill> = {}): TurnPulseFill => ({
  coarse: 0.4,
  fine: 0.4,
  ...over,
});

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

  it("runs the fine loop while generating and freezes it otherwise", () => {
    // The fine track fills-and-repeats via a CSS loop, so it keeps moving even
    // when the coarse track has flattened near the top. It runs only while
    // actively generating; a tool, a first-token wait, or a stall freezes it.
    expect(fineClass(render({ kind: "moving", tokenChunks: 1, fill: fill() }))).toContain(
      "animate-turn-fine-fill",
    );
    expect(finePlayState(render({ kind: "moving", tokenChunks: 1, fill: fill() }))).toBe("running");
    expect(finePlayState(render({ kind: "paused", tokenChunks: 1, fill: fill() }))).toBe("paused");
    expect(finePlayState(render({ kind: "waiting", tokenChunks: 0, fill: fill() }))).toBe("paused");
    expect(
      finePlayState(render({ kind: "stalled", tokenChunks: 1, quietForMs: 12_000, fill: fill() })),
    ).toBe("paused");
  });

  it("shows a coarse sliver from the very first frame", () => {
    const el = render({ kind: "waiting", tokenChunks: 0, fill: fill({ coarse: 0, fine: 0 }) });
    expect(coarseWidth(el)).toBeGreaterThan(0);
    // The fine track is present even before it runs (paused at its start frame).
    expect(fineClass(el)).toContain("animate-turn-fine-fill");
  });

  it("colours by state", () => {
    expect(barClass(render({ kind: "moving", tokenChunks: 5, fill: fill() }))).toContain(
      "bg-sky-500",
    );
    expect(
      barClass(render({ kind: "stalled", tokenChunks: 5, quietForMs: 12_000, fill: fill() })),
    ).toContain("bg-orange-500");
    expect(barClass(render({ kind: "paused", tokenChunks: 5, fill: fill() }))).toContain(
      "bg-muted-foreground/40",
    );
    expect(barClass(render({ kind: "waiting", tokenChunks: 0, fill: fill() }))).toContain(
      "bg-muted-foreground/40",
    );
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

  it("holds the coarse fill when a tool runs instead of resetting", () => {
    expect(
      coarseWidth(render({ kind: "paused", tokenChunks: 5, fill: fill({ coarse: 0.5 }) })),
    ).toBe(coarseWidth(render({ kind: "moving", tokenChunks: 5, fill: fill({ coarse: 0.5 }) })));
  });
});
