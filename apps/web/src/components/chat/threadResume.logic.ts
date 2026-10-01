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
      return "Suggested move: approve";
    case "answer":
      return "Suggested move: answer";
    case "agent":
      return "Agent working";
    case "user":
      return "Suggested move";
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

export function isLinearWorkspaceSlug(workspace: string | null | undefined): workspace is string {
  return typeof workspace === "string" && LINEAR_WORKSPACE_PATTERN.test(workspace);
}

/**
 * The workspace from the most recently generated summary that has a valid
 * one. Summaries written before workspace detection carry null; the user's
 * other threads usually know it.
 */
export function latestLinearWorkspace(
  summaries: Iterable<
    { readonly linearWorkspace: string | null; readonly generatedAt: string } | null | undefined
  >,
): string | null {
  let latest: { workspace: string; at: number } | null = null;
  for (const summary of summaries) {
    if (!summary || !isLinearWorkspaceSlug(summary.linearWorkspace)) continue;
    const parsed = Date.parse(summary.generatedAt);
    const at = Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
    if (latest === null || at > latest.at) latest = { workspace: summary.linearWorkspace, at };
  }
  return latest?.workspace ?? null;
}

/** Issue page for a Linear ID, or null when either part could not be a real slug or key. */
export function linearIssueUrl(workspace: string | null, issueId: string): string | null {
  if (!isLinearWorkspaceSlug(workspace)) return null;
  if (!LINEAR_ISSUE_ID_PATTERN.test(issueId)) return null;
  return `https://linear.app/${workspace}/issue/${issueId.toUpperCase()}`;
}

/**
 * What came before the current step, newest first: the cleared steps, which
 * answer "did we already do that?" without opening the map. Falls back to the
 * summary's latest finished milestone for summaries without cleared steps.
 */
export function recapBeforeText(summary: {
  readonly done: string | null;
  readonly steps: ReadonlyArray<Pick<ThreadRecapStep, "label" | "status">>;
}): string | null {
  const cleared = summary.steps.filter((step) => step.status === "done").map((step) => step.label);
  if (cleared.length > 0) return cleared.toReversed().join(" · ");
  return summary.done;
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

/** A refresh that never lands (server down, generation failed) stops showing after this. */
export const RECAP_REFRESH_TIMEOUT_MS = 3 * 60 * 1000;

export interface RecapRefreshRequest {
  readonly requestedAtMs: number;
  /** The summary's `generatedAt` when the refresh was asked for; null when there was none. */
  readonly baselineGeneratedAt: string | null;
}

/**
 * The server is writing a new summary. Its marker can outlive a crashed run,
 * so it stops counting after the same timeout as a requested refresh.
 * `nowMinute` is the minute clock ("YYYY-MM-DDTHH:MM", UTC).
 */
export function isServerRecapRefreshing(
  refreshStartedAt: string | undefined,
  nowMinute: string,
): boolean {
  if (refreshStartedAt === undefined) return false;
  const startedMs = Date.parse(refreshStartedAt);
  const nowMs = Date.parse(`${nowMinute}:00.000Z`);
  if (Number.isNaN(startedMs) || Number.isNaN(nowMs)) return false;
  return nowMs - startedMs < RECAP_REFRESH_TIMEOUT_MS;
}

/**
 * When the conversation stood at the point a summary covers: its newest
 * message's time. A summary written just now can cover an older point, so
 * this, not when it was written, is what "as of" means.
 */
export function recapCoveredAt(
  summary: { readonly basedOnMessageId: MessageId | null; readonly generatedAt: string },
  messages: ReadonlyArray<{ readonly id: MessageId; readonly createdAt: string }>,
): string {
  const covered =
    summary.basedOnMessageId === null
      ? undefined
      : messages.findLast((message) => message.id === summary.basedOnMessageId);
  return covered?.createdAt ?? summary.generatedAt;
}

/** The newest message a summary could cover; system notices never count, as on the server. */
export function latestRecapMessageId(
  messages: ReadonlyArray<{ readonly id: MessageId; readonly role: string }>,
): MessageId | null {
  return messages.findLast((message) => message.role !== "system")?.id ?? null;
}

/** Still waiting on a requested refresh: no newer summary yet, and not timed out. */
export function isRecapRefreshPending(
  request: RecapRefreshRequest | undefined,
  currentGeneratedAt: string | null,
  nowMs: number,
): boolean {
  if (request === undefined) return false;
  if (currentGeneratedAt !== request.baselineGeneratedAt) return false;
  return nowMs - request.requestedAtMs < RECAP_REFRESH_TIMEOUT_MS;
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
