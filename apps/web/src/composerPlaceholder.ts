export const DISCONNECTED_COMPOSER_PLACEHOLDER =
  "Ask for changes, send follow-ups, or attach images";

/**
 * The composer's resting placeholder names where a message will go:
 * "{project}: {thread}". Drafts have no thread name yet. The branch stays in
 * the bottom bar.
 */
export function composerContextPlaceholder(input: {
  readonly projectTitle: string;
  readonly threadTitle: string | null;
}): string {
  return input.threadTitle ? `${input.projectTitle}: ${input.threadTitle}` : input.projectTitle;
}
