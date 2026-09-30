import {
  CommandId,
  MessageId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  type OrchestrationReadModel,
  type ThreadRecap,
  type ThreadRecapSummary,
} from "@t3tools/contracts";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { decideOrchestrationCommand } from "./decider.ts";

const UPDATED_AT = "2026-01-01T00:00:00.000Z";
const THREAD_ID = ThreadId.make("thread-1");

const SUMMARY: ThreadRecapSummary = {
  goal: "Migrate to the new UI library",
  done: "E2E tests written",
  now: "Migrating Modal and Button components",
  next: "Get the E2E suite passing on the new UI",
  blocked: null,
  steps: [
    {
      id: "migrate-components",
      label: "Migrate Modal and Button",
      status: "now",
      source: "chat",
      blockedBy: [],
    },
  ],
  links: [],
  linearIssueIds: [],
  basedOnMessageId: MessageId.make("message-1"),
  generatedAt: UPDATED_AT,
};

function readModelWith(recap: ThreadRecap | null): OrchestrationReadModel {
  return {
    snapshotSequence: 0,
    projects: [],
    threads: [
      {
        id: THREAD_ID,
        projectId: ProjectId.make("project-1"),
        title: "Thread",
        modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5.4" },
        runtimeMode: "full-access",
        interactionMode: "default",
        branch: null,
        worktreePath: null,
        pullRequests: [],
        latestTurn: null,
        createdAt: UPDATED_AT,
        updatedAt: UPDATED_AT,
        archivedAt: null,
        settledOverride: null,
        settledAt: null,
        snoozedUntil: null,
        snoozedAt: null,
        recap,
        deletedAt: null,
        messages: [],
        proposedPlans: [],
        activities: [],
        checkpoints: [],
        session: null,
      },
    ],
    updatedAt: UPDATED_AT,
  };
}

const decidePayload = (
  command: Parameters<typeof decideOrchestrationCommand>[0]["command"],
  recap: ThreadRecap | null,
) =>
  decideOrchestrationCommand({ command, readModel: readModelWith(recap) }).pipe(
    Effect.map((result) => (Array.isArray(result) ? result[0] : result).payload),
  );

const toggle = (recapEnabled: boolean) => ({
  type: "thread.meta.update" as const,
  commandId: CommandId.make("toggle-recap"),
  threadId: THREAD_ID,
  recapEnabled,
});

const update = {
  type: "thread.recap.update" as const,
  commandId: CommandId.make("recap-update"),
  threadId: THREAD_ID,
  summary: SUMMARY,
};

it.layer(NodeServices.layer)("thread recap decider", (it) => {
  it.effect("turning a recap on requests a summary right away", () =>
    Effect.gen(function* () {
      const payload = yield* decidePayload(toggle(true), null);
      expect(payload).toMatchObject({
        recap: { enabled: true, summary: null },
        recapRequested: true,
      });
    }),
  );

  it.effect("turning a recap off keeps its summary and requests nothing", () =>
    Effect.gen(function* () {
      const off = yield* decidePayload(toggle(false), { enabled: true, summary: SUMMARY });
      expect(off).toMatchObject({ recap: { enabled: false, summary: SUMMARY } });
      expect(off).not.toHaveProperty("recapRequested");

      const onAgain = yield* decidePayload(toggle(true), { enabled: false, summary: SUMMARY });
      expect(onAgain).toMatchObject({
        recap: { enabled: true, summary: SUMMARY },
        recapRequested: true,
      });
    }),
  );

  it.effect("stores a generated summary without touching thread recency", () =>
    Effect.gen(function* () {
      const payload = yield* decidePayload(update, { enabled: true, summary: null });
      expect(payload).toEqual({
        threadId: THREAD_ID,
        recap: { enabled: true, summary: SUMMARY },
        updatedAt: UPDATED_AT,
      });
    }),
  );

  it.effect("drops a summary that finishes after the recap was turned off", () =>
    Effect.gen(function* () {
      expect(yield* decidePayload(update, { enabled: false, summary: null })).toEqual({
        threadId: THREAD_ID,
        updatedAt: UPDATED_AT,
      });
      expect(yield* decidePayload(update, null)).toEqual({
        threadId: THREAD_ID,
        updatedAt: UPDATED_AT,
      });
    }),
  );
});
