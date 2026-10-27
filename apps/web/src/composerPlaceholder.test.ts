import { describe, expect, it } from "vite-plus/test";

import {
  DISCONNECTED_COMPOSER_PLACEHOLDER,
  resolveComposerPlaceholder,
} from "./composerPlaceholder";

const idle = {
  approvalPending: false,
  pendingQuestion: null,
  planFollowUp: false,
  projectSelectionRequired: false,
  providerUnavailable: false,
  projectTitle: "my-app",
  threadTitle: "Fix login",
  disconnected: false,
} as const;

describe("resolveComposerPlaceholder", () => {
  it("names the project and thread even while no provider session is live", () => {
    expect(resolveComposerPlaceholder({ ...idle, disconnected: true })).toEqual({
      text: "my-app: Fix login",
      namesThread: true,
    });
  });

  it("names only the project for a draft", () => {
    expect(resolveComposerPlaceholder({ ...idle, threadTitle: null }).text).toBe("my-app");
  });

  it("lets a pending approval, question, or plan follow-up take over", () => {
    expect(resolveComposerPlaceholder({ ...idle, approvalPending: true })).toMatchObject({
      namesThread: false,
    });
    expect(resolveComposerPlaceholder({ ...idle, pendingQuestion: "choice" }).text).toBe(
      "Choose an option above",
    );
    expect(resolveComposerPlaceholder({ ...idle, planFollowUp: true }).namesThread).toBe(false);
  });

  it("falls back to the generic hints without a project", () => {
    expect(
      resolveComposerPlaceholder({ ...idle, projectTitle: null, disconnected: true }).text,
    ).toBe(DISCONNECTED_COMPOSER_PLACEHOLDER);
  });
});
