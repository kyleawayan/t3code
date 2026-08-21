import { describe, expect, it } from "vite-plus/test";
import { ThreadId } from "@t3tools/contracts";

import { formatQuietFor, resolveTurnPulse } from "./turnPulse.logic";

const NOW = Date.parse("2026-08-21T00:00:30.000Z");
const activity = (
  over: Partial<Parameters<typeof resolveTurnPulse>[0]["activity"] & object> = {},
) =>
  ({
    threadId: ThreadId.make("thread-1"),
    state: "generating",
    tokenChunks: 12,
    updatedAt: "2026-08-21T00:00:29.000Z",
    ...over,
  }) as NonNullable<Parameters<typeof resolveTurnPulse>[0]["activity"]>;

describe("resolveTurnPulse", () => {
  it("shows nothing when no turn is running", () => {
    expect(resolveTurnPulse({ activity: undefined, nowMs: NOW })).toEqual({ kind: "hidden" });
  });

  it("pauses rather than hiding through states that are silent by nature", () => {
    // Hiding swapped the indicator for a different one mid-turn, so the row
    // flickered between two shapes every time the agent touched a tool. Same
    // widget, held still — and never alarming, because this silence has a
    // reason.
    expect(resolveTurnPulse({ activity: activity({ state: "tool" }), nowMs: NOW }).kind).toBe(
      "paused",
    );
    expect(resolveTurnPulse({ activity: activity({ state: "waiting" }), nowMs: NOW }).kind).toBe(
      "paused",
    );
    // Long past the warning window, a running tool still must not alarm.
    expect(
      resolveTurnPulse({
        activity: activity({ state: "tool", updatedAt: "2026-08-21T00:00:00.000Z" }),
        nowMs: NOW,
      }).kind,
    ).toBe("paused");
  });

  it("hides only when no turn is running", () => {
    expect(resolveTurnPulse({ activity: activity({ state: "idle" }), nowMs: NOW }).kind).toBe(
      "hidden",
    );
  });

  it("moves while tokens are recent", () => {
    const verdict = resolveTurnPulse({ activity: activity(), nowMs: NOW });
    expect(verdict.kind).toBe("moving");
    if (verdict.kind === "moving") expect(verdict.tokenChunks).toBe(12);
  });

  it("calls a turn stalled once it has produced nothing for the warning window", () => {
    const verdict = resolveTurnPulse({
      activity: activity({ updatedAt: "2026-08-21T00:00:15.000Z" }),
      nowMs: NOW,
    });
    expect(verdict.kind).toBe("stalled");
    if (verdict.kind === "stalled") expect(verdict.quietForMs).toBe(15_000);
  });

  it("treats a turn awaiting its first token the same as one that went quiet", () => {
    // The reported failure: the request goes out and no token ever comes back.
    const verdict = resolveTurnPulse({
      activity: activity({ state: "quiet", tokenChunks: 0, updatedAt: "2026-08-21T00:00:10.000Z" }),
      nowMs: NOW,
    });
    expect(verdict.kind).toBe("stalled");
  });

  it("keeps moving rather than alarming when the timestamp is unreadable", () => {
    expect(
      resolveTurnPulse({ activity: activity({ updatedAt: "nonsense" }), nowMs: NOW }).kind,
    ).toBe("moving");
  });
});

describe("travel", () => {
  it("uses real output volume when the provider reports it", () => {
    // 220 tokens carries the sweep exactly one lap.
    const verdict = resolveTurnPulse({
      activity: activity({ generatedTokens: 110 }),
      nowMs: NOW,
    });
    expect(verdict.kind).toBe("moving");
    if (verdict.kind === "moving") expect(verdict.travel).toBeCloseTo(0.5, 5);
  });

  it("falls back to frame count for a provider that reports no volume", () => {
    // Same motion, coarser resolution — never a dead bar.
    const verdict = resolveTurnPulse({ activity: activity({ tokenChunks: 8 }), nowMs: NOW });
    expect(verdict.kind).toBe("moving");
    if (verdict.kind === "moving") expect(verdict.travel).toBeCloseTo(0.5, 5);
  });
});

describe("formatQuietFor", () => {
  it("reads in the largest useful unit", () => {
    expect(formatQuietFor(9_000)).toBe("9s");
    expect(formatQuietFor(75_000)).toBe("1m");
    expect(formatQuietFor(3_900_000)).toBe("1h 5m");
  });
});
