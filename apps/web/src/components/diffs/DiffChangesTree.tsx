import { ChevronRightIcon, FolderClosedIcon, FolderIcon } from "lucide-react";
import { memo, useCallback, useMemo, useState } from "react";

import { buildDiffChangesTreeModel, type DiffChangesEntry } from "~/lib/diffChangesTree";
import { type TurnDiffTreeNode } from "~/lib/turnDiffTree";
import { cn } from "~/lib/utils";

import { DiffStatLabel, hasNonZeroStat } from "../chat/DiffStatLabel";
import { PierreEntryIcon } from "../chat/PierreEntryIcon";

/**
 * The diff pane's right-side "Changes" list: a folder tree of the files in the
 * current diff, styled like the chat changed-files tree, that scrolls the code
 * view to a file on click.
 */
export const DiffChangesTree = memo(function DiffChangesTree(props: {
  entries: ReadonlyArray<DiffChangesEntry>;
  resolvedTheme: "light" | "dark";
  selectedFileKey: string | null;
  onSelectFileKey: (fileKey: string) => void;
}) {
  const { entries, resolvedTheme, selectedFileKey, onSelectFileKey } = props;
  const { nodes, fileKeyByPath } = useMemo(() => buildDiffChangesTreeModel(entries), [entries]);
  const [collapsedDirectories, setCollapsedDirectories] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const toggleDirectory = useCallback((pathValue: string) => {
    setCollapsedDirectories((current) => {
      const next = new Set(current);
      if (next.has(pathValue)) next.delete(pathValue);
      else next.add(pathValue);
      return next;
    });
  }, []);

  const hasDirectoryNodes = nodes.some((node) => node.kind === "directory");

  const renderNode = (node: TurnDiffTreeNode, depth: number) => {
    const leftPadding = 8 + depth * 14;
    if (node.kind === "directory") {
      const isExpanded = !collapsedDirectories.has(node.path);
      return (
        <div key={`dir:${node.path}`}>
          <button
            type="button"
            className="group flex w-full items-center gap-1.5 rounded-md py-1 pr-3 text-left transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            style={{ paddingLeft: `${leftPadding}px` }}
            onClick={() => toggleDirectory(node.path)}
          >
            <ChevronRightIcon
              aria-hidden="true"
              className={cn(
                "size-3.5 shrink-0 text-muted-foreground/70 transition-transform group-hover:text-foreground/80",
                isExpanded && "rotate-90",
              )}
            />
            {isExpanded ? (
              <FolderIcon className="size-3.5 shrink-0 text-muted-foreground/75" />
            ) : (
              <FolderClosedIcon className="size-3.5 shrink-0 text-muted-foreground/75" />
            )}
            <span className="truncate font-mono text-[11px] text-muted-foreground/90 group-hover:text-foreground/90">
              {node.name}
            </span>
            {hasNonZeroStat(node.stat) && (
              <span className="ml-auto shrink-0 font-mono text-[10px] tabular-nums">
                <DiffStatLabel additions={node.stat.additions} deletions={node.stat.deletions} />
              </span>
            )}
          </button>
          {isExpanded && (
            <div className="space-y-0.5">
              {node.children.map((childNode) => renderNode(childNode, depth + 1))}
            </div>
          )}
        </div>
      );
    }

    const fileKey = fileKeyByPath.get(node.path) ?? null;
    const isActive = fileKey !== null && fileKey === selectedFileKey;
    return (
      <button
        key={`file:${node.path}`}
        type="button"
        data-active={isActive || undefined}
        className={cn(
          "group flex w-full items-center gap-1.5 rounded-md py-1 pr-3 text-left transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          isActive && "bg-accent",
        )}
        style={{ paddingLeft: `${leftPadding}px` }}
        onClick={() => {
          if (fileKey !== null) onSelectFileKey(fileKey);
        }}
      >
        {hasDirectoryNodes || depth > 0 ? (
          <span aria-hidden="true" className="size-3.5 shrink-0" />
        ) : null}
        <PierreEntryIcon
          pathValue={node.path}
          kind="file"
          theme={resolvedTheme}
          className="size-3.5 text-muted-foreground/70"
        />
        <span
          className={cn(
            "truncate font-mono text-[11px] text-muted-foreground/80 group-hover:text-foreground/90",
            isActive && "text-foreground",
          )}
        >
          {node.name}
        </span>
        {node.stat && (
          <span className="ml-auto shrink-0 font-mono text-[10px] tabular-nums">
            <DiffStatLabel additions={node.stat.additions} deletions={node.stat.deletions} />
          </span>
        )}
      </button>
    );
  };

  return <div className="space-y-0.5 p-2">{nodes.map((node) => renderNode(node, 0))}</div>;
});
