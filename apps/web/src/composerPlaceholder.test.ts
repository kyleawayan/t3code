import { describe, expect, it } from "vite-plus/test";

import { DEFAULT_COMPOSER_PLACEHOLDER, resolveComposerPlaceholder } from "./composerPlaceholder";

const idle = {
  approval: null,
  pendingQuestion: null,
  planFollowUp: false,
  projectSelectionRequired: false,
  providerUnavailable: false,
  projectTitle: "my-app",
  threadTitle: "Fix login",
} as const;

describe("resolveComposerPlaceholder", () => {
  it("names the project and thread", () => {
    expect(resolveComposerPlaceholder(idle)).toEqual({
      text: "my-app: Fix login",
      namesThread: true,
    });
  });

  it("names only the project for a draft", () => {
    expect(resolveComposerPlaceholder({ ...idle, threadTitle: null }).text).toBe("my-app");
  });

  it("lets a pending approval, question, or plan follow-up take over", () => {
    expect(resolveComposerPlaceholder({ ...idle, approval: "redirect" })).toEqual({
      text: "Send a message to decline and redirect the agent",
      namesThread: false,
    });
    expect(resolveComposerPlaceholder({ ...idle, pendingQuestion: "choice" }).text).toBe(
      "Choose an option above",
    );
    expect(resolveComposerPlaceholder({ ...idle, planFollowUp: true }).namesThread).toBe(false);
  });

  it("falls back to the generic hint without a project", () => {
    expect(resolveComposerPlaceholder({ ...idle, projectTitle: null }).text).toBe(
      DEFAULT_COMPOSER_PLACEHOLDER,
    );
  });
});
