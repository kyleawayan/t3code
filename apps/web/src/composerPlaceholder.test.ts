import { describe, expect, it } from "vite-plus/test";

import { composerContextPlaceholder } from "./composerPlaceholder";

describe("composerContextPlaceholder", () => {
  it("names the project and thread", () => {
    expect(composerContextPlaceholder({ projectTitle: "my-app", threadTitle: "Fix login" })).toBe(
      "my-app: Fix login",
    );
  });

  it("names only the project for a draft", () => {
    expect(composerContextPlaceholder({ projectTitle: "my-app", threadTitle: null })).toBe(
      "my-app",
    );
  });
});
