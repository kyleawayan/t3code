import type { ReactElement } from "react";
import { describe, expect, it } from "vite-plus/test";

import { TurnPulse } from "./TurnPulse";
import type { TurnPulseVerdict } from "./turnPulse.logic";

/** The component is pure, so its element tree can be read without a renderer. */
function render(verdict: TurnPulseVerdict) {
  return TurnPulse({ verdict }) as ReactElement<{
    className: string;
    "aria-label": string;
    children: ReactElement<{ className: string; style: { width: string } }>;
  }> | null;
}

const fillOf = (element: ReturnType<typeof render>) =>
  Number(/([\d.]+)%/.exec(element!.props.children.props.style.width)![1]);
const classOf = (element: ReturnType<typeof render>) => element!.props.children.props.className;

describe("TurnPulse", () => {
  it("renders nothing when there is nothing to report", () => {
    expect(render({ kind: "hidden" })).toBeNull();
  });

  it("fills further with more output", () => {
    // The whole premise: the bar's width is paid for by real generated volume.
    expect(fillOf(render({ kind: "moving", tokenChunks: 1, travel: 0.6 }))).toBeGreaterThan(
      fillOf(render({ kind: "moving", tokenChunks: 1, travel: 0.3 })),
    );
  });

  it("never reaches full, so it never claims the turn is done", () => {
    // Even at extreme travel the fill stays under 100 — a turn has no knowable
    // end to fill toward.
    expect(fillOf(render({ kind: "moving", tokenChunks: 1, travel: 0.999 }))).toBeLessThan(100);
  });

  it("shows a sliver from the very first frame", () => {
    // The bar was invisible at the start of every turn; a floor keeps it
    // legible the instant a turn begins.
    expect(fillOf(render({ kind: "waiting", tokenChunks: 0, travel: 0 }))).toBeGreaterThan(0);
  });

  it("colours by state", () => {
    expect(classOf(render({ kind: "moving", tokenChunks: 5, travel: 0.4 }))).toContain(
      "bg-sky-500",
    );
    expect(
      classOf(render({ kind: "stalled", tokenChunks: 5, quietForMs: 12_000, travel: 0.4 })),
    ).toContain("bg-orange-500");
    // Holding states (tool, waiting-for-first-token) dim rather than alarm.
    expect(classOf(render({ kind: "paused", tokenChunks: 5, travel: 0.4 }))).toContain(
      "bg-muted-foreground/40",
    );
    expect(classOf(render({ kind: "waiting", tokenChunks: 0, travel: 0.4 }))).toContain(
      "bg-muted-foreground/40",
    );
  });

  it("labels each state for screen readers", () => {
    expect(render({ kind: "moving", tokenChunks: 1, travel: 0.4 })!.props["aria-label"]).toBe(
      "Agent output streaming",
    );
    expect(render({ kind: "waiting", tokenChunks: 0, travel: 0 })!.props["aria-label"]).toBe(
      "Waiting for agent output",
    );
    expect(render({ kind: "paused", tokenChunks: 1, travel: 0.4 })!.props["aria-label"]).toBe(
      "Agent running a tool",
    );
    expect(
      render({ kind: "stalled", tokenChunks: 1, quietForMs: 12_000, travel: 0.4 })!.props[
        "aria-label"
      ],
    ).toBe("No agent output");
  });

  it("holds its fill when a tool runs instead of resetting", () => {
    // A bar that dropped to zero when the agent picked up a tool would read as
    // losing progress.
    expect(fillOf(render({ kind: "paused", tokenChunks: 5, travel: 0.5 }))).toBe(
      fillOf(render({ kind: "moving", tokenChunks: 5, travel: 0.5 })),
    );
  });
});
