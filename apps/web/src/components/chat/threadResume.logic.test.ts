import { describe, expect, it } from "vite-plus/test";
import { MessageId, type ThreadRecapStep } from "@t3tools/contracts";

import type { MessagesTimelineRow } from "./MessagesTimeline.logic";
import {
  deriveRecapFreshness,
  deriveResumeWhoseMove,
  countRecapLinks,
  insertLeftOffDividerRow,
  LEFT_OFF_ROW_ID,
  recapStepSourceLabel,
  safeRecapLinkUrl,
} from "./threadResume.logic";

const messageRow = (
  id: string,
  createdAt: string,
  role: "user" | "assistant" = "assistant",
): MessagesTimelineRow =>
  ({
    kind: "message",
    id,
    createdAt,
    message: { id: MessageId.make(id), role, text: id, createdAt, streaming: false },
    durationStart: createdAt,
    showAssistantMeta: false,
    showAssistantCopyButton: false,
    assistantCopyStreaming: false,
  }) as MessagesTimelineRow;

const workRow = (id: string, createdAt: string): MessagesTimelineRow => ({
  kind: "work",
  id,
  createdAt,
  groupedEntries: [],
  isExpandedToolGroup: false,
});

const step = (
  id: string,
  status: ThreadRecapStep["status"],
  over: Partial<ThreadRecapStep> = {},
): ThreadRecapStep => ({ id, label: `Step ${id}`, status, source: "chat", blockedBy: [], ...over });

describe("deriveResumeWhoseMove", () => {
  it("puts a pending approval or question ahead of a running session", () => {
    expect(
      deriveResumeWhoseMove({
        hasPendingApproval: true,
        hasPendingUserInput: true,
        isWorking: true,
      }),
    ).toBe("approve");
    expect(
      deriveResumeWhoseMove({
        hasPendingApproval: false,
        hasPendingUserInput: true,
        isWorking: true,
      }),
    ).toBe("answer");
    expect(
      deriveResumeWhoseMove({
        hasPendingApproval: false,
        hasPendingUserInput: false,
        isWorking: true,
      }),
    ).toBe("agent");
    expect(
      deriveResumeWhoseMove({
        hasPendingApproval: false,
        hasPendingUserInput: false,
        isWorking: false,
      }),
    ).toBe("user");
  });
});

describe("deriveRecapFreshness", () => {
  const based = MessageId.make("m-1");
  const newer = MessageId.make("m-2");

  it("is current when the summary covers the newest message or there are none", () => {
    expect(
      deriveRecapFreshness({ basedOnMessageId: based, latestMessageId: based, isWorking: true }),
    ).toBe("current");
    expect(
      deriveRecapFreshness({ basedOnMessageId: null, latestMessageId: null, isWorking: false }),
    ).toBe("current");
  });

  it("waits for the running turn, and is stale once the turn has ended", () => {
    expect(
      deriveRecapFreshness({ basedOnMessageId: based, latestMessageId: newer, isWorking: true }),
    ).toBe("updating");
    expect(
      deriveRecapFreshness({ basedOnMessageId: based, latestMessageId: newer, isWorking: false }),
    ).toBe("stale");
    expect(
      deriveRecapFreshness({ basedOnMessageId: null, latestMessageId: newer, isWorking: false }),
    ).toBe("stale");
  });
});

describe("recap links", () => {
  it("opens only web links", () => {
    expect(safeRecapLinkUrl("https://linear.app/team/issue/ABC-1")).toBe(
      "https://linear.app/team/issue/ABC-1",
    );
    expect(safeRecapLinkUrl("javascript:alert(1)")).toBeNull();
    expect(safeRecapLinkUrl("file:///etc/passwd")).toBeNull();
    expect(safeRecapLinkUrl("not a url")).toBeNull();
  });

  it("counts distinct openable links across the list and steps", () => {
    expect(
      countRecapLinks({
        links: [
          { url: "https://example.com/a" },
          { url: "https://example.com/b" },
          { url: "javascript:void(0)" },
        ],
        steps: [{ url: "https://example.com/a" }, { url: "https://example.com/c" }, {}],
      }),
    ).toBe(3);
  });
});

describe("recap step labels", () => {
  it("names each source", () => {
    expect(recapStepSourceLabel(step("a", "now"))).toBe("chat");
    expect(
      recapStepSourceLabel(step("a", "now", { source: "linear", linearIssueId: "ABC-12" })),
    ).toBe("Linear ABC-12");
    expect(recapStepSourceLabel(step("a", "now", { source: "linear" }))).toBe("Linear");
    expect(recapStepSourceLabel(step("a", "now", { source: "inferred" }))).toBe("guess");
  });
});

describe("insertLeftOffDividerRow", () => {
  const rows = [
    messageRow("u1", "2026-09-30T10:00:00.000Z", "user"),
    messageRow("a1", "2026-09-30T10:01:00.000Z"),
    messageRow("u2", "2026-09-30T11:00:00.000Z", "user"),
    workRow("w2", "2026-09-30T11:00:30.000Z"),
    messageRow("a2", "2026-09-30T11:02:00.000Z"),
  ];

  it("goes before the first message after the visit and counts the messages missed", () => {
    const result = insertLeftOffDividerRow(rows, {
      visitedAt: "2026-09-30T10:01:30.000Z",
      openedAt: "2026-09-30T12:00:00.000Z",
    });
    expect(result.map((row) => row.id)).toEqual(["u1", "a1", LEFT_OFF_ROW_ID, "u2", "w2", "a2"]);
    expect(result[2]).toMatchObject({ kind: "left-off", newCount: 2 });
  });

  it("does not count messages that arrived after the thread was opened", () => {
    const result = insertLeftOffDividerRow(rows, {
      visitedAt: "2026-09-30T10:01:30.000Z",
      openedAt: "2026-09-30T11:01:00.000Z",
    });
    expect(result[2]).toMatchObject({ kind: "left-off", newCount: 1 });
  });

  it("returns the same rows when nothing was missed", () => {
    for (const snapshot of [
      null,
      { visitedAt: "2026-09-30T11:05:00.000Z", openedAt: "2026-09-30T12:00:00.000Z" },
      // Everything new arrived while the thread was already open.
      { visitedAt: "2026-09-30T10:01:30.000Z", openedAt: "2026-09-30T10:30:00.000Z" },
      // No earlier message to leave off from.
      { visitedAt: "2026-09-30T09:00:00.000Z", openedAt: "2026-09-30T12:00:00.000Z" },
      { visitedAt: "not-a-date", openedAt: "2026-09-30T12:00:00.000Z" },
    ]) {
      expect(insertLeftOffDividerRow(rows, snapshot)).toBe(rows);
    }
  });
});
