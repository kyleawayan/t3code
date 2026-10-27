import { describe, expect, it } from "vite-plus/test";

import { buildPlanReviewComment } from "./ProposedPlanPanel";
import { findProposedPlanMarkdown, locatePlanSelection } from "./proposedPlanPanel.logic";

const plan = [
  "# Ship the widget",
  "",
  "## Steps",
  "",
  "1. Add the **widget** to `Toolbar.tsx`",
  "2. Wire it to the [store](https://example.com/store)",
  "- [ ] Write a test",
].join("\n");

type Projection = Parameters<typeof findProposedPlanMarkdown>[0];

function projection(input: { item?: string; artifact?: string }): Projection {
  return {
    turnItems:
      input.item === undefined
        ? []
        : [{ type: "proposed_plan", planId: "plan-1", markdown: input.item }],
    plans:
      input.artifact === undefined
        ? []
        : [{ kind: "proposed_plan", id: "plan-1", markdown: input.artifact }],
  } as unknown as Projection;
}

describe("findProposedPlanMarkdown", () => {
  it("prefers the timeline item, falls back to the artifact, and reports a blanked plan", () => {
    expect(findProposedPlanMarkdown(projection({ item: "new", artifact: "old" }), "plan-1")).toBe(
      "new",
    );
    expect(findProposedPlanMarkdown(projection({ item: "", artifact: "old" }), "plan-1")).toBe(
      "old",
    );
    expect(findProposedPlanMarkdown(projection({ item: "", artifact: "" }), "plan-1")).toBeNull();
    expect(findProposedPlanMarkdown(projection({ item: "new" }), "plan-2")).toBeNull();
    expect(findProposedPlanMarkdown(null, "plan-1")).toBeNull();
  });
});

describe("locatePlanSelection", () => {
  it("maps rendered text back to its source lines despite markdown syntax", () => {
    expect(locatePlanSelection(plan, { text: "Add the widget to Toolbar.tsx" })).toEqual({
      startLine: 5,
      endLine: 5,
    });
    expect(
      locatePlanSelection(plan, { text: "widget to Toolbar.tsx\nWire it to the store" }),
    ).toEqual({ startLine: 5, endLine: 6 });
    expect(locatePlanSelection(plan, { text: "Write a test" })).toEqual({
      startLine: 7,
      endLine: 7,
    });
  });

  it("places a short selection by the rendered block it sits in", () => {
    const repeated = "# Add tests\n\n- Write the code\n- Run tests in CI";
    expect(
      locatePlanSelection(repeated, {
        text: "tests",
        startBlock: "Run tests in CI",
        endBlock: "Run tests in CI",
      }),
    ).toEqual({ startLine: 4, endLine: 4 });
  });

  it("returns null for text that isn't in the plan", () => {
    expect(locatePlanSelection(plan, { text: "Something else entirely" })).toBeNull();
    expect(locatePlanSelection(plan, { text: "   " })).toBeNull();
  });
});

describe("buildPlanReviewComment", () => {
  it("quotes the source lines and names the plan instead of a file", () => {
    expect(
      buildPlanReviewComment({
        id: "c1",
        planId: "plan-1",
        markdown: plan,
        selectedText: "Wire it to the store",
        text: " Use the existing store ",
      }),
    ).toEqual({
      id: "c1",
      sectionId: "plan:plan-1",
      sectionTitle: "Proposed plan comment",
      filePath: "Plan: Ship the widget",
      startIndex: 5,
      endIndex: 5,
      rangeLabel: "L6",
      text: "Use the existing store",
      diff: "2. Wire it to the [store](https://example.com/store)",
      fenceLanguage: "markdown",
    });
  });

  it('keeps an agent\'s own "Plan:" title without doubling it', () => {
    expect(
      buildPlanReviewComment({
        id: "c3",
        planId: "plan-1",
        markdown: "# Plan: Add docs\n\n1. Write them",
        selectedText: "Write them",
        text: "OK",
      }).filePath,
    ).toBe("Plan: Add docs");
  });

  it("quotes the selection itself when it can't be placed", () => {
    expect(
      buildPlanReviewComment({
        id: "c2",
        planId: "plan-1",
        markdown: plan,
        selectedText: "cell text from a table",
        text: "Why?",
      }),
    ).toMatchObject({ rangeLabel: "Selection", diff: "cell text from a table" });
  });
});
