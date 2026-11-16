import { create } from "zustand";

import { linearBridge, useLinearKeyStore, type LinearRequestError } from "./linearBridge";
import { issueFingerprint } from "./linearModel";
import { LINEAR_ISSUE_QUERY } from "./linearQuery";
import type { LinearIssue } from "./linearTypes";

export interface LinearIssueEntry {
  /** undefined: never loaded; null: Linear has no such issue. */
  readonly issue: LinearIssue | null | undefined;
  readonly fingerprint: string;
  readonly loading: boolean;
  readonly error: { readonly kind: LinearRequestError; readonly message: string } | null;
}

interface LinearIssueStore {
  readonly entries: Readonly<Record<string, LinearIssueEntry>>;
}

export const useLinearIssueStore = create<LinearIssueStore>()(() => ({ entries: {} }));

const EMPTY_ENTRY: LinearIssueEntry = {
  issue: undefined,
  fingerprint: "",
  loading: false,
  error: null,
};

const inFlight = new Map<string, Promise<void>>();
// Kept outside the store so an unchanged refresh doesn't re-render anything.
const fetchedAt = new Map<string, number>();

const patchEntry = (identifier: string, patch: Partial<LinearIssueEntry>) =>
  useLinearIssueStore.setState((state) => ({
    entries: {
      ...state.entries,
      [identifier]: { ...(state.entries[identifier] ?? EMPTY_ENTRY), ...patch },
    },
  }));

/** Fetches through the desktop bridge; an unchanged result leaves the store alone. */
export function fetchLinearIssue(identifier: string): Promise<void> {
  const pending = inFlight.get(identifier);
  if (pending) return pending;
  const bridge = linearBridge();
  if (!bridge) {
    patchEntry(identifier, {
      error: { kind: "no-key", message: "The Linear tab needs the T3 Code desktop app." },
    });
    return Promise.resolve();
  }
  const current = useLinearIssueStore.getState().entries[identifier];
  if (current?.issue === undefined && !current?.loading) patchEntry(identifier, { loading: true });
  const request = bridge
    .request(LINEAR_ISSUE_QUERY, { id: identifier })
    .then((result) => {
      const previous = useLinearIssueStore.getState().entries[identifier] ?? EMPTY_ENTRY;
      fetchedAt.set(identifier, Date.now());
      if (!result.ok) {
        patchEntry(identifier, {
          loading: false,
          error: { kind: result.error, message: result.message },
        });
        return;
      }
      const issue = ((result.data as { issue?: LinearIssue | null }).issue ??
        null) as LinearIssue | null;
      const fingerprint = issueFingerprint(issue);
      const unchanged =
        fingerprint === previous.fingerprint && previous.error === null && !previous.loading;
      if (unchanged) return;
      patchEntry(identifier, { issue, fingerprint, loading: false, error: null });
    })
    .catch((cause: unknown) => {
      patchEntry(identifier, {
        loading: false,
        error: { kind: "failed", message: cause instanceof Error ? cause.message : String(cause) },
      });
    })
    .finally(() => inFlight.delete(identifier));
  inFlight.set(identifier, request);
  return request;
}

// Identifiers are only unique within a workspace, so a new key starts from an empty cache.
useLinearKeyStore.subscribe((next, previous) => {
  if (!previous.status || next.status?.workspaceUrlKey === previous.status.workspaceUrlKey) return;
  fetchedAt.clear();
  useLinearIssueStore.setState({ entries: {} });
});

export const LINEAR_REFRESH_MS = 30_000;

export function isLinearIssueStale(identifier: string, maxAgeMs: number): boolean {
  return Date.now() - (fetchedAt.get(identifier) ?? 0) >= maxAgeMs;
}
