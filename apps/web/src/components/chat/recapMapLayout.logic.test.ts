import { describe, expect, it } from "vite-plus/test";
import type { ThreadRecapStep } from "@t3tools/contracts";

import { layoutRecapPath } from "./recapMapLayout.logic";

const step = (
  id: string,
  status: ThreadRecapStep["status"],
  blockedBy: string[] = [],
): ThreadRecapStep => ({ id, label: id, status, source: "chat", blockedBy });

// The mockup: two done steps, the current step, one parallel step, two
// steps waiting on them, and an unknown sign-off.
const MOCKUP = [
  step("read", "done"),
  step("find", "done", ["read"]),
  step("deploy", "blocked", ["readme", "tests"]),
  step("signoff", "unknown"),
  step("tests", "blocked", ["refresh"]),
  step("readme", "next"),
  step("refresh", "now", ["find"]),
];

describe("layoutRecapPath", () => {
  it("numbers done steps first and orders rows so every dependency points down", () => {
    const layout = layoutRecapPath(MOCKUP);
    expect(layout.done.map(({ step: entry, number }) => [entry.id, number])).toEqual([
      ["read", 1],
      ["find", 2],
    ]);
    expect(layout.rows.map((row) => [row.step.id, row.number])).toEqual([
      ["refresh", 3],
      ["readme", 4],
      ["tests", 5],
      ["deploy", 6],
      ["signoff", 7],
    ]);
    expect(layout.totalCount).toBe(7);
  });

  it("marks steps that can start now and names what blocked steps wait on", () => {
    const layout = layoutRecapPath(MOCKUP);
    const byId = new Map(layout.rows.map((row) => [row.step.id, row]));
    expect(byId.get("readme")).toMatchObject({ canStartNow: true, after: [] });
    expect(byId.get("refresh")).toMatchObject({ canStartNow: false, after: [] });
    expect(byId.get("tests")).toMatchObject({ canStartNow: false, after: [3] });
    expect(byId.get("deploy")).toMatchObject({ after: [4, 5] });
    expect(layout.now?.step.id).toBe("refresh");
    expect(layout.canStart?.step.id).toBe("readme");
    expect(layout.wait).toMatchObject({ count: 2, cause: { step: { id: "refresh" } } });
  });

  it("puts parallel work in its own lane and joins lines where they meet", () => {
    const layout = layoutRecapPath(MOCKUP);
    expect(layout.rows.map((row) => row.lane)).toEqual([0, 1, 0, 0, 0]);
    expect(layout.laneCount).toBe(2);
    expect(layout.cells).toEqual([
      { through: [], arrivals: [], down: true, dashedArrival: false },
      { through: [0], arrivals: [], down: true, dashedArrival: false },
      { through: [1], arrivals: [{ lane: 0, continues: false }], down: true, dashedArrival: false },
      {
        through: [],
        arrivals: [
          { lane: 1, continues: false },
          { lane: 0, continues: false },
        ],
        down: false,
        dashedArrival: false,
      },
      { through: [], arrivals: [], down: false, dashedArrival: true },
    ]);
  });

  it("branches from a line that keeps going", () => {
    const layout = layoutRecapPath([
      step("a", "now"),
      step("b", "blocked", ["a"]),
      step("c", "blocked", ["a"]),
    ]);
    expect(layout.rows.map((row) => row.lane)).toEqual([0, 1, 0]);
    expect(layout.cells?.[1]).toEqual({
      through: [0],
      arrivals: [{ lane: 0, continues: true }],
      down: false,
      dashedArrival: false,
    });
  });

  it("drops the lines when more than three lanes would be needed", () => {
    const layout = layoutRecapPath([
      step("root", "now"),
      step("a", "blocked", ["root"]),
      step("b", "blocked", ["root"]),
      step("c", "blocked", ["root"]),
      step("d", "blocked", ["root"]),
      step("end", "blocked", ["a", "b", "c", "d"]),
    ]);
    expect(layout.cells).toBeNull();
    expect(layout.laneCount).toBe(1);
    expect(layout.rows.every((row) => row.lane === 0)).toBe(true);
    expect(layout.rows.at(-1)?.after).toEqual([2, 3, 4, 5]);
  });

  it("drops cycle back-edges, self-references, duplicates, and unknown ids", () => {
    const layout = layoutRecapPath([
      step("a", "next", ["c", "a", "missing"]),
      step("b", "next", ["a", "a"]),
      step("c", "next", ["b"]),
      step("a", "done"),
    ]);
    // Walking from a (a waits on c, c on b, b on a): b waiting on a closes the
    // cycle, so that dependency is dropped and b can start now.
    expect(layout.rows.map((row) => [row.step.id, row.after])).toEqual([
      ["b", []],
      ["c", [1]],
      ["a", [2]],
    ]);
    expect(layout.canStart?.step.id).toBe("b");
    expect(layout.totalCount).toBe(3);
  });

  it("has no current, parallel, or waiting step for an empty summary", () => {
    expect(layoutRecapPath([])).toMatchObject({
      rows: [],
      cells: [],
      now: null,
      canStart: null,
      wait: null,
      totalCount: 0,
    });
  });
});
