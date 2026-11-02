import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";

import {
  CHRONO_MAX_MINUTES,
  CHRONO_RESET,
  ChronoStateSchema,
  chronoDisplay,
  formatChronoSeconds,
  msUntilNextChronoTick,
  pressChrono,
} from "./sidebarChrono.logic";

const T0 = 1_000_000;
const MINUTE = 60_000;

describe("pressChrono", () => {
  it("cycles start, stop, reset and leaves the display blank when reset", () => {
    expect(chronoDisplay(CHRONO_RESET, T0)).toBeNull();

    const running = pressChrono(CHRONO_RESET, T0);
    expect(chronoDisplay(running, T0)).toBe("00:00");
    expect(chronoDisplay(running, T0 + 59_999)).toBe("00:00");
    expect(chronoDisplay(running, T0 + 65 * MINUTE + 400)).toBe("01:05");

    const stopped = pressChrono(running, T0 + 62 * MINUTE + 3_900);
    expect(chronoDisplay(stopped, T0 + 900 * MINUTE)).toBe("01:02");

    const reset = pressChrono(stopped, T0 + 900 * MINUTE);
    expect(chronoDisplay(reset, T0 + 900 * MINUTE)).toBeNull();

    const restarted = pressChrono(reset, T0 + 1000 * MINUTE);
    expect(chronoDisplay(restarted, T0 + 1000 * MINUTE)).toBe("00:00");
  });

  it("holds at 99:59 while running and when stopped past the cap", () => {
    const running = pressChrono(CHRONO_RESET, T0);
    const pastCap = T0 + 120 * 60 * MINUTE;
    expect(chronoDisplay(running, pastCap)).toBe("99:59");
    expect(chronoDisplay(pressChrono(running, pastCap), pastCap)).toBe("99:59");
  });
});

describe("msUntilNextChronoTick", () => {
  it("schedules the next whole minute until the display caps", () => {
    expect(msUntilNextChronoTick(T0, T0)).toBe(MINUTE);
    expect(msUntilNextChronoTick(T0, T0 + 2 * MINUTE + 15_000)).toBe(45_000);
    expect(msUntilNextChronoTick(T0, T0 + CHRONO_MAX_MINUTES * MINUTE)).toBeNull();
  });
});

describe("formatChronoSeconds", () => {
  it("formats HH:MM", () => {
    expect(formatChronoSeconds(0)).toBe("00:00");
    expect(formatChronoSeconds(59)).toBe("00:00");
    expect(formatChronoSeconds(60)).toBe("00:01");
    expect(formatChronoSeconds(3600)).toBe("01:00");
    expect(formatChronoSeconds((CHRONO_MAX_MINUTES + 1) * 60)).toBe("99:59");
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
