import { buildTurnDiffTree, type TurnDiffTreeNode } from "./turnDiffTree";

/** Git-like status for a changed file, mirroring @pierre/trees' gitStatus lane. */
export type DiffChangeStatus = "added" | "modified" | "deleted" | "renamed";

/** One changed file from the diff pane, with its scroll id and change status. */
export interface DiffChangesEntry {
  readonly path: string;
  readonly fileKey: string;
  readonly status: DiffChangeStatus;
}

export interface DiffChangesTreeModel {
  readonly nodes: TurnDiffTreeNode[];
  /** Maps a file node's path back to the viewer key `scrollTo` expects. */
  readonly fileKeyByPath: ReadonlyMap<string, string>;
  /** Maps a file node's path to its change status, for row coloring. */
  readonly statusByPath: ReadonlyMap<string, DiffChangeStatus>;
}

/** Maps @pierre/diffs' `FileDiffMetadata.type` onto a git-like status. */
export function diffChangeStatusFromType(type: string): DiffChangeStatus {
  switch (type) {
    case "new":
      return "added";
    case "deleted":
      return "deleted";
    case "rename-pure":
    case "rename-changed":
      return "renamed";
    default:
      return "modified";
  }
}

/**
 * Adapts the diff pane's changed-file entries into a folder tree plus path→key
 * and path→status maps, so the Changes list can render like the file browser
 * yet still drive the code view's `scrollTo`. Pure, so the mapping is
 * unit-tested without parsing a real patch.
 */
export function buildDiffChangesTreeModel(
  entries: ReadonlyArray<DiffChangesEntry>,
): DiffChangesTreeModel {
  const fileKeyByPath = new Map<string, string>();
  const statusByPath = new Map<string, DiffChangeStatus>();
  for (const entry of entries) {
    fileKeyByPath.set(entry.path, entry.fileKey);
    statusByPath.set(entry.path, entry.status);
  }
  // The tree is used only for structure + status here, so the builder's line
  // stats are irrelevant; pass zeroes to satisfy its input shape.
  const nodes = buildTurnDiffTree(
    entries.map((entry) => ({ path: entry.path, kind: "file", additions: 0, deletions: 0 })),
  );
  return { nodes, fileKeyByPath, statusByPath };
}
