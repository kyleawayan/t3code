import type { EnvironmentId, UsageProjectTotal, UsageProviderKind } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { buildUsageProjectTable, type UsageKnownProject } from "./usageProjectRows";

const LOCAL = "env-local" as EnvironmentId;
const REMOTE = "env-remote" as EnvironmentId;

const projects: UsageKnownProject[] = [
  { environmentId: LOCAL, id: "app", title: "App", workspaceRoot: "/work/app" },
  { environmentId: LOCAL, id: "docs", title: "Docs", workspaceRoot: "/work/app/docs" },
  { environmentId: LOCAL, id: "t3code", title: "T3 Code", workspaceRoot: "/src/t3code" },
  { environmentId: REMOTE, id: "app", title: "Remote app", workspaceRoot: "/work/app" },
];

function total(cwd: string, costUsd: number, provider: UsageProviderKind = "claude") {
  return {
    cwd,
    provider,
    totals: {
      uncachedInputTokens: 10,
      cachedInputTokens: 20,
      cacheCreationTokens: 5,
      outputTokens: 15,
      reasoningTokens: 7,
    },
    costUsd,
    records: 1,
    sessions: 1,
  } satisfies UsageProjectTotal;
}

function bucket(provider: UsageProviderKind, costUsd: number, tokens: number) {
  return {
    provider,
    costUsd,
    totals: {
      uncachedInputTokens: tokens,
      cachedInputTokens: 0,
      cacheCreationTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
    },
  };
}

describe("buildUsageProjectTable", () => {
  it("files each folder under the project that owns it, per environment", () => {
    const { rows, unfiledCostUsd, unfiledTokens } = buildUsageProjectTable({
      sources: [
        {
          environmentId: LOCAL,
          environmentLabel: "This Mac",
          totals: [
            total("/work/app", 1),
            total("/work/app/packages/ui/", 2, "codex"),
            total("/work/app/docs", 4),
            // A live thread's worktree, and a deleted one only its path still names. Worktrees of a
            // folder that is no project join that folder; Codex worktrees match the same way.
            total("/home/me/.t3/worktrees/t3code/t3-live", 8),
            total("/home/me/.t3/worktrees/t3code/t3-gone/apps/web", 16),
            total("/tmp/scratch", 32),
            total("/home/me/.t3/worktrees/scratch/t3-x", 64),
            total("/home/me/.codex/worktrees/ab12/app/src", 8, "codex"),
            total("/var/T/t3code-claude-title-ab", 0.25),
            total("/var/T/t3code-claude-title-cd", 0.25),
            // Named like T3's temp folders, but a real checkout outside the temp folder.
            total("/src/t3code-mobile", 0.5),
            total("/work/app", 64, "cursor"),
          ],
          // OpenCode records no folder, so its usage is the No folder row.
          buckets: [
            bucket("claude", 136, 550),
            bucket("opencode", 5, 30),
            bucket("cursor", 64, 50),
          ],
        },
        {
          environmentId: REMOTE,
          environmentLabel: "Server",
          totals: [total("/work/app", 0.5)],
          buckets: [bucket("claude", 0.5, 50)],
        },
      ],
      projects,
      worktrees: [
        {
          environmentId: LOCAL,
          projectId: "t3code",
          path: "/home/me/.t3/worktrees/t3code/t3-live",
        },
      ],
      hiddenProviders: new Set(["cursor"]),
    });

    expect(rows.map((row) => [row.label, row.path, row.environmentLabel, row.costUsd])).toEqual([
      ["scratch", "/tmp/scratch", "This Mac", 96],
      ["T3 Code", "/src/t3code", "This Mac", 24],
      ["App", "/work/app", "This Mac", 11],
      ["Docs", "/work/app/docs", "This Mac", 4],
      ["T3 Code text generation", "Thread titles and commit messages", "This Mac", 0.5],
      ["Remote app", "/work/app", "Server", 0.5],
      ["t3code-mobile", "/src/t3code-mobile", "This Mac", 0.5],
    ]);
    expect([unfiledCostUsd, unfiledTokens]).toEqual([5, 30]);
    const app = rows.find((row) => row.label === "App");
    expect(app?.totalTokens).toBe(150);
    expect(app?.sessions).toBe(3);
    expect([...(app?.costByProvider ?? [])]).toEqual([
      ["claude", 1],
      ["codex", 10],
    ]);
  });
});
