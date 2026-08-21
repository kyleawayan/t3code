import type { ReactElement } from "react";
import { describe, expect, it } from "vite-plus/test";

import { TurnPulse } from "./TurnPulse";
import type { TurnPulseVerdict } from "./turnPulse.logic";

/** The component is pure, so its element tree can be read without a renderer. */
function render(verdict: TurnPulseVerdict) {
  return TurnPulse({ verdict }) as ReactElement<{
    className: string;
    "aria-label": string;
    children: ReactElement<{ className: string; style: { transform: string } }>;
  }> | null;
}

const offsetOf = (element: ReturnType<typeof render>) =>
  Number(/translateX\((-?[\d.]+)%\)/.exec(element!.props.children.props.style.transform)![1]);

describe("TurnPulse", () => {
  it("renders nothing when there is nothing to report", () => {
    expect(render({ kind: "hidden" })).toBeNull();
  });

  it("advances only with real output", () => {
    // The whole premise: the sweep cannot move without generated output.
    const at = (travel: number) => offsetOf(render({ kind: "moving", tokenChunks: 1, travel }));
    expect(at(0.5)).toBeGreaterThan(at(0));
    expect(at(0.9)).toBeGreaterThan(at(0.5));
  });

  it("enters and exits rather than filling toward an end", () => {
    // Starts fully off the left and ends fully off the right, so it never rests
    // at a position that reads as a value.
    expect(offsetOf(render({ kind: "moving", tokenChunks: 1, travel: 0 }))).toBe(-100);
    expect(offsetOf(render({ kind: "moving", tokenChunks: 1, travel: 0.999 }))).toBeGreaterThan(95);
  });

  it("keeps sweeping past a full lap instead of stopping", () => {
    // A turn has no knowable finish, so lap four looks like lap one.
    expect(offsetOf(render({ kind: "moving", tokenChunks: 1, travel: 4.25 }))).toBeCloseTo(
      offsetOf(render({ kind: "moving", tokenChunks: 1, travel: 0.25 })),
      5,
    );
  });

  it("switches colour and label when the turn goes quiet", () => {
    const moving = render({ kind: "moving", tokenChunks: 5, travel: 0.4 })!;
    const stalled = render({ kind: "stalled", tokenChunks: 5, quietForMs: 12_000, travel: 0.4 })!;
    expect(moving.props.children.props.className).toContain("via-sky-500");
    expect(stalled.props.children.props.className).toContain("via-orange-500");
    expect(moving.props["aria-label"]).toBe("Agent output streaming");
    expect(stalled.props["aria-label"]).toBe("No agent output");
  });

  it("keeps the same widget while a tool runs, muted and held", () => {
    // The live run flickered here: hiding the pulse swapped in a different
    // indicator and back on every tool call.
    const paused = render({ kind: "paused", tokenChunks: 5, travel: 0.4 })!;
    expect(paused).not.toBeNull();
    expect(paused.props.children.props.className).toContain("via-muted-foreground/45");
    expect(paused.props["aria-label"]).toBe("Agent running a tool");
    expect(offsetOf(paused)).toBe(
      offsetOf(render({ kind: "moving", tokenChunks: 5, travel: 0.4 })),
    );
  });

  it("freezes where the last token left it", () => {
    // Stalling must not reset or restart the travel — the position it stopped
    // at is the evidence.
    expect(
      offsetOf(render({ kind: "stalled", tokenChunks: 5, quietForMs: 12_000, travel: 0.4 })),
    ).toBe(offsetOf(render({ kind: "moving", tokenChunks: 5, travel: 0.4 })));
  });
});
