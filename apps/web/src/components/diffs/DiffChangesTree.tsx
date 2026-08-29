import { ChevronRightIcon, FolderClosedIcon, FolderIcon } from "lucide-react";
import { memo, useCallback, useMemo, useState } from "react";

import {
  buildDiffChangesTreeModel,
  type DiffChangeStatus,
  type DiffChangesEntry,
} from "~/lib/diffChangesTree";
import { type TurnDiffTreeNode } from "~/lib/turnDiffTree";
import { cn } from "~/lib/utils";

import { PierreEntryIcon } from "../chat/PierreEntryIcon";

// Indent geometry. Guide lines are drawn absolutely against the same left
// offset the row content uses, so each ancestor line sits ~half a step left of
// its child — under the parent chevron when STEP is near the chevron width.
const INDENT_BASE = 4;
const INDENT_STEP = 12;
const GUIDE_COLOR = "color-mix(in srgb, var(--muted-foreground) 22%, transparent)";

// App-level tokens: the --diffs-* palette only exists inside the diff viewer's
// shadow root, not out here in the light DOM.
const STATUS_META: Record<DiffChangeStatus, { letter: string; className: string }> = {
  added: { letter: "A", className: "text-success" },
  modified: { letter: "M", className: "text-warning" },
  deleted: { letter: "D", className: "text-destructive" },
  renamed: { letter: "R", className: "text-info" },
};

/**
 * The diff pane's right-side "Changes" list: a folder tree of the files in the
 * current diff, styled like the file browser (compact indent + connected guide
 * lines), colored by git-like status, that scrolls the code view on click.
 */
export const DiffChangesTree = memo(function DiffChangesTree(props: {
  entries: ReadonlyArray<DiffChangesEntry>;
  resolvedTheme: "light" | "dark";
  selectedFileKey: string | null;
  onSelectFileKey: (fileKey: string) => void;
}) {
  const { entries, resolvedTheme, selectedFileKey, onSelectFileKey } = props;
  const { nodes, fileKeyByPath, statusByPath } = useMemo(
    () => buildDiffChangesTreeModel(entries),
    [entries],
  );
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

  const renderNode = (node: TurnDiffTreeNode, depth: number) => {
    const rowStyle = { paddingLeft: `${INDENT_BASE + depth * INDENT_STEP}px` };
    // One full-height 1px line per ancestor level. Absolute + gapless rows =
    // continuous vertical guides.
    const guides = Array.from({ length: depth }, (_, level) => (
      <span
        key={level}
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 w-px"
        style={{
          left: `${INDENT_BASE + level * INDENT_STEP + INDENT_STEP / 2}px`,
          backgroundColor: GUIDE_COLOR,
        }}
      />
    ));
    const rowClassName =
      "group relative flex min-h-[22px] w-full items-center rounded-md pr-2 text-left transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

    if (node.kind === "directory") {
      const isExpanded = !collapsedDirectories.has(node.path);
      return (
        <div key={`dir:${node.path}`}>
          <button
            type="button"
            className={rowClassName}
            style={rowStyle}
            onClick={() => toggleDirectory(node.path)}
          >
            {guides}
            <ChevronRightIcon
              aria-hidden="true"
              className={cn(
                "size-3.5 shrink-0 text-muted-foreground/70 transition-transform group-hover:text-foreground/80",
                isExpanded && "rotate-90",
              )}
            />
            {isExpanded ? (
              <FolderIcon className="ml-0.5 size-3.5 shrink-0 text-muted-foreground/75" />
            ) : (
              <FolderClosedIcon className="ml-0.5 size-3.5 shrink-0 text-muted-foreground/75" />
            )}
            <span className="ml-1 truncate font-mono text-[11px] text-muted-foreground/90 group-hover:text-foreground/90">
              {node.name}
            </span>
          </button>
          {isExpanded && (
            <div>{node.children.map((childNode) => renderNode(childNode, depth + 1))}</div>
          )}
        </div>
      );
    }

    const fileKey = fileKeyByPath.get(node.path) ?? null;
    const isActive = fileKey !== null && fileKey === selectedFileKey;
    const status = statusByPath.get(node.path);
    const statusMeta = status ? STATUS_META[status] : null;
    return (
      <button
        key={`file:${node.path}`}
        type="button"
        data-active={isActive || undefined}
        className={cn(rowClassName, isActive && "bg-accent")}
        style={rowStyle}
        onClick={() => {
          if (fileKey !== null) onSelectFileKey(fileKey);
        }}
      >
        {guides}
        <span aria-hidden="true" className="size-3.5 shrink-0" />
        <PierreEntryIcon
          pathValue={node.path}
          kind="file"
          theme={resolvedTheme}
          className="ml-0.5 size-3.5 text-muted-foreground/70"
        />
        <span
          className={cn(
            "ml-1 truncate font-mono text-[11px]",
            statusMeta?.className ?? "text-muted-foreground/80",
            status === "deleted" && "line-through",
          )}
        >
          {node.name}
        </span>
        {statusMeta && (
          <span
            className={cn(
              "ml-auto shrink-0 pl-2 font-mono text-[10px] tabular-nums",
              statusMeta.className,
            )}
            aria-label={status}
          >
            {statusMeta.letter}
          </span>
        )}
      </button>
    );
  };

  return <div className="p-1.5">{nodes.map((node) => renderNode(node, 0))}</div>;
});
