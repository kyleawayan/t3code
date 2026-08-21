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

  it("reports waiting, not streaming, before the first token of a stretch", () => {
    // Calling this "streaming" claimed output that had not arrived and left the
    // bar frozen at the start of every turn.
    const verdict = resolveTurnPulse({
      activity: activity({ state: "quiet", tokenChunks: 0 }),
      nowMs: NOW,
    });
    expect(verdict.kind).toBe("waiting");
  });

  it("calls a turn stalled once it has produced nothing for the warning window", () => {
    const verdict = resolveTurnPulse({
      activity: activity({ updatedAt: "2026-08-21T00:00:15.000Z" }),
      nowMs: NOW,
    });
    expect(verdict.kind).toBe("stalled");
    if (verdict.kind === "stalled") expect(verdict.quietForMs).toBe(15_000);
  });

  it("gives a turn awaiting its first token a far longer rope", () => {
    // Seen in real use: after a tool result hands a large context back, the
    // model routinely takes 10-20s to emit its first token. Judging that on the
    // mid-stream clock painted every gap between tool calls orange.
    const at = (updatedAt: string) =>
      resolveTurnPulse({
        activity: activity({ state: "quiet", tokenChunks: 0, updatedAt }),
        nowMs: NOW,
      }).kind;
    // 20s of waiting for a first token is healthy (waiting, not stalled).
    expect(at("2026-08-21T00:00:10.000Z")).toBe("waiting");
    // Past 45s it is not.
    expect(at("2026-08-20T23:59:40.000Z")).toBe("stalled");
  });

  it("still alarms fast when output stops mid-stream", () => {
    // Tokens that were flowing and stopped is abnormal within seconds — that is
    // the wedge this exists to catch.
    const verdict = resolveTurnPulse({
      activity: activity({ state: "generating", updatedAt: "2026-08-21T00:00:15.000Z" }),
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

describe("fill", () => {
  const coarseAt = (generatedTokens: number) => {
    const v = resolveTurnPulse({ activity: activity({ generatedTokens }), nowMs: NOW });
    return v.kind === "moving" ? v.fill.coarse : -1;
  };

  it("grows the coarse fill with more real output and never reaches full", () => {
    expect(coarseAt(4_000)).toBeGreaterThan(coarseAt(1_000));
    // Stays short of full across any realistic turn (a very long think is a
    // few thousand tokens); it only rounds to 1 at absurd volumes the display
    // clamps anyway.
    expect(coarseAt(20_000)).toBeLessThan(1);
  });

  it("keeps the fine fill advancing after the coarse fill has flattened", () => {
    // The saturation bug: at high volume the coarse fill barely moves between
    // ticks, but the fine fill must still distinguish them so motion stays
    // visible.
    const near = coarseAt(50_000);
    const later = coarseAt(50_250);
    expect(later - near).toBeLessThan(0.001);
    const fineOf = (generatedTokens: number) => {
      const v = resolveTurnPulse({ activity: activity({ generatedTokens }), nowMs: NOW });
      return v.kind === "moving" ? v.fill.fine : -1;
    };
    expect(fineOf(50_000)).not.toBe(fineOf(50_125));
  });

  it("falls back to frame count when a provider reports no volume", () => {
    const v = resolveTurnPulse({ activity: activity({ tokenChunks: 8 }), nowMs: NOW });
    expect(v.kind).toBe("moving");
    if (v.kind === "moving") expect(v.fill.coarse).toBeGreaterThan(0);
  });
});

describe("phase", () => {
  const fillAt = (over: Parameters<typeof activity>[0]) => {
    const v = resolveTurnPulse({ activity: activity(over), nowMs: NOW });
    return v.kind === "moving" ? v.fill : null;
  };

  it("snaps the coarse fill to full the instant the answer starts", () => {
    // The one honest 100%: thinking is provably done once an answer token
    // arrives, so the thinking bar completes — no forecast involved.
    expect(fillAt({ phase: "answering", generatedTokens: 10 })?.coarse).toBe(1);
  });

  it("climbs the coarse fill on thinking volume but never reaches full while thinking", () => {
    const low = fillAt({ phase: "thinking", generatedTokens: 1_000 })!;
    const high = fillAt({ phase: "thinking", generatedTokens: 4_000 })!;
    expect(high.coarse).toBeGreaterThan(low.coarse);
    expect(high.coarse).toBeLessThan(1);
  });

  it("carries the phase onto the fill so the view can pick the mascot", () => {
    expect(fillAt({ phase: "thinking" })?.phase).toBe("thinking");
    expect(fillAt({ phase: "answering" })?.phase).toBe("answering");
    expect(fillAt({})?.phase).toBeUndefined();
  });

  it("leaves the asymptotic fill untouched for a turn that never reasons", () => {
    // No phase means a non-thinking provider — the coarse fill behaves exactly
    // as it did before phases existed.
    const fill = fillAt({ generatedTokens: 4_000 })!;
    expect(fill.coarse).toBeGreaterThan(0);
    expect(fill.coarse).toBeLessThan(1);
  });
});

describe("formatQuietFor", () => {
  it("reads in the largest useful unit", () => {
    expect(formatQuietFor(9_000)).toBe("9s");
    expect(formatQuietFor(75_000)).toBe("1m");
    expect(formatQuietFor(3_900_000)).toBe("1h 5m");
  });
});
