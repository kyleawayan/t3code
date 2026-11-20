// oxlint-disable t3code/no-untranslated-copy -- Fork-only English copy, kept out of upstream's translation catalogs.
import { create } from "zustand";

import { linearBridge, useLinearKeyStore, type LinearRequestError } from "./linearBridge";
import { LINEAR_MILESTONE_QUERY } from "./linearQuery";
import type { LinearMilestone } from "./linearTypes";

export interface LinearMilestoneEntry {
  /** undefined: never loaded; null: Linear has no such milestone. */
  readonly milestone: LinearMilestone | null | undefined;
  readonly fingerprint: string;
  readonly loading: boolean;
  readonly error: { readonly kind: LinearRequestError; readonly message: string } | null;
}

export const useLinearMilestoneStore = create<{
  readonly entries: Readonly<Record<string, LinearMilestoneEntry>>;
}>()(() => ({ entries: {} }));

const EMPTY_ENTRY: LinearMilestoneEntry = {
  milestone: undefined,
  fingerprint: "",
  loading: false,
  error: null,
};
const inFlight = new Map<string, Promise<void>>();
const fetchedAt = new Map<string, number>();
// Background refreshes of a long milestone wait longer, so one tab can't spend the key's hourly budget.
const pageCounts = new Map<string, number>();

const patchEntry = (id: string, patch: Partial<LinearMilestoneEntry>) =>
  useLinearMilestoneStore.setState((state) => ({
    entries: { ...state.entries, [id]: { ...(state.entries[id] ?? EMPTY_ENTRY), ...patch } },
  }));

function settle(id: string, milestone: LinearMilestone | null) {
  fetchedAt.set(id, Date.now());
  const fingerprint = JSON.stringify(milestone);
  const previous = useLinearMilestoneStore.getState().entries[id] ?? EMPTY_ENTRY;
  if (fingerprint === previous.fingerprint && previous.error === null && !previous.loading) return;
  patchEntry(id, { milestone, fingerprint, loading: false, error: null });
}

const failed = (id: string, cause: unknown) =>
  patchEntry(id, {
    loading: false,
    error: { kind: "failed", message: cause instanceof Error ? cause.message : String(cause) },
  });

interface LinearMilestonePage extends Omit<LinearMilestone, "issues"> {
  readonly issues: LinearMilestone["issues"] & {
    readonly pageInfo?: { readonly hasNextPage: boolean; readonly endCursor: string | null };
  };
}

// Past this many pages the list stops rather than loading without end.
const MAX_PAGES = 10;

/** Dev builds read `fix-` milestones from the local fixture, like `FIX-` issues. */
const DEV_FIXTURE_ID = /^fix-/;

/** Fetches through the desktop bridge; an unchanged result leaves the store alone. */
export function fetchLinearMilestone(id: string): Promise<void> {
  const pending = inFlight.get(id);
  if (pending) return pending;
  const current = useLinearMilestoneStore.getState().entries[id];
  if (current?.milestone === undefined && !current?.loading) patchEntry(id, { loading: true });
  const request = (
    import.meta.env.DEV && DEV_FIXTURE_ID.test(id)
      ? import("./linearDevFixtures").then(({ DEV_LINEAR_MILESTONES }) =>
          settle(id, DEV_LINEAR_MILESTONES[id] ?? null),
        )
      : requestFromLinear(id)
  )
    .catch((cause: unknown) => failed(id, cause))
    .finally(() => inFlight.delete(id));
  inFlight.set(id, request);
  return request;
}

async function requestFromLinear(id: string): Promise<void> {
  const bridge = linearBridge();
  if (!bridge) {
    patchEntry(id, {
      loading: false,
      error: { kind: "no-key", message: "The Linear tab needs the T3 Code desktop app." },
    });
    return;
  }
  const pages: LinearMilestonePage[] = [];
  let after: string | null = null;
  while (pages.length < MAX_PAGES) {
    const result = await bridge.request(LINEAR_MILESTONE_QUERY, { id, after });
    if (!result.ok) {
      fetchedAt.set(id, Date.now());
      patchEntry(id, { loading: false, error: { kind: result.error, message: result.message } });
      return;
    }
    const page = (result.data as { projectMilestone?: LinearMilestonePage | null })
      .projectMilestone;
    if (!page) break;
    pages.push(page);
    const { pageInfo } = page.issues;
    if (!pageInfo?.hasNextPage || !pageInfo.endCursor) break;
    after = pageInfo.endCursor;
  }
  const [first] = pages;
  pageCounts.set(id, Math.max(1, pages.length));
  settle(
    id,
    first ? { ...first, issues: { nodes: pages.flatMap((page) => page.issues.nodes) } } : null,
  );
}

// Milestone ids are only meaningful in one workspace, so a new key starts from an empty cache.
useLinearKeyStore.subscribe((next, previous) => {
  if (!previous.status || next.status?.workspaceUrlKey === previous.status.workspaceUrlKey) return;
  fetchedAt.clear();
  pageCounts.clear();
  useLinearMilestoneStore.setState({ entries: {} });
});

export function isLinearMilestoneStale(id: string, maxAgeMs: number): boolean {
  return Date.now() - (fetchedAt.get(id) ?? 0) >= maxAgeMs * (pageCounts.get(id) ?? 1);
}
