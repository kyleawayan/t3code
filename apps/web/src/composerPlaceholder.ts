export const DISCONNECTED_COMPOSER_PLACEHOLDER =
  "Ask for changes, send follow-ups, or attach images";

/**
 * The composer's resting placeholder names where a message will go:
 * "{project} on {branch} - {thread}". Drafts have no thread name yet, and a
 * project outside a repository has no branch.
 */
export function composerContextPlaceholder(input: {
  readonly projectTitle: string;
  readonly branch: string | null;
  readonly threadTitle: string | null;
}): string {
  const where = input.branch ? `${input.projectTitle} on ${input.branch}` : input.projectTitle;
  return input.threadTitle ? `${where} - ${input.threadTitle}` : where;
}
