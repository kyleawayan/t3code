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
  Number(/translateX\(([-\d.]+)%\)/.exec(element!.props.children.props.style.transform)![1]);

describe("TurnPulse", () => {
  it("renders nothing when there is nothing to report", () => {
    expect(render({ kind: "hidden" })).toBeNull();
  });

  it("advances only with the token count", () => {
    // The whole premise: the pulse cannot move without a token behind it.
    expect(offsetOf(render({ kind: "moving", tokenChunks: 0 }))).toBe(0);
    expect(offsetOf(render({ kind: "moving", tokenChunks: 5 }))).toBeGreaterThan(0);
    expect(offsetOf(render({ kind: "moving", tokenChunks: 10 }))).toBeGreaterThan(
      offsetOf(render({ kind: "moving", tokenChunks: 5 })),
    );
  });

  it("wraps rather than filling toward an end", () => {
    // A turn has no knowable finish, so the travel must never read as progress
    // running out.
    const far = offsetOf(render({ kind: "moving", tokenChunks: 1_000 }));
    expect(far).toBeGreaterThanOrEqual(0);
    expect(far).toBeLessThanOrEqual(300);
  });

  it("switches colour and label when the turn goes quiet", () => {
    const moving = render({ kind: "moving", tokenChunks: 5 })!;
    const stalled = render({ kind: "stalled", tokenChunks: 5, quietForMs: 12_000 })!;
    expect(moving.props.children.props.className).toContain("bg-sky-500");
    expect(stalled.props.children.props.className).toContain("bg-orange-500");
    expect(moving.props["aria-label"]).toBe("Agent output streaming");
    expect(stalled.props["aria-label"]).toBe("No agent output");
  });

  it("freezes where the last token left it", () => {
    // Stalling must not reset or restart the travel — the position it stopped
    // at is the evidence.
    expect(offsetOf(render({ kind: "stalled", tokenChunks: 5, quietForMs: 12_000 }))).toBe(
      offsetOf(render({ kind: "moving", tokenChunks: 5 })),
    );
  });
});
