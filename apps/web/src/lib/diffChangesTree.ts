import { buildTurnDiffTree, type TurnDiffTreeNode } from "./turnDiffTree";

/** One changed file from the diff pane, with its scroll id and line stats. */
export interface DiffChangesEntry {
  readonly path: string;
  readonly fileKey: string;
  readonly additions: number;
  readonly deletions: number;
}

export interface DiffChangesTreeModel {
  readonly nodes: TurnDiffTreeNode[];
  /** Maps a file node's path back to the viewer key `scrollTo` expects. */
  readonly fileKeyByPath: ReadonlyMap<string, string>;
}

/**
 * Adapts the diff pane's changed-file entries into a folder tree plus a
 * path→viewer-key map, so the Changes list can render like the chat card yet
 * still drive the code view's `scrollTo`. Pure, so the mapping is unit-tested
 * without parsing a real patch.
 */
export function buildDiffChangesTreeModel(
  entries: ReadonlyArray<DiffChangesEntry>,
): DiffChangesTreeModel {
  const fileKeyByPath = new Map<string, string>();
  for (const entry of entries) {
    fileKeyByPath.set(entry.path, entry.fileKey);
  }
  const nodes = buildTurnDiffTree(
    entries.map((entry) => ({
      path: entry.path,
      kind: "file",
      additions: entry.additions,
      deletions: entry.deletions,
    })),
  );
  return { nodes, fileKeyByPath };
}
