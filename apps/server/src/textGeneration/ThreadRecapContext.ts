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

/** Linear issue IDs from the thread's branch, worktree path, and user messages, in that order. */
export function detectLinearIssueIds(input: {
  readonly messages: ReadonlyArray<ThreadTitleMessage>;
  readonly branch: string | null;
  readonly worktreePath: string | null;
}): ReadonlyArray<string> {
  const fromPaths = [input.branch, input.worktreePath].flatMap((value) =>
    value === null ? [] : Array.from(value.matchAll(PATH_ISSUE_ID), (match) => match[1]!),
  );
  const fromMessages = input.messages.flatMap((message) =>
    message.role === "user" ? (message.text.match(MESSAGE_ISSUE_ID) ?? []) : [],
  );
  const ids = new Set<string>();
  for (const candidate of [...fromPaths, ...fromMessages]) {
    if (ids.size >= MAX_LINEAR_ISSUE_IDS) break;
    const id = candidate.toUpperCase();
    if (!NON_ISSUE_KEYS.has(id.slice(0, id.indexOf("-")))) ids.add(id);
  }
  return [...ids];
}
