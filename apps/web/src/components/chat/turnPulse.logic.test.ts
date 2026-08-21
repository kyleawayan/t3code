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

  it("hides through states that are silent by nature", () => {
    // A frozen pulse during a running tool would train the user to ignore it.
    expect(resolveTurnPulse({ activity: activity({ state: "tool" }), nowMs: NOW }).kind).toBe(
      "hidden",
    );
    expect(resolveTurnPulse({ activity: activity({ state: "waiting" }), nowMs: NOW }).kind).toBe(
      "hidden",
    );
  });

  it("moves while tokens are recent", () => {
    expect(resolveTurnPulse({ activity: activity(), nowMs: NOW })).toEqual({
      kind: "moving",
      tokenChunks: 12,
    });
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

describe("formatQuietFor", () => {
  it("reads in the largest useful unit", () => {
    expect(formatQuietFor(9_000)).toBe("9s");
    expect(formatQuietFor(75_000)).toBe("1m");
    expect(formatQuietFor(3_900_000)).toBe("1h 5m");
  });
});
