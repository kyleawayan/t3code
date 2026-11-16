import { describe, expect, it } from "vite-plus/test";

import {
  LINEAR_FIXTURE_IN_REVIEW,
  LINEAR_FIXTURE_NESTED,
  LINEAR_FIXTURE_ROOT,
} from "./linearFixtures";
import { directLinearTarget } from "./LinearIssueSearch";
import { rememberIssueView } from "./linearIssueView";
import { parseLinearIssueUrl } from "./linearLinks";
import {
  activityItems,
  brightenForDark,
  estimateLabel,
  ancestorChain,
  cycleLabel,
  issueFingerprint,
  relationGroups,
  segmentMarkdown,
  startedStateFractions,
  subIssueProgress,
  subIssueRows,
} from "./linearModel";
import {
  newLinearSurface,
  pushLinearIssue,
  sanitizeLinearSurface,
  stepLinearHistory,
} from "./linearSurface";
import type { LinearSubIssue } from "./linearTypes";

const local = (year: number, month: number, day: number, hour = 12) =>
  new Date(year, month - 1, day, hour);
const cycle = {
  number: 10,
  name: null,
  startsAt: local(2026, 11, 16, 0).toISOString(),
  endsAt: local(2026, 11, 30, 0).toISOString(),
};

describe("cycleLabel", () => {
  it.each([
    [local(2026, 11, 15, 22), "Cycle 10 (starts tomorrow)"],
    [local(2026, 11, 13), "Cycle 10 (starts in 3 days)"],
    [local(2026, 11, 16, 9), "Cycle 10 (14 days left)"],
    [local(2026, 11, 28), "Cycle 10 (2 days left)"],
    [local(2026, 11, 29), "Cycle 10 (last day)"],
    [local(2026, 11, 30, 9), "Cycle 10"],
  ])("%s → %s", (now, expected) => {
    expect(cycleLabel(cycle, now)).toBe(expected);
  });

  it("prefers the cycle's own name", () => {
    expect(cycleLabel({ ...cycle, name: "Launch" }, local(2026, 12, 5))).toBe("Launch");
  });
});

describe("estimateLabel", () => {
  it.each([
    [3, "fibonacci", false, "3 Points"],
    [1, "linear", false, "1 Point"],
    [5, "exponential", true, "5"],
    [3, "tShirt", false, "Size M"],
    [8, "tShirt", true, "XL"],
    [null, "fibonacci", false, null],
    [3, "notUsed", false, null],
  ])("%s %s short=%s → %s", (estimate, type, short, expected) => {
    expect(estimateLabel(estimate, type, short)).toBe(expected);
  });
});

describe("brightenForDark", () => {
  it("lifts dark state colors and leaves light ones alone", () => {
    expect(brightenForDark("#0f783c")).toBe("#42d782");
    expect(brightenForDark("#800080")).toBe("#d742d7");
    expect(brightenForDark("#8b0a3c")).toBe("#d7427b");
    expect(brightenForDark("#f2c94c")).toBe("#f2c94c");
    expect(brightenForDark("#e2e2e2")).toBe("#e2e2e2");
    expect(brightenForDark("#5e6ad2")).toBe("#5e6ad2");
    expect(brightenForDark("not a color")).toBe("not a color");
  });
});

describe("startedStateFractions", () => {
  it("fills later started states further, in workflow order", () => {
    const fractions = startedStateFractions([
      { name: "In Review", type: "started", position: 3 },
      { name: "Todo", type: "unstarted", position: 1 },
      { name: "In Progress", type: "started", position: 2 },
    ]);
    expect([...fractions]).toEqual([
      ["In Progress", 0.5],
      ["In Review", 0.75],
    ]);
  });
});

describe("relationGroups", () => {
  it("reads inverse relations backward and orders the groups", () => {
    const groups = relationGroups({
      relations: {
        nodes: [
          { type: "blocks", relatedIssue: { ...LINEAR_FIXTURE_NESTED, identifier: "ENG-4" } },
          { type: "related", relatedIssue: { ...LINEAR_FIXTURE_NESTED, identifier: "ENG-5" } },
          { type: "similar", relatedIssue: { ...LINEAR_FIXTURE_NESTED, identifier: "ENG-9" } },
        ],
      },
      inverseRelations: {
        nodes: [
          { type: "blocks", issue: { ...LINEAR_FIXTURE_NESTED, identifier: "ENG-8" } },
          { type: "related", issue: { ...LINEAR_FIXTURE_NESTED, identifier: "ENG-5" } },
          { type: "duplicate", issue: { ...LINEAR_FIXTURE_NESTED, identifier: "ENG-11" } },
        ],
      },
    });
    expect(
      groups.map((group) => [group.label, group.issues.map((issue) => issue.identifier)]),
    ).toEqual([
      ["1 blocked by", ["ENG-8"]],
      ["1 blocking", ["ENG-4"]],
      ["1 related", ["ENG-5"]],
      ["1 duplicate", ["ENG-11"]],
    ]);
  });
});

