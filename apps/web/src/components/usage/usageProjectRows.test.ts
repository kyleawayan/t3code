import type {
  EnvironmentId,
  UsageDay,
  UsageProjectTotal,
  UsageProviderKind,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  buildUsageProjectSeries,
  buildUsageProjectTable,
  type UsageKnownProject,
  type UsageProjectRow,
} from "./usageProjectRows";

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
          periods: [
            {
              cwd: "/work/app",
              provider: "claude",
              day: "2026-11-01" as UsageDay,
              costUsd: 0.4,
              totalTokens: 1,
            },
            {
              cwd: "/work/app/",
              provider: "claude",
              day: "2026-11-02" as UsageDay,
              costUsd: 0.6,
              totalTokens: 1,
            },
            {
              cwd: "/work/app/packages/ui",
              provider: "codex",
              day: "2026-11-02" as UsageDay,
              costUsd: 2,
              totalTokens: 1,
            },
            {
              cwd: "/work/app",
              provider: "cursor",
              day: "2026-11-01" as UsageDay,
              costUsd: 64,
              totalTokens: 1,
            },
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
    expect([...(app?.costByPeriod ?? [])]).toEqual([
      ["2026-11-01", 0.4],
      ["2026-11-02", 2.6],
    ]);
  });
});

describe("buildUsageProjectSeries", () => {
  const row = (key: string, costs: readonly number[]): UsageProjectRow => ({
    key,
    label: key,
    path: `/work/${key}`,
    environmentLabel: "This Mac",
    costUsd: costs.reduce((sum, cost) => sum + cost, 0),
    totalTokens: 0,
    sessions: 0,
    costByProvider: new Map(),
    costByPeriod: new Map(costs.map((cost, index) => [`day-${index}`, cost])),
  });
  const rows = [row("a", [5, 5]), row("b", [3, 1]), row("c", [1, 2]), row("d", [0, 1])];
  const periods = ["day-0", "day-1"];
  const shape = (focusedKey: string | null) =>
    buildUsageProjectSeries(rows, periods, 2, focusedKey).map((entry) => [
      entry.key,
      entry.slot,
      entry.label,
      entry.values,
    ]);

  it("folds projects past the palette into Other, and a focused one leaves it", () => {
    expect(shape(null)).toEqual([
      ["a", 0, "a", [5, 5]],
      ["b", 1, "b", [3, 1]],
      ["other", null, "2 other projects", [1, 3]],
    ]);
    expect(shape("c")).toEqual([
      ["a", 0, "a", [5, 5]],
      ["b", 1, "b", [3, 1]],
      ["c", null, "c", [1, 2]],
      ["other", null, "1 other project", [0, 1]],
    ]);
    expect(shape("a")).toEqual(shape(null));
  });
});
