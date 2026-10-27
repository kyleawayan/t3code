export const DEFAULT_COMPOSER_PLACEHOLDER = "Ask anything. @ files, $ skills, / commands";

/**
 * Fork: once a thread has a project, the resting placeholder names where a message goes,
 * "{project}: {thread}", ahead of the generic hint.
 */
export function resolveComposerPlaceholder(input: {
  /** A pending approval: whether its decline takes feedback or redirects the agent. */
  readonly approval: "feedback" | "redirect" | null;
  readonly pendingQuestion: "choice" | "open" | null;
  readonly planFollowUp: boolean;
  readonly projectSelectionRequired: boolean;
  readonly providerUnavailable: boolean;
  readonly projectTitle: string | null;
  readonly threadTitle: string | null;
}): { readonly text: string; readonly namesThread: boolean } {
  const blocking =
    input.approval === "feedback"
      ? "Send feedback to decline this request"
      : input.approval === "redirect"
        ? "Send a message to decline and redirect the agent"
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
  return { text: DEFAULT_COMPOSER_PLACEHOLDER, namesThread: false };
}