describe("sub-issues", () => {
  it("counts done and canceled descendants, like Linear's 2/6", () => {
    expect(subIssueProgress(LINEAR_FIXTURE_ROOT.children.nodes)).toEqual({ done: 2, total: 6 });
  });

  it("orders rows by Linear's manual order and nests sub-issues under their parent", () => {
    const rows = subIssueRows(LINEAR_FIXTURE_ROOT.children.nodes);
    expect(rows.map((row) => [row.issue.identifier, row.depth])).toEqual([
      ["ENG-2", 0],
      ["ENG-3", 0],
      ["ENG-7", 1],
      ["ENG-4", 0],
      ["ENG-5", 0],
      ["ENG-6", 0],
    ]);
    const inReview = rows[1];
    expect(inReview?.progress).toEqual({ done: 0, total: 1 });
    expect([inReview, rows[3]].map((row) => row?.blocks.map((group) => group.label))).toEqual([
      ["1 blocking"],
      ["1 blocked by"],
    ]);
  });

  it("tracks which guide lines run past each nested row", () => {
    const leaf = (identifier: string, order: number, children: LinearSubIssue[] = []) => ({
      ...LINEAR_FIXTURE_ROOT.children.nodes[0]!,
      identifier,
      subIssueSortOrder: order,
      children: { nodes: children },
    });
    // A, then B under A, then B1a under B, then B2 under A, then C
    const rows = subIssueRows([
      leaf("A", 1, [leaf("B", 1, [leaf("B1a", 1)]), leaf("B2", 2)]),
      leaf("C", 2),
    ]);
    expect(rows.map((row) => [row.issue.identifier, row.depth, row.isLast, row.guides])).toEqual([
      ["A", 0, false, []],
      ["B", 1, false, []],
      ["B1a", 2, true, [true]],
      ["B2", 1, true, []],
      ["C", 0, true, []],
    ]);
  });

  it("builds the breadcrumb root first", () => {
    expect(ancestorChain(LINEAR_FIXTURE_NESTED).map((issue) => issue.identifier)).toEqual([
      "ENG-1",
      "ENG-3",
    ]);
    expect(ancestorChain(LINEAR_FIXTURE_ROOT)).toEqual([]);
  });
});

describe("activityItems", () => {
  it("merges history and comment threads in time order", () => {
    const items = activityItems(LINEAR_FIXTURE_ROOT);
    expect(
      items.map((item) =>
        item.kind === "event"
          ? `${item.actorName} ${item.text}`
          : `thread ${item.thread.root.id} +${item.thread.replies.length}`,
      ),
    ).toEqual([
      "Example User created the issue",
      "Example User added related issue ENG-5",
      "thread comment-first +1",
      "thread comment-second +0",
    ]);
  });

  it("describes field changes and skips edits Linear doesn't show", () => {
    const base = LINEAR_FIXTURE_IN_REVIEW.history.nodes;
    const entry = {
      id: "h1",
      createdAt: "2026-11-16T07:00:00.000Z",
      actor: { displayName: "Example User", avatarUrl: null },
      botActor: null,
      fromState: { name: "Todo", type: "unstarted", color: "#e2e2e2" },
      toState: { name: "In Review", type: "started", color: "#0f783c" },
      addedLabels: [{ name: "Bug", color: "#EB5757" }],
      removedLabels: null,
      fromAssignee: null,
      toAssignee: { displayName: "Example User" },
      fromPriority: 3,
      toPriority: 1,
      fromCycle: null,
      toCycle: { number: 10 },
      fromParent: null,
      toParent: { identifier: "ENG-1" },
      relationChanges: [
        { identifier: "ENG-4", type: "ax" },
        { identifier: "ENG-9", type: "zz" },
      ],
    };
    const edit = {
      ...entry,
      id: "h2",
      fromState: null,
      toState: null,
      addedLabels: null,
      toAssignee: null,
      fromPriority: null,
      toPriority: null,
      toCycle: null,
      toParent: null,
      relationChanges: null,
    };
    const items = activityItems({
      ...LINEAR_FIXTURE_IN_REVIEW,
      history: { nodes: [...base, entry, edit] },
    }).flatMap((item) => (item.kind === "event" && item.id !== "created" ? [item.text] : []));
    expect(items).toEqual([
      "changed status from Todo to In Review",
      "assigned to Example User",
      "added label Bug",
      "changed priority from Medium to Urgent",
      "added to Cycle 10",
      "set parent issue to ENG-1",
      "marked this issue as blocking ENG-4",
    ]);
  });
});

