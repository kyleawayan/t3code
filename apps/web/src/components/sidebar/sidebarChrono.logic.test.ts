import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";

import {
  CHRONO_MAX_SECONDS,
  CHRONO_RESET,
  ChronoStateSchema,
  NO_ELAPSED_TODAY,
  chronoDisplay,
  elapsedTodayDisplay,
  formatChronoSeconds,
  msUntilNextChronoTick,
  pressChrono,
  recordChronoRun,
} from "./sidebarChrono.logic";

const T0 = 1_000_000;
const SECOND = 1000;
const MINUTE = 60 * SECOND;

describe("pressChrono", () => {
  it("cycles start, stop, reset and leaves the display blank when reset", () => {
    expect(chronoDisplay(CHRONO_RESET, T0)).toBeNull();

    const running = pressChrono(CHRONO_RESET, T0);
    expect(chronoDisplay(running, T0)).toBe("00:00:00");
    expect(chronoDisplay(running, T0 + 999)).toBe("00:00:00");
    expect(chronoDisplay(running, T0 + 65 * MINUTE + 7_400)).toBe("01:05:07");

    const stopped = pressChrono(running, T0 + 62 * MINUTE + 3_900);
    expect(chronoDisplay(stopped, T0 + 900 * MINUTE)).toBe("01:02:03");

    const reset = pressChrono(stopped, T0 + 900 * MINUTE);
    expect(chronoDisplay(reset, T0 + 900 * MINUTE)).toBeNull();

    const restarted = pressChrono(reset, T0 + 1000 * MINUTE);
    expect(chronoDisplay(restarted, T0 + 1000 * MINUTE)).toBe("00:00:00");
  });

  it("holds at 99:59:59 while running and when stopped past the cap", () => {
    const running = pressChrono(CHRONO_RESET, T0);
    const pastCap = T0 + 120 * 60 * MINUTE;
    expect(chronoDisplay(running, pastCap)).toBe("99:59:59");
    expect(chronoDisplay(pressChrono(running, pastCap), pastCap)).toBe("99:59:59");
  });
});

describe("elapsed time today", () => {
  // Local wall-clock times, so the midnight reset holds in any time zone.
  const at = (day: number, hour: number, minute = 0, second = 0) =>
    new Date(2026, 10, day, hour, minute, second).getTime();

  it("adds every run stopped today, across resets, and counts a running chrono live", () => {
    let state = pressChrono(CHRONO_RESET, at(3, 9));
    let elapsed = recordChronoRun(NO_ELAPSED_TODAY, state, at(3, 9, 30));
    state = pressChrono(state, at(3, 9, 30));
    expect(elapsedTodayDisplay(elapsed, state, at(3, 12))).toBe("00:30:00");

    state = pressChrono(pressChrono(state, at(3, 10)), at(3, 10));
    // Whole seconds, like the chrono's own reading.
    expect(elapsedTodayDisplay(elapsed, state, at(3, 10, 15, 5) + 999)).toBe("00:45:05");

    elapsed = recordChronoRun(elapsed, state, at(3, 11));
    expect(elapsedTodayDisplay(elapsed, pressChrono(state, at(3, 11)), at(3, 23))).toBe("01:30:00");
  });

  it("starts over at local midnight and counts only today's part of a run across it", () => {
    const yesterday = recordChronoRun(
      NO_ELAPSED_TODAY,
      pressChrono(CHRONO_RESET, at(2, 20)),
      at(2, 22),
    );
    const stopped = { phase: "stopped" as const, elapsedSeconds: 7200 };
    expect(elapsedTodayDisplay(yesterday, stopped, at(2, 23))).toBe("02:00:00");
    expect(elapsedTodayDisplay(yesterday, stopped, at(3, 0, 0, 1))).toBe("00:00:00");

    const overnight = pressChrono(CHRONO_RESET, at(2, 23));
    expect(elapsedTodayDisplay(yesterday, overnight, at(3, 0, 20))).toBe("00:20:00");
    expect(
      elapsedTodayDisplay(recordChronoRun(yesterday, overnight, at(3, 1)), stopped, at(3, 2)),
    ).toBe("01:00:00");
  });
});

describe("msUntilNextChronoTick", () => {
  it("schedules the next whole second until the display caps", () => {
    expect(msUntilNextChronoTick(T0, T0)).toBe(SECOND);
    expect(msUntilNextChronoTick(T0, T0 + 2 * MINUTE + 15_250)).toBe(750);
    expect(msUntilNextChronoTick(T0, T0 + CHRONO_MAX_SECONDS * SECOND)).toBeNull();
  });
});

describe("formatChronoSeconds", () => {
  it("formats HH:MM:SS", () => {
    expect(formatChronoSeconds(0)).toBe("00:00:00");
    expect(formatChronoSeconds(59.9)).toBe("00:00:59");
    expect(formatChronoSeconds(60)).toBe("00:01:00");
    expect(formatChronoSeconds(3600)).toBe("01:00:00");
    expect(formatChronoSeconds(CHRONO_MAX_SECONDS + 1)).toBe("99:59:59");
  });
});

describe("ChronoStateSchema", () => {
  it("rejects stored states missing their timestamps or with unknown phases", () => {
    const decode = Schema.decodeUnknownOption(ChronoStateSchema);
    expect(decode({ phase: "running", startedAt: T0 })).toEqual(
      Option.some({ phase: "running", startedAt: T0 }),
    );
    expect(Option.isNone(decode({ phase: "running" }))).toBe(true);
    expect(Option.isNone(decode({ phase: "paused", elapsedSeconds: 5 }))).toBe(true);
  });
});
