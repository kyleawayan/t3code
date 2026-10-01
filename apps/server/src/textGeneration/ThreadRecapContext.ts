import {
  formatThreadContext,
  type ThreadContextBudget,
  type ThreadTitleMessage,
} from "./ThreadTitleContext.ts";

// Recaps lean on assistant progress reports as much as on user intent, so they
// get twice the title budget with a larger share held for assistant messages.
const RECAP_CONTEXT_BUDGET: ThreadContextBudget = {
  total: 16_000,
  perMessage: 3_000,
  assistantReserve: 6_000,
};

/** Thread history for recap generation. Attachments appear by name only. */
export function formatThreadRecapContext(messages: ReadonlyArray<ThreadTitleMessage>): string {
  return formatThreadContext(messages, RECAP_CONTEXT_BUDGET).message;
}

const MESSAGE_ISSUE_ID = /\b[A-Z][A-Z0-9]{1,9}-\d+\b/g;
// Linear branch names put a lowercase key at the start of a path segment,
// such as `user/eng-123-fix-login`. Letters only, so UUID fragments never match.
const PATH_ISSUE_ID = /(?:^|[/\\])([a-z]{2,10}-\d+)(?=$|[-_/\\])/gi;
// Standards and model names shaped like issue keys.
const NON_ISSUE_KEYS = new Set([
  "AES",
  "CVE",
  "ES",
  "GPT",
  "HTTP",
  "ISO",
  "PR",
  "RFC",
  "RSA",
  "SHA",
  "SSL",
  "TLS",
  "UTF",
  "WCAG",
]);
const MAX_LINEAR_ISSUE_IDS = 5;

// Titles like `197.1: Move frontend` name issue 197 of the thread's team; `.1` marks a follow-up.
const TITLE_ISSUE_NUMBER = /^\s*(\d{1,6})(?:\.\d{1,3})?\s*[:\-–]/;

const issueKey = (id: string) => id.slice(0, id.indexOf("-"));

/**
 * Linear issue IDs from the thread's title, branch, worktree path, and user messages, in that
 * order. A numeric title prefix becomes the first ID once another ID reveals the team key.
 */
export function detectLinearIssueIds(input: {
  readonly title: string;
  readonly messages: ReadonlyArray<ThreadTitleMessage>;
  readonly branch: string | null;
  readonly worktreePath: string | null;
  readonly previousLinearIssueIds?: ReadonlyArray<string> | undefined;
}): ReadonlyArray<string> {
  const pathIds = (value: string | null) =>
    value === null ? [] : Array.from(value.matchAll(PATH_ISSUE_ID), (match) => match[1]!);
  const fromBranch = pathIds(input.branch);
  const fromWorktree = pathIds(input.worktreePath);
  const fromTitle = input.title.match(MESSAGE_ISSUE_ID) ?? [];
  const fromMessages = input.messages.flatMap((message) =>
    message.role === "user" ? (message.text.match(MESSAGE_ISSUE_ID) ?? []) : [],
  );
  const found = [...fromTitle, ...fromBranch, ...fromWorktree, ...fromMessages]
    .map((id) => id.toUpperCase())
    .filter((id) => !NON_ISSUE_KEYS.has(issueKey(id)));

  const titleNumber = Number(TITLE_ISSUE_NUMBER.exec(input.title)?.[1] ?? 0);
  const team =
    titleNumber > 0 ? threadTeamKey(fromBranch, found, input.previousLinearIssueIds) : null;
  const ids = new Set<string>();
  for (const id of [...(team === null ? [] : [`${team}-${titleNumber}`]), ...found]) {
    if (ids.size >= MAX_LINEAR_ISSUE_IDS) break;
    ids.add(id);
  }
  return [...ids];
}

/** The branch's team key, else the most frequent key among the thread's other IDs. */
function threadTeamKey(
  fromBranch: ReadonlyArray<string>,
  found: ReadonlyArray<string>,
  previous: ReadonlyArray<string> = [],
): string | null {
  const branchKey = fromBranch
    .map((id) => issueKey(id).toUpperCase())
    .find((key) => !NON_ISSUE_KEYS.has(key));
  if (branchKey !== undefined) return branchKey;
  const counts = new Map<string, number>();
  for (const id of [...found, ...previous.map((entry) => entry.toUpperCase())]) {
    const key = issueKey(id);
    if (!NON_ISSUE_KEYS.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let best: string | null = null;
  for (const [key, count] of counts) if (best === null || count > counts.get(best)!) best = key;
  return best;
}