describe("segmentMarkdown", () => {
  it("splits +++ collapsibles, but not inside code fences", () => {
    const text = [
      "Intro",
      "```md",
      "+++ Not a section",
      "```",
      "+++ Agent notes",
      "",
      "Hidden **details**.",
      "",
      "+++",
      "Outro",
    ].join("\n");
    expect(segmentMarkdown(text)).toEqual([
      { kind: "markdown", line: 0, text: "Intro\n```md\n+++ Not a section\n```" },
      { kind: "collapsible", line: 4, title: "Agent notes", text: "Hidden **details**." },
      { kind: "markdown", line: 9, text: "Outro" },
    ]);
  });

  it("keeps an unclosed section open to the end", () => {
    expect(segmentMarkdown("+++\nBody")).toEqual([
      { kind: "collapsible", line: 0, title: "Details", text: "Body" },
    ]);
  });
});

describe("upload links", () => {
  const signed = (signature: string) =>
    `https://uploads.linear.app/org/file/abc?signature=${signature}`;

  it("ignores re-signed links when comparing fetches", () => {
    const issue = (signature: string) => ({
      ...LINEAR_FIXTURE_ROOT,
      description: `![a](${signed(signature)})`,
    });
    expect(issueFingerprint(issue("one"))).toBe(issueFingerprint(issue("two")));
    expect(issueFingerprint(issue("one"))).not.toBe(
      issueFingerprint({ ...issue("one"), title: "Renamed" }),
    );
  });
});

describe("parseLinearIssueUrl", () => {
  it.each([
    [
      "https://linear.app/my-workspace/issue/ENG-12/some-title",
      { workspace: "my-workspace", identifier: "ENG-12" },
    ],
    [
      "https://linear.app/My-Workspace/issue/eng-12",
      { workspace: "my-workspace", identifier: "ENG-12" },
    ],
    [
      "https://linear.app/my-workspace/issue/ENG-12/title#comment-1",
      { workspace: "my-workspace", identifier: "ENG-12" },
    ],
    ["https://linear.app/my-workspace/project/launch-123", null],
    ["https://linear.app.evil.com/my-workspace/issue/ENG-12", null],
    ["http://linear.app/my-workspace/issue/ENG-12", null],
    ["not a url", null],
  ])("%s", (url, expected) => {
    expect(parseLinearIssueUrl(url)).toEqual(expected);
  });
});

describe("linear surface history", () => {
  it("pushes, steps back and forward, and drops forward entries on a new push", () => {
    const first = newLinearSurface("a", "ENG-1");
    const second = pushLinearIssue(first, "ENG-3");
    expect(pushLinearIssue(second, "ENG-3")).toBe(second);
    const back = stepLinearHistory(second, -1);
    expect(back).toMatchObject({ history: ["ENG-1", "ENG-3"], index: 0 });
    expect(back && stepLinearHistory(back, -1)).toBeNull();
    expect(back && pushLinearIssue(back, "ENG-7")).toMatchObject({
      history: ["ENG-1", "ENG-7"],
      index: 1,
    });
  });

  it("sanitizes persisted surfaces and upgrades the single-tab id", () => {
    expect(
      sanitizeLinearSurface({
        id: "linear",
        kind: "linear",
        history: ["ENG-1", 4, "bad id", ""],
        index: 9,
      }),
    ).toEqual({ id: "linear:main", kind: "linear", history: ["ENG-1", ""], index: 1 });
    expect(
      sanitizeLinearSurface({ id: "linear:a1", kind: "linear", history: ["ENG-2"], index: 0 }),
    ).toMatchObject({ id: "linear:a1" });
    expect(sanitizeLinearSurface({ id: "linear:a1", kind: "linear", history: [] })).toBeNull();
    expect(sanitizeLinearSurface({ id: "diff", kind: "linear", history: ["ENG-1"] })).toBeNull();
    expect(sanitizeLinearSurface({ kind: "diff" })).toBeNull();
  });
});

describe("rememberIssueView", () => {
  it("keeps only issues off the defaults, most recent last, up to the limit", () => {
    let views = rememberIssueView({}, "ENG-1", () => ({ collapsed: ["description"] }));
    views = rememberIssueView(views, "ENG-2", () => ({ newestFirst: true }));
    views = rememberIssueView(views, "ENG-1", (view) => ({ ...view, newestFirst: true }));
    expect(views).toEqual({
      "ENG-2": { newestFirst: true },
      "ENG-1": { collapsed: ["description"], newestFirst: true },
    });
    expect(Object.keys(views)).toEqual(["ENG-2", "ENG-1"]);
    expect(rememberIssueView(views, "ENG-2", () => ({ newestFirst: false }))).toEqual({
      "ENG-1": { collapsed: ["description"], newestFirst: true },
    });
    expect(
      Object.keys(rememberIssueView(views, "ENG-3", () => ({ newestFirst: true }), 2)),
    ).toEqual(["ENG-1", "ENG-3"]);
  });
});

describe("directLinearTarget", () => {
  it.each([
    ["eng-12", "ENG-12"],
    [" ENG-12 ", "ENG-12"],
    ["https://linear.app/my-workspace/issue/ENG-12/title", "ENG-12"],
    ["nested issue", null],
    ["ENG", null],
  ])("%s → %s", (input, expected) => {
    expect(directLinearTarget(input)).toBe(expected);
  });
});
