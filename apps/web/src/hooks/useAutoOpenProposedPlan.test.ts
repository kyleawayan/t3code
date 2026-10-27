import { describe, expect, it } from "vite-plus/test";

import { shouldAutoOpenProposedPlan } from "./useAutoOpenProposedPlan";

describe("shouldAutoOpenProposedPlan", () => {
  it("opens a plan from a run seen working during this visit", () => {
    expect(
      shouldAutoOpenProposedPlan({
        planId: "plan-1",
        planRunId: "run-2",
        watchedRunIds: new Set(["run-2"]),
        openedPlanIds: new Set(),
      }),
    ).toBe(true);
  });

  it("leaves a plan from an earlier run alone when the thread is visited", () => {
    expect(
      shouldAutoOpenProposedPlan({
        planId: "plan-1",
        planRunId: "run-1",
        watchedRunIds: new Set(["run-2"]),
        openedPlanIds: new Set(),
      }),
    ).toBe(false);
    expect(
      shouldAutoOpenProposedPlan({
        planId: "plan-1",
        planRunId: null,
        watchedRunIds: new Set(["run-2"]),
        openedPlanIds: new Set(),
      }),
    ).toBe(false);
  });

  it("opens each plan once, so closing its tab sticks", () => {
    expect(
      shouldAutoOpenProposedPlan({
        planId: "plan-1",
        planRunId: "run-2",
        watchedRunIds: new Set(["run-2"]),
        openedPlanIds: new Set(["plan-1"]),
      }),
    ).toBe(false);
  });
});
