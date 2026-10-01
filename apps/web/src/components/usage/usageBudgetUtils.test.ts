import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  makeUsageBudgetWindow,
  nextUsageBudgetReset,
  parseUsageBudget,
  usageBudgetProgress,
  usageBudgetSegments,
} from "./usageBudgetUtils";

afterEach(() => vi.restoreAllMocks());

describe("API budgets", () => {
  it.each(["100", " 100.50 ", ".25", "0.01"])("accepts a positive USD amount: %s", (amount) => {
    expect(parseUsageBudget(amount)).toBe(Number(amount));
  });

  it.each(["", "0", "-1", "Infinity", "NaN", "1e3", "0.001", "10.999", "100 dollars"])(
    "rejects an invalid USD amount: %s",
    (amount) => expect(parseUsageBudget(amount)).toBeNull(),
  );

  it("uses the viewer's calendar month at a UTC month boundary", () => {
    const original = Intl.DateTimeFormat;
    vi.spyOn(Intl, "DateTimeFormat").mockImplementation(function (locales, options) {
      return new original(locales, { ...options, timeZone: "America/Los_Angeles" });
    });
    expect(makeUsageBudgetWindow("month", new Date("2026-10-01T02:00:00Z"))).toMatchObject({
      sinceDay: "2026-09-01",
      untilDay: "2026-09-30",
      timeZone: "America/Los_Angeles",
    });
    expect(makeUsageBudgetWindow("month", new Date("2026-10-01T08:00:00Z"))).toMatchObject({
      sinceDay: "2026-10-01",
      untilDay: "2026-10-01",
    });
  });

  it("uses the current local calendar day for the daily budget", () => {
    const original = Intl.DateTimeFormat;
    vi.spyOn(Intl, "DateTimeFormat").mockImplementation(function (locales, options) {
      return new original(locales, { ...options, timeZone: "America/Los_Angeles" });
    });
    expect(makeUsageBudgetWindow("day", new Date("2026-10-01T02:00:00Z"))).toMatchObject({
      sinceDay: "2026-09-30",
      untilDay: "2026-09-30",
      resolution: "day",
    });
    expect(makeUsageBudgetWindow("day", new Date("2026-10-01T08:00:00Z"))).toMatchObject({
      sinceDay: "2026-10-01",
      untilDay: "2026-10-01",
      resolution: "day",
    });
  });

  it("resets daily at the next local midnight and monthly on the first", () => {
    const now = new Date(2026, 3, 30, 12);
    expect(new Date(nextUsageBudgetReset("day", now))).toEqual(new Date(2026, 4, 1));
    expect(new Date(nextUsageBudgetReset("month", now))).toEqual(new Date(2026, 4, 1));
    expect(new Date(nextUsageBudgetReset("day", new Date(2026, 10, 1, 1)))).toEqual(
      new Date(2026, 10, 2),
    );
  });

  it("distinguishes an untouched, reached, and exceeded budget", () => {
    expect(usageBudgetProgress(0, 100)).toEqual({
      usedPercent: 0,
      fillPercent: 0,
      overBudget: false,
      reachedBudget: false,
    });
    expect(usageBudgetProgress(100, 100)).toEqual({
      usedPercent: 100,
      fillPercent: 100,
      overBudget: false,
      reachedBudget: true,
    });
    expect(usageBudgetProgress(150, 100)).toEqual({
      usedPercent: 150,
      fillPercent: 100,
      overBudget: true,
      reachedBudget: true,
    });
  });

  it("retains percentage used above 100 while bounding the fill", () => {
    expect(usageBudgetProgress(90, 100)).toMatchObject({ usedPercent: 90, fillPercent: 90 });
    const exceeded = usageBudgetProgress(110, 100);
    expect(exceeded.usedPercent).toBeCloseTo(110);
    expect(exceeded.fillPercent).toBe(100);
    expect(exceeded.overBudget).toBe(true);
  });

  it("preserves unused budget space and orders Claude before Codex", () => {
    const segments = usageBudgetSegments(
      [
        { provider: "codex", costUsd: 10 },
        { provider: "claude", costUsd: 30 },
      ],
      100,
    );
    expect(segments).toMatchObject([
      { provider: "claude", widthPercent: 30, costSharePercent: 75 },
      { provider: "codex", widthPercent: 10, costSharePercent: 25 },
    ]);
    expect(segments.reduce((sum, segment) => sum + segment.widthPercent, 0)).toBe(40);
  });

  it("preserves the provider ratio when spending exceeds the budget", () => {
    const segments = usageBudgetSegments(
      [
        { provider: "codex", costUsd: 50 },
        { provider: "claude", costUsd: 150 },
      ],
      100,
    );
    expect(segments).toMatchObject([
      { provider: "claude", widthPercent: 75 },
      { provider: "codex", widthPercent: 25 },
    ]);
  });

  it("keeps Grok spending represented and omits providers with no spend", () => {
    expect(
      usageBudgetSegments(
        [
          { provider: "grok", costUsd: 25 },
          { provider: "claude", costUsd: 0 },
        ],
        100,
      ),
    ).toMatchObject([{ provider: "grok", widthPercent: 25, costSharePercent: 100 }]);
    expect(usageBudgetSegments([], 100)).toEqual([]);
  });
});
