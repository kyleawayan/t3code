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

describe("travel", () => {
  it("fills further with more real output and never reaches full", () => {
    const at = (generatedTokens: number) => {
      const v = resolveTurnPulse({ activity: activity({ generatedTokens }), nowMs: NOW });
      return v.kind === "moving" ? v.travel : -1;
    };
    expect(at(800)).toBeGreaterThan(at(200));
    // Asymptotic: even enormous volume stays at or below full, never over.
    expect(at(100_000)).toBeLessThanOrEqual(1);
    expect(at(100_000)).toBeGreaterThan(at(800));
  });

  it("falls back to frame count when a provider reports no volume", () => {
    const v = resolveTurnPulse({ activity: activity({ tokenChunks: 8 }), nowMs: NOW });
    expect(v.kind).toBe("moving");
    if (v.kind === "moving") expect(v.travel).toBeGreaterThan(0);
  });
});

describe("formatQuietFor", () => {
  it("reads in the largest useful unit", () => {
    expect(formatQuietFor(9_000)).toBe("9s");
    expect(formatQuietFor(75_000)).toBe("1m");
    expect(formatQuietFor(3_900_000)).toBe("1h 5m");
  });
});
