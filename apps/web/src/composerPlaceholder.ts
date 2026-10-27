export const DISCONNECTED_COMPOSER_PLACEHOLDER =
  "Ask for changes, send follow-ups, or attach images";

/**
 * Fork: once a thread has a project, the resting placeholder names where a message goes,
 * "{project}: {thread}", ahead of the generic hints. `disconnected` means the thread has no live
 * provider session, its normal idle state, so it must not hide that name.
 */
export function resolveComposerPlaceholder(input: {
  readonly approvalPending: boolean;
  readonly pendingQuestion: "choice" | "open" | null;
  readonly planFollowUp: boolean;
  readonly projectSelectionRequired: boolean;
  readonly providerUnavailable: boolean;
  readonly projectTitle: string | null;
  readonly threadTitle: string | null;
  readonly disconnected: boolean;
}): { readonly text: string; readonly namesThread: boolean } {
  const blocking = input.approvalPending
    ? "Resolve this approval request to continue"
    : input.pendingQuestion === "choice"
      ? "Choose an option above"
      : input.pendingQuestion === "open"
        ? "Type your own answer, or leave this blank to use the selected option"
        : input.planFollowUp
          ? "Add feedback to refine the plan, or leave this blank to implement it"
          : input.projectSelectionRequired
            ? "Choose a project above to start a thread"
            : input.providerUnavailable
              ? "Enable a provider in Settings to send a message"
              : null;
  if (blocking !== null) return { text: blocking, namesThread: false };
  if (input.projectTitle !== null) {
    return {
      text: input.threadTitle ? `${input.projectTitle}: ${input.threadTitle}` : input.projectTitle,
      namesThread: true,
    };
  }
  return {
    text: input.disconnected
      ? DISCONNECTED_COMPOSER_PLACEHOLDER
      : "Ask anything, @tag files/folders, $use skills, or / for commands",
    namesThread: false,
  };
}
