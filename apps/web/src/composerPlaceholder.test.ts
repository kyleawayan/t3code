import { describe, expect, it } from "vite-plus/test";

import { composerContextPlaceholder } from "./composerPlaceholder";

describe("composerContextPlaceholder", () => {
  it("names the project, branch, and thread", () => {
    expect(
      composerContextPlaceholder({
        projectTitle: "my-app",
        branch: "main",
        threadTitle: "Fix login",
      }),
    ).toBe("my-app on main - Fix login");
  });

  it("leaves out a missing branch or thread name", () => {
    expect(
      composerContextPlaceholder({
        projectTitle: "my-app",
        branch: null,
        threadTitle: "Fix login",
      }),
    ).toBe("my-app - Fix login");
    expect(
      composerContextPlaceholder({ projectTitle: "my-app", branch: "main", threadTitle: null }),
    ).toBe("my-app on main");
  });
});
