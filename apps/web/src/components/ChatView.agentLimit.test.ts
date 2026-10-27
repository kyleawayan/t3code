import { describe, expect, it } from "vite-plus/test";

import {
  AGENT_LIMIT_SEND_BLOCK_REASON,
  agentLimitSendBlockReason,
  isAgentActive,
} from "./ChatView.logic";

type Shell = Parameters<typeof isAgentActive>[0];

function shell(status: string | null, overrides: Partial<Shell> = {}): Shell {
  return {
    runtime: (status === null ? null : { status }) as Shell["runtime"],
    blockedOnThreadWait: false,
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    pendingSubagentRequest: null,
    ...overrides,
  };
}

describe("isAgentActive", () => {
  it("counts working, starting, and provider-waiting threads", () => {
    for (const status of ["running", "preparing", "starting", "waiting"]) {
      expect(isAgentActive(shell(status)), status).toBe(true);
    }
  });

  it("skips threads that are idle, queued, waiting on another thread, or waiting on the user", () => {
    expect(isAgentActive(shell(null))).toBe(false);
    expect(isAgentActive(shell("idle"))).toBe(false);
    expect(isAgentActive(shell("queued"))).toBe(false);
    expect(isAgentActive(shell("running", { blockedOnThreadWait: true }))).toBe(false);
    expect(isAgentActive(shell("running", { hasPendingApprovals: true }))).toBe(false);
    expect(isAgentActive(shell("running", { hasPendingUserInput: true }))).toBe(false);
  });
});

describe("agentLimitSendBlockReason", () => {
  it("lets a new turn start below the limit", () => {
    expect(agentLimitSendBlockReason(["env:a"], "env:b")).toBeNull();
  });

  it("blocks a new turn once two agents are working", () => {
    expect(agentLimitSendBlockReason(["env:a", "env:b"], "env:c")).toBe(
      AGENT_LIMIT_SEND_BLOCK_REASON,
    );
    expect(agentLimitSendBlockReason(["env:a", "env:b"], null)).toBe(AGENT_LIMIT_SEND_BLOCK_REASON);
  });

  it("still sends follow-ups to a thread with a turn in progress", () => {
    expect(agentLimitSendBlockReason(["env:a", "env:b"], "env:a")).toBeNull();
    // Waiting on its delegated threads, so not counted as working itself.
    expect(agentLimitSendBlockReason(["env:b", "env:c"], "env:a", 1, true)).toBeNull();
  });

  it("counts every model a multiple-model send would start", () => {
    expect(agentLimitSendBlockReason([], "env:draft", 2)).toBeNull();
    expect(agentLimitSendBlockReason([], "env:draft", 3)).toBe(AGENT_LIMIT_SEND_BLOCK_REASON);
    expect(agentLimitSendBlockReason(["env:a"], "env:draft", 2)).toBe(
      AGENT_LIMIT_SEND_BLOCK_REASON,
    );
  });
});
