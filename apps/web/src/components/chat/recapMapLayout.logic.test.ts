import { describe, expect, it } from "vite-plus/test";
import type { ThreadRecapStep } from "@t3tools/contracts";

import { layoutRecapPath, SYNTHETIC_NOW_STEP_ID } from "./recapMapLayout.logic";

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
  it("puts done steps first and orders rows so every dependency points down", () => {
    const layout = layoutRecapPath(MOCKUP);
    expect(layout.doneCount).toBe(2);
    expect(layout.rows.map((row) => [row.step.id, row.number])).toEqual([
      ["read", 1],
      ["find", 2],
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

  it("names what each row means: cleared, current, side quest, locked, waiting, unknown", () => {
    const layout = layoutRecapPath([
      ...MOCKUP,
      step("approval", "blocked"),
      step("after-done", "blocked", ["read"]),
    ]);
    const kinds = new Map(layout.rows.map((row) => [row.step.id, row.kind]));
    expect(Object.fromEntries(kinds)).toEqual({
      read: "done",
      find: "done",
      refresh: "now",
      readme: "side-quest",
      tests: "locked",
      deploy: "locked",
      signoff: "unknown",
      // Blocked with nothing unfinished to wait on here: a person or outside event.
      approval: "waiting",
      "after-done": "waiting",
    });
    expect(layout.waiting?.step.id).toBe("approval");
  });

  it("calls a startable step ready rather than a side quest when nothing is current", () => {
    const layout = layoutRecapPath([step("a", "next"), step("b", "next", ["a"])]);
    expect(layout.rows.map((row) => [row.kind, row.lane])).toEqual([
      ["ready", 0],
      ["locked", 0],
    ]);
    // Only the real edge a -> b is drawn.
    expect(layout.cells).toEqual([
      { through: [], arrivals: [], down: true },
      { through: [], arrivals: [{ lane: 0, continues: false }], down: false },
    ]);
  });

  it("puts parallel work in its own lane and joins lines where they meet", () => {
    const layout = layoutRecapPath(MOCKUP);
    expect(layout.rows.map((row) => row.lane)).toEqual([0, 0, 0, 1, 0, 0, 0]);
    expect(layout.laneCount).toBe(2);
    expect(layout.cells).toEqual([
      // Cleared steps keep their arrows, so the path reads from the start.
      { through: [], arrivals: [], down: true },
      { through: [], arrivals: [{ lane: 0, continues: false }], down: true },
      { through: [], arrivals: [{ lane: 0, continues: false }], down: true },
      // The side quest depends on nothing: its marker sits alone in lane 1
      // beside the current step's line, with no connector into it.
      { through: [0], arrivals: [], down: true },
      { through: [1], arrivals: [{ lane: 0, continues: false }], down: true },
      {
        through: [],
        arrivals: [
          { lane: 1, continues: false },
          { lane: 0, continues: false },
        ],
        down: false,
      },
      // The unknown sign-off depends on nothing, so nothing connects to it.
      { through: [], arrivals: [], down: false },
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
    });
  });

  it("draws connectors only between real dependency endpoints", () => {
    // A locked step directly above a step with no dependencies must not read as its prerequisite.
    const steps = [
      step("review", "now"),
      step("merge", "next", ["review"]),
      step("build", "unknown"),
      step("ship", "blocked", ["merge", "build"]),
    ];
    const layout = layoutRecapPath(steps);
    const cells = layout.cells!;
    const byId = new Map(layout.rows.map((row, index) => [row.step.id, index]));
    expect(cells[byId.get("build")!]!.arrivals).toEqual([]);
    expect(cells[byId.get("review")!]!.arrivals).toEqual([]);
    // One arrival per real edge, and nothing else.
    const edgeCount = steps.reduce((sum, entry) => sum + entry.blockedBy.length, 0);
    expect(cells.reduce((sum, cell) => sum + cell.arrivals.length, 0)).toBe(edgeCount);
    for (const [index, row] of layout.rows.entries()) {
      expect(cells[index]!.arrivals.map((arrival) => arrival.lane).toSorted()).toEqual(
        row.step.blockedBy
          .map((dep) => layout.rows.find((candidate) => candidate.step.id === dep)!.lane)
          .toSorted(),
      );
      const hasDependents = steps.some((entry) => entry.blockedBy.includes(row.step.id));
      expect(cells[index]!.down).toBe(hasDependents);
    }
  });

  it("drops a dependency that a longer path already implies", () => {
    const layout = layoutRecapPath([
      step("plan", "done"),
      step("build", "done", ["plan"]),
      step("ship", "now", ["plan", "build"]),
    ]);
    expect(layout.cells?.[2]).toEqual({
      through: [],
      arrivals: [{ lane: 0, continues: false }],
      down: false,
    });
    expect(layout.cells?.[0]?.down).toBe(true);
  });

  it("drops the lines when more than four lanes would be needed", () => {
    const layout = layoutRecapPath([
      step("root", "now"),
      step("a", "blocked", ["root"]),
      step("b", "blocked", ["root"]),
      step("c", "blocked", ["root"]),
      step("d", "blocked", ["root"]),
      step("e", "blocked", ["root"]),
      step("end", "blocked", ["a", "b", "c", "d", "e"]),
    ]);
    expect(layout.cells).toBeNull();
    expect(layout.laneCount).toBe(1);
    expect(layout.rows.every((row) => row.lane === 0)).toBe(true);
    expect(layout.rows.at(-1)?.after).toEqual([2, 3, 4, 5, 6]);
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

  it("adds the summary's current task as a row when no step is current", () => {
    const layout = layoutRecapPath(
      [step("setup", "done"), step("docs", "next"), step("approval", "blocked")],
      "  Wire up the widget  ",
    );
    expect(layout.rows.map((row) => [row.step.id, row.step.label, row.kind])).toEqual([
      ["setup", "setup", "done"],
      [SYNTHETIC_NOW_STEP_ID, "Wire up the widget", "now"],
      ["docs", "docs", "side-quest"],
      ["approval", "approval", "waiting"],
    ]);
    expect(layout.now?.step.id).toBe(SYNTHETIC_NOW_STEP_ID);
    expect(layout.totalCount).toBe(4);
  });

  it("promotes the step whose label matches the summary's current task", () => {
    const layout = layoutRecapPath(
      [step("setup", "done"), { ...step("widget", "next"), label: "Wire Up The Widget" }],
      "wire up the widget",
    );
    expect(layout.rows.map((row) => [row.step.id, row.kind])).toEqual([
      ["setup", "done"],
      ["widget", "now"],
    ]);
    expect(layout.totalCount).toBe(2);
  });

  it("keeps one current step: no synthetic duplicate, and extra ones read as next", () => {
    const layout = layoutRecapPath(
      [step("first", "now"), step("second", "now")],
      "Something the summary calls current",
    );
    expect(layout.rows.map((row) => [row.step.id, row.kind])).toEqual([
      ["first", "now"],
      ["second", "side-quest"],
    ]);
    expect(layout.rows.some((row) => row.step.id === SYNTHETIC_NOW_STEP_ID)).toBe(false);
  });

  it("has no current, parallel, or waiting step for an empty summary", () => {
    expect(layoutRecapPath([])).toMatchObject({
      rows: [],
      cells: [],
      now: null,
      canStart: null,
      waiting: null,
      wait: null,
      totalCount: 0,
    });
  });
});
