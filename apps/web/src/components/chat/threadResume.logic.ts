import type { MessageId, ThreadRecapStep } from "@t3tools/contracts";

import type { MessagesTimelineRow } from "./MessagesTimeline.logic";

export type ResumeWhoseMove = "approve" | "answer" | "agent" | "user";

/**
 * Whose move it is, from live thread state rather than the recap summary.
 * A pending request outranks a running session: the turn is blocked on the
 * user even though the session still reports running.
 */
export function deriveResumeWhoseMove(input: {
  readonly hasPendingApproval: boolean;
  readonly hasPendingUserInput: boolean;
  readonly isWorking: boolean;
}): ResumeWhoseMove {
  if (input.hasPendingApproval) return "approve";
  if (input.hasPendingUserInput) return "answer";
  if (input.isWorking) return "agent";
  return "user";
}

export function resumeWhoseMoveLabel(move: ResumeWhoseMove): string {
  switch (move) {
    case "approve":
      return "Your move: approve";
    case "answer":
      return "Your move: answer";
    case "agent":
      return "Agent working";
    case "user":
      return "Your move";
  }
}

export type RecapFreshness = "current" | "updating" | "stale";

/**
 * A summary is current when it covers the newest message. Newer messages
 * during a running turn will be folded in when the turn ends; newer messages
 * after it mean the summary is simply behind.
 */
export function deriveRecapFreshness(input: {
  readonly basedOnMessageId: MessageId | null;
  readonly latestMessageId: MessageId | null;
  readonly isWorking: boolean;
}): RecapFreshness {
  if (input.latestMessageId === null || input.latestMessageId === input.basedOnMessageId) {
    return "current";
  }
  return input.isWorking ? "updating" : "stale";
}

/** Only web links open from the map; anything else in a summary stays inert text. */
export function safeRecapLinkUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : null;
  } catch {
    return null;
  }
}

const LINEAR_WORKSPACE_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const LINEAR_ISSUE_ID_PATTERN = /^[A-Za-z][A-Za-z0-9]*-[0-9]+$/;

/** Issue page for a Linear ID, or null when either part could not be a real slug or key. */
export function linearIssueUrl(workspace: string | null, issueId: string): string | null {
  if (workspace === null || !LINEAR_WORKSPACE_PATTERN.test(workspace)) return null;
  if (!LINEAR_ISSUE_ID_PATTERN.test(issueId)) return null;
  return `https://linear.app/${workspace}/issue/${issueId.toUpperCase()}`;
}

/** Distinct openable links in a summary, across the link list and the steps. */
export function countRecapLinks(summary: {
  readonly links: ReadonlyArray<{ readonly url: string }>;
  readonly steps: ReadonlyArray<{ readonly url?: string | undefined }>;
}): number {
  const urls = new Set<string>();
  for (const url of [
    ...summary.links.map((link) => link.url),
    ...summary.steps.map((step) => step.url),
  ]) {
    const safe = url === undefined ? null : safeRecapLinkUrl(url);
    if (safe !== null) urls.add(safe);
  }
  return urls.size;
}

export function recapStepSourceLabel(step: ThreadRecapStep): string {
  switch (step.source) {
    case "chat":
      return "chat";
    case "linear":
      return step.linearIssueId ? `Linear ${step.linearIssueId}` : "Linear";
    case "inferred":
      return "guess";
  }
}

export interface LeftOffSnapshot {
  /** This device's last visit to the thread, captured before opening it updated the stamp. */
  readonly visitedAt: string;
  /** When the thread was opened; messages after this arrived while the user was watching. */
  readonly openedAt: string;
}

export const LEFT_OFF_ROW_ID = "left-off-divider";

/**
 * Insert "You left off here" before the first message created after the
 * previous visit. Scans from the end because new messages are the tail.
 * Returns `rows` unchanged when nothing was missed or nothing precedes the
 * new messages to leave off from.
 */
export function insertLeftOffDividerRow(
  rows: MessagesTimelineRow[],
  snapshot: LeftOffSnapshot | null,
): MessagesTimelineRow[] {
  if (snapshot === null) return rows;
  const visitedAtMs = Date.parse(snapshot.visitedAt);
  const openedAtMs = Date.parse(snapshot.openedAt);
  if (!Number.isFinite(visitedAtMs) || !Number.isFinite(openedAtMs)) return rows;

  let firstNewIndex = -1;
  let firstNewCreatedAt = "";
  let newCount = 0;
  let hasOlderMessage = false;
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index]!;
    if (row.kind !== "message") continue;
    const createdAtMs = Date.parse(row.message.createdAt);
    if (!Number.isFinite(createdAtMs)) continue;
    if (createdAtMs <= visitedAtMs) {
      hasOlderMessage = true;
      break;
    }
    firstNewIndex = index;
    firstNewCreatedAt = row.message.createdAt;
    if (createdAtMs <= openedAtMs) newCount += 1;
  }
  if (firstNewIndex < 0 || newCount === 0 || !hasOlderMessage) return rows;

  return [
    ...rows.slice(0, firstNewIndex),
    {
      kind: "left-off",
      id: LEFT_OFF_ROW_ID,
      createdAt: firstNewCreatedAt,
      newCount,
    },
    ...rows.slice(firstNewIndex),
  ];
}
