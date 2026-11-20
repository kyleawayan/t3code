import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { ScopedThreadRef } from "@t3tools/contracts";

import { randomUUID } from "../lib/utils";
import { PULL_REQUESTS_PANEL_REF, rightPanelHostRef, useRightPanelStore } from "../rightPanelStore";
import { linearBridge, useLinearKeyStore } from "./linearBridge";
import { parseLinearIssueUrl, parseLinearMilestoneUrl } from "./linearLinks";
import {
  LINEAR_SEARCH_ENTRY,
  linearMilestoneEntry,
  linearSurfaceIssue,
  newLinearSurface,
  pushLinearIssue,
  stepLinearHistory,
  type LinearSurface,
} from "./linearSurface";

function linearSurfaces(ref: ScopedThreadRef): LinearSurface[] {
  const state = useRightPanelStore.getState().byThreadKey[scopedThreadKey(rightPanelHostRef(ref))];
  return (state?.surfaces ?? []).filter(
    (surface): surface is LinearSurface => surface.kind === "linear",
  );
}

const findSurface = (ref: ScopedThreadRef, surfaceId: string) =>
  linearSurfaces(ref).find((surface) => surface.id === surfaceId);

/** From outside a Linear tab: show the tab already on this issue, or open a new one. */
function openLinearIssue(ref: ScopedThreadRef, identifier: string): void {
  const store = useRightPanelStore.getState();
  const showing = linearSurfaces(ref).find((surface) => linearSurfaceIssue(surface) === identifier);
  store.setLinearSurface(ref, showing ?? newLinearSurface(randomUUID(), identifier), true);
}

/** From inside a Linear tab: that tab moves to `identifier`, keeping its history. */
export function openLinearIssueInSurface(
  ref: ScopedThreadRef,
  surfaceId: string,
  identifier: string,
): void {
  const surface = findSurface(ref, surfaceId);
  if (!surface) return openLinearIssue(ref, identifier);
  useRightPanelStore.getState().setLinearSurface(ref, pushLinearIssue(surface, identifier), true);
}

/** The surface launchers' "Linear issue" entry: a new tab on the search page, on desktop only. */
export function linearSearchOpener(
  ref: ScopedThreadRef | null | undefined,
): (() => void) | undefined {
  if (!ref || !linearBridge()) return undefined;
  return () =>
    useRightPanelStore
      .getState()
      .setLinearSurface(ref, newLinearSurface(randomUUID(), LINEAR_SEARCH_ENTRY), true);
}

export function stepLinearIssue(ref: ScopedThreadRef, surfaceId: string, delta: -1 | 1): boolean {
  const current = findSurface(ref, surfaceId);
  const next = current && stepLinearHistory(current, delta);
  if (!next) return false;
  useRightPanelStore.getState().setLinearSurface(ref, next, false);
  return true;
}

/** The tab entry for an issue or milestone link to the key's workspace, or null for any other link. */
export function linearLinkIdentifier(url: string): string | null {
  if (!linearBridge()) return null;
  const status = useLinearKeyStore.getState().status;
  const issue = parseLinearIssueUrl(url);
  const milestone = issue ? null : parseLinearMilestoneUrl(url);
  const workspace = issue?.workspace ?? milestone?.workspace;
  if (!workspace || !status?.hasKey || status.workspaceUrlKey?.toLowerCase() !== workspace) {
    return null;
  }
  return issue ? issue.identifier : linearMilestoneEntry(milestone!.id);
}

/**
 * Fork: Linear tab. Opens a Linear issue or milestone link in a Linear tab when the desktop app has a key for
 * that link's workspace. Otherwise the caller opens it like any other link.
 */
export function tryOpenLinearLink(url: string, ref: ScopedThreadRef | undefined): boolean {
  // The standalone PR page's panel only renders PR tabs.
  if (!ref || scopedThreadKey(ref) === scopedThreadKey(PULL_REQUESTS_PANEL_REF)) return false;
  const identifier = linearLinkIdentifier(url);
  if (!identifier) return false;
  openLinearIssue(ref, identifier);
  return true;
}
