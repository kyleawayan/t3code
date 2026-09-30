import { describe, expect, it } from "vite-plus/test";

import { detectLinearIssueIds, formatThreadRecapContext } from "./ThreadRecapContext.ts";

describe("detectLinearIssueIds", () => {
  it("reads branch and worktree keys before user messages", () => {
    expect(
      detectLinearIssueIds({
        branch: "dev/eng-42-new-ui",
        worktreePath: "/Users/me/.t3/worktrees/app/ops-7",
        messages: [
          { role: "user", text: "Pick up ENG-42 and ABC-101, then XYZ-3." },
          { role: "assistant", text: "Also related: ENG-500." },
        ],
      }),
    ).toEqual(["ENG-42", "OPS-7", "ABC-101", "XYZ-3"]);
  });

  it("ignores lookalikes such as encodings, model names, and UUIDs", () => {
    expect(
      detectLinearIssueIds({
        branch: "t3code/abcdef12-3456-4abc-8def-0123456789ab",
        worktreePath: null,
        messages: [{ role: "user", text: "Use UTF-8, test on GPT-5, cite RFC-9110. Fix eng-1." }],
      }),
    ).toEqual([]);
  });

  it("keeps at most five IDs", () => {
    expect(
      detectLinearIssueIds({
        branch: null,
        worktreePath: null,
        messages: [{ role: "user", text: "ENG-1 ENG-2 ENG-3 ENG-4 ENG-5 ENG-6 ENG-1" }],
      }),
    ).toEqual(["ENG-1", "ENG-2", "ENG-3", "ENG-4", "ENG-5"]);
  });
});

describe("formatThreadRecapContext", () => {
  it("keeps the goal and the latest progress report within budget", () => {
    const message = formatThreadRecapContext([
      { role: "user", text: "Migrate to the new UI library" },
      { role: "assistant", text: "Earlier work. ".repeat(3_000) },
      { role: "user", text: "Now do Modal and Button." },
      { role: "assistant", text: `Migrated Modal. ${"Details. ".repeat(3_000)}Button is next.` },
    ]);
    expect(message.length).toBeLessThanOrEqual(16_000);
    expect(message).toContain("USER:\nMigrate to the new UI library");
    expect(message).toContain("USER:\nNow do Modal and Button.");
    expect(message).toContain("ASSISTANT:\nMigrated Modal.");
    expect(message).toContain("Button is next.");
  });
});
