import { getTextWidth, measureTextWrap } from "@evenrealities/pretext";
import { describe, expect, it } from "vite-plus/test";
import type {
  EventId,
  MessageId,
  OrchestrationThreadShell,
  ThreadId,
  TurnId,
} from "@t3tools/contracts";

import {
  BODY_INNER_WIDTH,
  dashboardLayout,
  displayTitle,
  latestReply,
  LIST_ITEM_MAX_BYTES,
  revealedLines,
  skipInstantLines,
  statusBar,
  threadPreview,
  transcriptLength,
  STATUS_INNER_WIDTH,
  threadListLabel,
  threadStatusKind,
  toolStepLabel,
  transcriptLines,
  visibleThreads,
  windowEndingAt,
  windowStartingAt,
  wrapWords,
} from "./format";

const baseShell = {
  title: "Fix login redirect",
  session: null,
  latestTurn: null,
  hasPendingApprovals: false,
  hasPendingUserInput: false,
  planProgress: null,
};

const turn = (
  state: "running" | "completed" | "error" | "interrupted",
  overrides: Partial<{ startedAt: string | null; completedAt: string | null }> = {},
) => ({
  turnId: "turn-1" as TurnId,
  state,
  requestedAt: "2026-01-01T00:00:00.000Z",
  startedAt: "2026-01-01T00:00:00.000Z",
  completedAt: null,
  assistantMessageId: null,
  ...overrides,
});

const message = (role: "user" | "assistant", text: string, createdAt: string) => ({
  id: `${role}-${createdAt}` as MessageId,
  role,
  text,
  turnId: "turn-1" as TurnId,
  streaming: false,
  createdAt,
  updatedAt: createdAt,
});

const activity = (
  kind: string,
  summary: string,
  createdAt: string,
  options: { tone?: "tool" | "approval" | "error" | "info"; toolCallId?: string } = {},
) => ({
  id: `${kind}-${createdAt}` as EventId,
  tone: options.tone ?? "tool",
  kind,
  summary,
  payload: options.toolCallId === undefined ? null : { toolCallId: options.toolCallId },
  turnId: "turn-1" as TurnId,
  createdAt,
});

