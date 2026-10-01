import { describe, expect, it } from "vite-plus/test";

import { detectLinearIssueIds, formatThreadRecapContext } from "./ThreadRecapContext.ts";

describe("detectLinearIssueIds", () => {
  it("reads the title, then branch and worktree keys, then user messages", () => {
    expect(
      detectLinearIssueIds({
        title: "ENG-9 Fix login",
        branch: "dev/eng-42-new-ui",
        worktreePath: "/Users/me/.t3/worktrees/app/ops-7",
        messages: [
          { role: "user", text: "Pick up ENG-42 and ABC-101, then XYZ-3." },
          { role: "assistant", text: "Also related: ENG-500." },
        ],
      }),
    ).toEqual(["ENG-9", "ENG-42", "OPS-7", "ABC-101", "XYZ-3"]);
  });

  it("ignores lookalikes such as encodings, model names, and UUIDs", () => {
    expect(
      detectLinearIssueIds({
        title: "Encode files as UTF-8",
        branch: "t3code/abcdef12-3456-4abc-8def-0123456789ab",
        worktreePath: null,
        messages: [{ role: "user", text: "Use UTF-8, test on GPT-5, cite RFC-9110. Fix eng-1." }],
      }),
    ).toEqual([]);
  });

  it("reads a numeric title prefix as the thread's primary issue once the team is known", () => {
    const base = { worktreePath: null, messages: [] };
    expect(
      detectLinearIssueIds({ ...base, title: "197.1: Move frontend", branch: "dev/eng-7-deploy" }),
    ).toEqual(["ENG-197", "ENG-7"]);
    expect(
      detectLinearIssueIds({ ...base, title: "42: Fix login", branch: "dev/eng-7-deploy" }),
    ).toEqual(["ENG-42", "ENG-7"]);
    expect(
      detectLinearIssueIds({
        ...base,
        title: "42 - Fix login",
        branch: null,
        messages: [{ role: "user", text: "ABC-1 ABC-2 and ENG-3" }],
      }),
    ).toEqual(["ABC-42", "ABC-1", "ABC-2", "ENG-3"]);
    expect(
      detectLinearIssueIds({
        ...base,
        title: "42.2: Fix login",
        branch: null,
        previousLinearIssueIds: ["ABC-42"],
      }),
    ).toEqual(["ABC-42"]);
    expect(detectLinearIssueIds({ ...base, title: "197.1: Move frontend", branch: null })).toEqual(
      [],
    );
    expect(
      detectLinearIssueIds({ ...base, title: "Version 2: rewrite", branch: "dev/eng-7-deploy" }),
    ).toEqual(["ENG-7"]);
  });

  it("keeps at most five IDs", () => {
    expect(
      detectLinearIssueIds({
        title: "New thread",
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
      { role: "assistant", text: "Earlier work. ".repeat(10_000) },
      { role: "user", text: "Now do Modal and Button." },
      { role: "assistant", text: `Migrated Modal. ${"Details. ".repeat(10_000)}Button is next.` },
    ]);
    expect(message.length).toBeLessThanOrEqual(48_000);
    expect(message).toContain("USER:\nMigrate to the new UI library");
    expect(message).toContain("USER:\nNow do Modal and Button.");
    expect(message).toContain("ASSISTANT:\nMigrated Modal.");
    expect(message).toContain("Button is next.");
  });
});
