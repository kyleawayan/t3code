import { describe, expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";

import { isMissedFixedTimeRun, isSameSchedule, nextScheduledRunAt } from "./Schedule.ts";

describe("scheduled task schedule calculation", () => {
  it("skips to the next matching fixed-time weekday", () => {
    const next = nextScheduledRunAt(
      { type: "fixed_time", timeOfDay: "09:00", weekdays: [1, 2, 3, 4, 5] },
      DateTime.makeZonedUnsafe(
        {
          year: 2026,
          month: 7,
          day: 3,
          hour: 10,
          minute: 0,
          second: 0,
          millisecond: 0,
        },
        { timeZone: "America/Los_Angeles", adjustForTimeZone: true },
      ),
    );
    const parts = next ? DateTime.toParts(next) : null;
    expect(parts?.weekDay).toBe(1);
    expect(parts?.hour).toBe(9);
    expect(parts?.minute).toBe(0);
  });

  it("catches up today's missed fixed-time run once and drops older misses", () => {
    const fixedTime = { type: "fixed_time", timeOfDay: "09:00" } as const;
    const weekdays = { type: "fixed_time", timeOfDay: "09:00", weekdays: [1, 2, 3, 4, 5] } as const;
    const wednesday9 = DateTime.makeUnsafe("2026-07-01T09:00:00.000Z");
    const friday9 = DateTime.makeUnsafe("2026-07-03T09:00:00.000Z");
    // Slept through today's run: catch up on wake.
    expect(
      isMissedFixedTimeRun(fixedTime, wednesday9, DateTime.makeUnsafe("2026-07-01T09:05:00.000Z")),
    ).toBe(false);
    expect(
      isMissedFixedTimeRun(fixedTime, wednesday9, DateTime.makeUnsafe("2026-07-01T15:00:00.000Z")),
    ).toBe(false);
    // Woke the next morning before 9: yesterday's run is stale.
    expect(
      isMissedFixedTimeRun(fixedTime, wednesday9, DateTime.makeUnsafe("2026-07-02T08:00:00.000Z")),
    ).toBe(true);
    // Slept Friday to Monday 11:00: Monday's run fires once.
    expect(
      isMissedFixedTimeRun(weekdays, friday9, DateTime.makeUnsafe("2026-07-06T11:00:00.000Z")),
    ).toBe(false);
    // Woke Saturday: today is not a scheduled day.
    expect(
      isMissedFixedTimeRun(weekdays, friday9, DateTime.makeUnsafe("2026-07-04T11:00:00.000Z")),
    ).toBe(true);
    expect(
      isMissedFixedTimeRun(
        { type: "interval", everyMs: 60_000 },
        wednesday9,
        DateTime.makeUnsafe("2026-07-01T15:00:00.000Z"),
      ),
    ).toBe(false);
  });

  it("compares schedules structurally", () => {
    expect(
      isSameSchedule({ type: "interval", everyMs: 60_000 }, { type: "interval", everyMs: 60_000 }),
    ).toBe(true);
    expect(
      isSameSchedule({ type: "interval", everyMs: 60_000 }, { type: "interval", everyMs: 30_000 }),
    ).toBe(false);
    expect(
      isSameSchedule(
        { type: "fixed_time", timeOfDay: "09:00", weekdays: [1, 2] },
        { type: "fixed_time", timeOfDay: "09:00", weekdays: [1, 2] },
      ),
    ).toBe(true);
    expect(
      isSameSchedule(
        { type: "fixed_time", timeOfDay: "09:00", weekdays: [5, 1] },
        { type: "fixed_time", timeOfDay: "09:00", weekdays: [1, 5, 5] },
      ),
    ).toBe(true);
    expect(
      isSameSchedule(
        { type: "fixed_time", timeOfDay: "09:00" },
        { type: "fixed_time", timeOfDay: "09:00", weekdays: [0, 1, 2, 3, 4, 5, 6] },
      ),
    ).toBe(true);
    expect(
      isSameSchedule(
        { type: "fixed_time", timeOfDay: "09:00", weekdays: [] },
        { type: "fixed_time", timeOfDay: "09:00" },
      ),
    ).toBe(true);
    expect(
      isSameSchedule(
        { type: "fixed_time", timeOfDay: "09:00", weekdays: [1, 2] },
        { type: "fixed_time", timeOfDay: "09:00", weekdays: [1, 3] },
      ),
    ).toBe(false);
    expect(
      isSameSchedule(
        { type: "fixed_time", timeOfDay: "09:00" },
        { type: "fixed_time", timeOfDay: "09:30" },
      ),
    ).toBe(false);
    expect(
      isSameSchedule(
        { type: "interval", everyMs: 60_000 },
        { type: "fixed_time", timeOfDay: "09:00" },
      ),
    ).toBe(false);
  });
});