describe("threadStatusKind", () => {
  it("prefers needs-you over a running session", () => {
    expect(
      threadStatusKind({
        ...baseShell,
        hasPendingApprovals: true,
        session: {
          threadId: "t" as ThreadId,
          status: "running",
          providerName: null,
          runtimeMode: "full-access",
          activeTurnId: null,
          lastError: null,
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      }),
    ).toBe("needs-you");
  });

  it("reads working from the latest turn when the session is idle", () => {
    expect(threadStatusKind({ ...baseShell, latestTurn: turn("running") })).toBe("working");
  });

  it("reports done after a completed turn", () => {
    expect(threadStatusKind({ ...baseShell, latestTurn: turn("completed") })).toBe("done");
  });
});

describe("threadListLabel", () => {
  it("marks a thread with only watch loops alive as monitoring", () => {
    expect(
      threadListLabel({
        ...baseShell,
        latestTurn: turn("completed", { completedAt: "2026-01-01T00:01:00.000Z" }),
        backgroundLiveness: "monitoring",
      }),
    ).toBe("M Fix login redirect");
    expect(
      threadListLabel({
        ...baseShell,
        hasPendingApprovals: true,
        backgroundLiveness: "monitoring",
      }),
    ).toBe("? Fix login redirect");
  });

  it("leads with the status icon and truncates to the row budget", () => {
    const label = threadListLabel({
      ...baseShell,
      title: "x".repeat(100),
      latestTurn: turn("running"),
    });
    expect(label.startsWith("▶ ")).toBe(true);
    expect(new TextEncoder().encode(label).length).toBeLessThanOrEqual(LIST_ITEM_MAX_BYTES);
    expect(label.endsWith("...")).toBe(true);
  });

  it("uses a question mark when the thread needs the user", () => {
    expect(threadListLabel({ ...baseShell, hasPendingUserInput: true })).toBe(
      "? Fix login redirect",
    );
  });

  it("caps rows at 64 UTF-8 bytes, not characters", () => {
    const label = threadListLabel({ ...baseShell, title: `${"—".repeat(30)} tail` }, "t3code");
    expect(new TextEncoder().encode(label).length).toBeLessThanOrEqual(64);
    expect(label.endsWith("...")).toBe(true);
  });

  it("prefixes the project and flattens a multi-line title", () => {
    expect(
      threadListLabel({ ...baseShell, title: "# Claude Code handoff\n\nplanner  notes" }, "t3code"),
    ).toBe("· t3code: Claude Code handoff planner notes");
  });
});

describe("displayTitle", () => {
  it("joins project and thread with a slash", () => {
    expect(displayTitle("t3code", "Fix login")).toBe("t3code: Fix login");
  });

  it("falls back to the thread title alone", () => {
    expect(displayTitle(undefined, "Fix login")).toBe("Fix login");
    expect(displayTitle("  ", "Fix login")).toBe("Fix login");
  });
});

describe("statusBar", () => {
  it("shows elapsed time while working", () => {
    expect(
      statusBar({ ...baseShell, latestTurn: turn("running") }, Date.parse("2026-01-01T00:00:12Z")),
    ).toBe("▶   12s");
  });

  it("shows the turn duration once done", () => {
    expect(
      statusBar(
        { ...baseShell, latestTurn: turn("completed", { completedAt: "2026-01-01T00:01:05Z" }) },
        Date.parse("2026-01-01T09:00:00Z"),
      ),
    ).toBe("√");
  });

  it("asks for input with the terminal app's wording", () => {
    expect(statusBar({ ...baseShell, hasPendingApprovals: true }, 0)).toBe("?");
  });

  it("right-aligns the title within the strip on one line", () => {
    const line = statusBar(
      { ...baseShell, latestTurn: turn("running") },
      Date.parse("2026-01-01T00:00:05Z"),
      {
        title: "Fix login redirect",
        maxWidth: STATUS_INNER_WIDTH,
      },
    );
    expect(line.startsWith("▶   5s")).toBe(true);
    expect(line.endsWith("Fix login redirect")).toBe(true);
    expect(getTextWidth(line)).toBeLessThanOrEqual(STATUS_INNER_WIDTH);
    expect(getTextWidth(line)).toBeGreaterThan(STATUS_INNER_WIDTH - 40);
  });

  it("shortens a long title instead of wrapping", () => {
    const line = statusBar({ ...baseShell }, 0, {
      title: "A very long thread title that cannot possibly fit on the status strip at all",
      maxWidth: STATUS_INNER_WIDTH,
    });
    expect(line.endsWith("...")).toBe(true);
    expect(measureTextWrap(line, STATUS_INNER_WIDTH).lineCount).toBe(1);
  });
});

describe("latestReply", () => {
  it("returns the newest assistant text without markdown fences", () => {
    expect(
      latestReply([
        message("user", "hi", "2026-01-01T00:00:00Z"),
        message("assistant", "```ts\nconst a = 1\n```\n\n**Done**", "2026-01-01T00:00:01Z"),
      ]),
    ).toBe("const a = 1\n\nDone");
  });

  it("shows the pending user prompt when no reply has arrived", () => {
    expect(
      latestReply([
        message("assistant", "old", "2026-01-01T00:00:00Z"),
        message("user", "new ask", "2026-01-01T00:00:01Z"),
      ]),
    ).toBe("You: new ask");
  });
});

describe("wrapWords", () => {
  it("wraps on spaces so every line fits the pixel budget", () => {
    const wrapped = wrapWords("word ".repeat(60).trim(), 200);
    expect(wrapped.length).toBeGreaterThan(1);
    for (const line of wrapped) {
      expect(getTextWidth(line)).toBeLessThanOrEqual(200);
    }
    expect(wrapped.join(" ")).toBe("word ".repeat(60).trim());
  });

  it("splits a single word that is wider than the line", () => {
    const wrapped = wrapWords("x".repeat(120), 100);
    expect(wrapped.length).toBeGreaterThan(1);
    expect(wrapped.join("")).toBe("x".repeat(120));
  });
});

describe("transcriptLines", () => {
  it("marks the user with /, agent blocks with >, and questions with ?", () => {
    const rows = transcriptLines(
      {
        messages: [
          message("user", "Build it", "2026-01-01T00:00:00Z"),
          message("assistant", "On it.", "2026-01-01T00:00:01Z"),
          message("assistant", "Now the models.", "2026-01-01T00:00:03Z"),
        ],
        activities: [
          activity("tool.started", "Read package.json", "2026-01-01T00:00:02Z"),
          activity("tool.progress", "Read package.json", "2026-01-01T00:00:02.500Z"),
          activity("tool.completed", "Read package.json", "2026-01-01T00:00:02.900Z"),
          activity("approval.requested", "Allow grep?", "2026-01-01T00:00:04Z", {
            tone: "approval",
          }),
          activity("approval.resolved", "Allow once", "2026-01-01T00:00:05Z", {
            tone: "approval",
          }),
        ],
      },
      BODY_INNER_WIDTH,
    );
    expect(rows).toEqual([
      expect.stringMatching(/^\/\s+Build it$/),
      expect.stringMatching(/^>\s+On it\.$/),
      expect.stringMatching(/^>\s+Read package\.json$/),
      expect.stringMatching(/^\s+Now the models\.$/),
      expect.stringMatching(/^\?\s+Allow grep\?$/),
      expect.stringMatching(/^\/\s+Allow once$/),
    ]);
  });

  it("hangs wrapped assistant text under the marker column", () => {
    const rows = transcriptLines(
      {
        messages: [message("assistant", "word ".repeat(40).trim(), "2026-01-01T00:00:01Z")],
        activities: [],
      },
      BODY_INNER_WIDTH,
    );
    expect(rows.length).toBeGreaterThan(1);
    expect(rows[0]?.startsWith(">")).toBe(true);
    for (const row of rows.slice(1)) {
      expect(row.startsWith("    ")).toBe(true);
    }
    for (const row of rows) {
      expect(getTextWidth(row)).toBeLessThanOrEqual(BODY_INNER_WIDTH);
    }
  });

  it("replaces a tool's started line with its completed summary in place", () => {
    const rows = transcriptLines(
      {
        messages: [],
        activities: [
          activity("tool.started", "File change started", "2026-01-01T00:00:01Z", {
            toolCallId: "call-1",
          }),
          activity("tool.started", "Command run started", "2026-01-01T00:00:02Z", {
            toolCallId: "call-2",
          }),
          activity("tool.completed", "File change", "2026-01-01T00:00:03Z", {
            toolCallId: "call-1",
          }),
        ],
      },
      BODY_INNER_WIDTH,
    );
    expect(rows).toEqual([
      expect.stringMatching(/^>\s+File change$/),
      expect.stringMatching(/^>\s+Command run started$/),
    ]);
  });

  it("collapses a long user message to three lines but keeps agent text whole", () => {
    const rows = transcriptLines(
      {
        messages: [
          message("user", "ask ".repeat(80).trim(), "2026-01-01T00:00:00Z"),
          message("assistant", "reply ".repeat(80).trim(), "2026-01-01T00:00:01Z"),
        ],
        activities: [],
      },
      BODY_INNER_WIDTH,
    );
    const userRows = rows.filter((row, index) => index < 3);
    expect(userRows[0]?.startsWith("/")).toBe(true);
    expect(userRows[2]?.endsWith("...")).toBe(true);
    expect(rows[3]?.startsWith(">")).toBe(true);
    expect(rows.length).toBeGreaterThan(10);
  });

  it("includes every loaded turn, oldest first", () => {
    const older = {
      ...message("user", "first ask", "2026-01-01T00:00:00Z"),
      turnId: "turn-0" as TurnId,
    };
    const rows = transcriptLines(
      { messages: [older, message("user", "second ask", "2026-01-01T00:01:00Z")], activities: [] },
      BODY_INNER_WIDTH,
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatch(/^\/\s+first ask$/);
  });
});

describe("line windows", () => {
  const rows = Array.from({ length: 12 }, (_, index) => `line ${index}`);

  it("takes the newest lines that fit the budget, capped by line count", () => {
    const tail = windowEndingAt(rows, rows.length, 1000, 4);
    expect(tail).toEqual({ start: 8, end: 12, text: "line 8\nline 9\nline 10\nline 11" });
  });

  it("stops adding lines once the character budget is spent", () => {
    // "line 10\nline 11" is 15 characters; a third line would exceed 20.
    expect(windowEndingAt(rows, rows.length, 20)).toEqual({
      start: 10,
      end: 12,
      text: "line 10\nline 11",
    });
    expect(windowStartingAt(rows, 0, 13)).toEqual({ start: 0, end: 2, text: "line 0\nline 1" });
  });

  it("always includes one line even when it is over budget", () => {
    expect(windowEndingAt(rows, 1, 2)).toEqual({ start: 0, end: 1, text: "line 0" });
    expect(windowStartingAt(rows, 11, 2)).toEqual({ start: 11, end: 12, text: "line 11" });
  });

  it("clamps out-of-range positions", () => {
    expect(windowEndingAt(rows, 99, 1000).end).toBe(12);
    expect(windowStartingAt(rows, -5, 1000).start).toBe(0);
  });
});

describe("revealedLines", () => {
  const rows = ["abc", "defg", "hi"];

  it("returns whole lines plus a partial last line", () => {
    expect(revealedLines(rows, 0)).toEqual([]);
    expect(revealedLines(rows, 2)).toEqual(["ab"]);
    expect(revealedLines(rows, 3)).toEqual(["abc"]);
    expect(revealedLines(rows, 4)).toEqual(["abc"]);
    expect(revealedLines(rows, 6)).toEqual(["abc", "de"]);
    expect(revealedLines(rows, transcriptLength(rows))).toEqual(rows);
    expect(revealedLines(rows, 99)).toEqual(rows);
  });
});

describe("skipInstantLines", () => {
  const layout = {
    lines: ["/ ask", "> reply one", "  reply two", "? allow?"],
    origins: ["user", "agent", "agent", "approval"] as const,
  };

  it("jumps past a user line the cursor lands on", () => {
    expect(skipInstantLines(layout, 2)).toBe(6);
  });

  it("leaves the cursor alone inside agent text", () => {
    expect(skipInstantLines(layout, 8)).toBe(8);
    expect(skipInstantLines(layout, 20)).toBe(20);
  });

  it("jumps past a trailing approval line to the end", () => {
    expect(skipInstantLines(layout, 30)).toBe(transcriptLength(layout.lines));
  });

  it("snaps to the end once the reader has replied below the cursor", () => {
    const replied = {
      lines: ["> reply one", "  reply two", "/ next ask"],
      origins: ["agent", "agent", "user"] as const,
    };
    expect(skipInstantLines(replied, 3)).toBe(transcriptLength(replied.lines));
  });
});

describe("toolStepLabel", () => {
  const tool = (payload: unknown) => ({
    ...activity("tool.updated", "Command run", "2026-01-01T00:00:00Z"),
    payload,
  });

  it("words a running command like the work log", () => {
    expect(
      toolStepLabel(
        tool({
          itemType: "command_execution",
          status: "inProgress",
          detail: "Bash: cd apps && vp test run\nsecond line",
          data: { toolName: "Bash", input: {} },
        }),
      ),
    ).toBe("Running cd");
  });

  it("uses the past tense and the file name once an edit completes", () => {
    expect(
      toolStepLabel(
        tool({
          itemType: "file_change",
          status: "completed",
          detail: 'Edit: {"file_path":"/repo/apps/glasses/src/phone/App.tsx","old_string":"x"}',
          data: { toolName: "Edit", input: {} },
        }),
      ),
    ).toBe("Edited App.tsx");
  });

  it("reads and searches by tool name", () => {
    expect(
      toolStepLabel(
        tool({
          itemType: "dynamic_tool_call",
          status: "inProgress",
          data: { toolName: "Read", input: { file_path: "/repo/README.md" } },
        }),
      ),
    ).toBe("Reading README.md");
    expect(
      toolStepLabel(
        tool({
          itemType: "dynamic_tool_call",
          status: "completed",
          data: { toolName: "Grep", input: { pattern: "toolStepLabel" } },
        }),
      ),
    ).toBe("Searched toolStepLabel");
  });

  it("falls back to the server summary when nothing is recognised", () => {
    expect(
      toolStepLabel(
        tool({ itemType: "command_execution", status: "inProgress", detail: "Bash: {}" }),
      ),
    ).toBe("Command run");
  });
});

describe("statusBar loading cue", () => {
  it("spins with a Loading label while older turns are fetched", () => {
    const line = statusBar({ ...baseShell }, 0, {
      title: "Fix login",
      maxWidth: STATUS_INNER_WIDTH,
      browsing: true,
      loadingOlder: true,
      spinnerFrame: 1,
    });
    expect(line.startsWith("^ ▼ Loading")).toBe(true);
    expect(line.endsWith("Fix login")).toBe(true);
  });
});

describe("statusBar browsing cue", () => {
  it("prefixes the strip with ^ while scrolled back", () => {
    const line = statusBar({ ...baseShell }, 0, {
      title: "Fix login",
      maxWidth: STATUS_INNER_WIDTH,
      browsing: true,
    });
    expect(line.startsWith("^ ·")).toBe(true);
  });
});

describe("visibleThreads", () => {
  const now = "2026-01-10T00:00:00.000Z";
  const thread = (
    id: string,
    createdAt: string,
    overrides: Record<string, unknown> = {},
  ): OrchestrationThreadShell =>
    ({
      ...baseShell,
      id,
      createdAt,
      updatedAt: createdAt,
      archivedAt: null,
      settledOverride: null,
      ...overrides,
    }) as never;

  it("hides archived, settled, and snoozed threads", () => {
    const result = visibleThreads(
      [
        thread("active", "2026-01-01T00:00:00.000Z"),
        thread("archived", "2026-01-02T00:00:00.000Z", { archivedAt: "2026-01-03T00:00:00.000Z" }),
        thread("settled", "2026-01-03T00:00:00.000Z", { settledOverride: "settled" }),
        thread("snoozed", "2026-01-04T00:00:00.000Z", {
          snoozedAt: "2026-01-09T00:00:00.000Z",
          snoozedUntil: "2026-01-11T00:00:00.000Z",
        }),
      ],
      { now },
    );
    expect(result.map((entry) => entry.id)).toEqual(["active"]);
  });

  it("shows a snoozed thread again once its wake time passes", () => {
    const result = visibleThreads(
      [
        thread("woke", "2026-01-01T00:00:00.000Z", {
          snoozedAt: "2026-01-08T00:00:00.000Z",
          snoozedUntil: "2026-01-09T00:00:00.000Z",
        }),
      ],
      { now },
    );
    expect(result.map((entry) => entry.id)).toEqual(["woke"]);
  });

  it("lists pinned threads first, then active threads newest first", () => {
    const result = visibleThreads(
      [
        thread("old", "2026-01-01T00:00:00.000Z"),
        thread("new", "2026-01-02T00:00:00.000Z"),
        thread("unsettled", "2025-12-01T00:00:00.000Z", {
          unsettledAt: "2026-01-05T00:00:00.000Z",
        }),
        thread("pinned", "2025-11-01T00:00:00.000Z", { pinnedAt: "2026-01-03T00:00:00.000Z" }),
      ],
      { now },
    );
    expect(result.map((entry) => entry.id)).toEqual(["pinned", "unsettled", "new", "old"]);
  });
});

describe("dashboardLayout", () => {
  const rows = Array.from({ length: 12 }, (_, index) => ({
    id: `t${index}`,
    icon: index % 2 === 0 ? "▶" : "M",
    project: index % 3 === 0 ? "t3code" : "biohub-chatbot",
    title: `Thread ${index}`,
  }));
  const preview = (id: string) => (id === "t1" ? null : `Preview for ${id}`);
  const columnPx = (line: string, text: string) => getTextWidth(line.slice(0, line.indexOf(text)));
  const space = getTextWidth(" ");

  it("lays out title, indented preview, and a blank line per thread", () => {
    const layout = dashboardLayout(rows.slice(0, 2), "t1", 0, preview, 8);
    const lines = layout.content.split("\n");
    expect(lines).toHaveLength(5);
    expect(lines[0]).toMatch(/^\s+▶\s+Thread 0\s+t3code$/);
    expect(lines[1]).toMatch(/^\s+Preview for t0$/);
    expect(lines[2]).toBe("");
    expect(lines[3]).toMatch(/^>\s+M\s+Thread 1\s+biohub-chatbot$/);
    expect(lines[4]).toMatch(/^\s+\.\.\.$/);
    expect(layout.cursor).toBe(1);
    expect(layout.visibleIds).toEqual(["t0", "t1"]);
  });

  it("aligns status, title, and project columns across rows to within a space", () => {
    const [first, , , second] = dashboardLayout(
      rows.slice(0, 2),
      "t0",
      0,
      preview,
      8,
    ).content.split("\n");
    // The marked row's ">" must not push its status icon out of the column.
    expect(Math.abs(columnPx(first!, "▶") - columnPx(second!, "M"))).toBeLessThan(space);
    expect(Math.abs(columnPx(first!, "Thread 0") - columnPx(second!, "Thread 1"))).toBeLessThan(
      space,
    );
    expect(Math.abs(columnPx(first!, "t3code") - columnPx(second!, "biohub-chatbot"))).toBeLessThan(
      space,
    );
  });

  it("follows the cursor to the thread, not the row, when the list reorders", () => {
    const reordered = [rows[2]!, rows[0]!, rows[1]!];
    expect(dashboardLayout(reordered, "t1", 0, preview, 8).cursor).toBe(2);
    expect(dashboardLayout(reordered, "gone", 0, preview, 8).cursor).toBe(0);
  });

  it("shows two threads plus a footer when paged and shifts one at a time", () => {
    const first = dashboardLayout(rows, "t0", 0, preview, 8);
    const lines = first.content.split("\n");
    expect(lines).toHaveLength(7);
    expect(lines.at(-1)).toMatch(/^\s+v 10 below$/);
    expect(first.visibleIds).toEqual(["t0", "t1"]);

    const pastBottom = dashboardLayout(rows, "t2", first.windowStart, preview, 8);
    expect(pastBottom.windowStart).toBe(1);
    expect(pastBottom.content.split("\n").at(-1)).toMatch(/^\s+\^ 1 above   v 9 below$/);

    const backUp = dashboardLayout(rows, "t0", pastBottom.windowStart, preview, 8);
    expect(backUp.windowStart).toBe(0);
  });

  it("fits three threads without a footer when that is all there is", () => {
    const layout = dashboardLayout(rows.slice(0, 3), "t0", 0, preview, 8);
    expect(layout.content.split("\n")).toHaveLength(8);
    expect(layout.visibleIds).toEqual(["t0", "t1", "t2"]);
  });
});

describe("threadPreview", () => {
  it("shows the current step while working, the reply when done, or the user's line", () => {
    const messages = [message("user", "Build it", "2026-01-01T00:00:00Z")];
    expect(threadPreview({ messages, activities: [] }, false)).toBe("You: Build it");
    const step = activity("tool.started", "Read package.json", "2026-01-01T00:00:02Z");
    expect(threadPreview({ messages, activities: [step] }, true)).toBe("Read package.json");
    const replied = {
      messages: [...messages, message("assistant", "Done.\nAll green.", "2026-01-01T00:00:03Z")],
      activities: [activity("turn.completed", "Task completed", "2026-01-01T00:00:04Z")],
    };
    expect(threadPreview(replied, false)).toBe("Done.");
    expect(
      threadPreview(
        {
          ...replied,
          activities: [
            activity("approval.requested", "Allow grep?", "2026-01-01T00:00:05Z", {
              tone: "approval",
            }),
          ],
        },
        false,
      ),
    ).toBe("Allow grep?");
    expect(threadPreview({ messages: [], activities: [] }, false)).toBe("No reply yet.");
  });
});
