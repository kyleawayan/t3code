import { CollapsibleSectionHeader } from "../ui/collapsible-section-header";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { type ReactNode } from "react";
import { cn } from "~/lib/utils";
import { useClientSettings } from "../../hooks/useSettings";
import { FolderIcon } from "lucide-react";
import {
  animateSidebarLayoutChanges,
  sidebarMarkerId,
  sidebarProjectGroupId,
  type SidebarListMarker,
} from "../Sidebar.logic";
import { ProjectFavicon, type ProjectFaviconProject } from "../ProjectFavicon";
import { SIDEBAR_SORTABLE_DRAG_DISABLED, SIDEBAR_SORTABLE_DRAG_ENABLED } from "./SidebarThreadRow";
import { SidebarThreadUndoNotice } from "./SidebarThreadUndoNotice";

function SortableSidebarMarker(props: {
  marker: SidebarListMarker;
  className?: string;
  children?: ReactNode;
  "data-testid"?: string;
}) {
  const { setNodeRef, transform, transition } = useSortable({
    id: sidebarMarkerId(props.marker),
    disabled: SIDEBAR_SORTABLE_DRAG_DISABLED,
    animateLayoutChanges: animateSidebarLayoutChanges,
  });
  return (
    <li
      ref={setNodeRef}
      data-thread-selection-safe
      data-testid={props["data-testid"]}
      className={cn("list-none", props.className)}
      style={{
        transform: CSS.Translate.toString(transform),
        transition: props.marker.endsWith("-placeholder") ? "none" : transition,
        visibility: transform?.scaleY === 0 ? "hidden" : undefined,
      }}
    >
      {props.children}
    </li>
  );
}

export function SidebarSectionPlaceholder(props: {
  marker: "active-placeholder" | "settled-placeholder";
  label: string;
  showHint: boolean;
  isDropTarget: boolean;
}) {
  return (
    <SortableSidebarMarker
      marker={props.marker}
      data-testid={`sidebar-${props.marker}`}
      className="relative mx-0.5 -mb-px h-0"
    >
      {props.showHint ? (
        <div
          className={cn(
            "absolute inset-x-0 top-0 flex h-9 items-center justify-center rounded-md border border-dashed border-sidebar-foreground/25 text-xs text-sidebar-foreground/80",
            props.isDropTarget && "border-primary/40 bg-primary/5 text-primary",
          )}
        >
          {props.label}
        </div>
      ) : null}
    </SortableSidebarMarker>
  );
}

export function SidebarDragBoundary(props: {
  marker: "pinned-header" | "pinned-divider";
  label: string;
  visible: boolean;
  isDropTarget: boolean;
}) {
  return (
    <SortableSidebarMarker
      marker={props.marker}
      data-testid={`sidebar-${props.marker}`}
      className="pointer-events-none relative mx-0.5 -mb-px h-0"
    >
      {props.visible ? (
        <div className="sidebar-drag-boundary-label absolute inset-x-2 top-1 flex h-4 items-center gap-2">
          <span
            className={cn(
              "shrink-0 text-xs font-medium",
              props.isDropTarget ? "text-primary" : "text-sidebar-foreground/80",
            )}
          >
            {props.label}
          </span>
          <span
            aria-hidden
            className={cn(
              "h-px flex-1",
              props.isDropTarget ? "bg-primary/50" : "bg-sidebar-foreground/25",
            )}
          />
        </div>
      ) : null}
    </SortableSidebarMarker>
  );
}

export function SidebarSectionHeader(props: {
  marker: "working-header" | "snoozed-header" | "settled-header";
  label: string;
  /** A muted trailing count; classic shows it only while the shelf is collapsed. */
  count: number;
  className?: string;
  dragging?: boolean;
  isDropTarget?: boolean;
  toggle: { expanded: boolean; onToggle: () => void };
  /** The first shelf at the bottom of the list hosts the undo notice just above itself. */
  hostsUndoNotice?: boolean;
}) {
  const shelf =
    props.marker === "working-header"
      ? "working"
      : props.marker === "snoozed-header"
        ? "snoozed"
        : "settled";
  const redesign = useClientSettings((s) => s.redesignEnabled);
  const collapsedCount = props.toggle.expanded ? null : props.count;
  const count = redesign ? props.count : collapsedCount;
  return (
    <SortableSidebarMarker
      marker={props.marker}
      data-testid={`sidebar-${props.marker}`}
      className={cn("relative mx-0.5 h-8", props.className)}
    >
      {props.hostsUndoNotice ? (
        <SidebarThreadUndoNotice className="absolute inset-x-0 bottom-full bg-sidebar surface-grain" />
      ) : null}
      <CollapsibleSectionHeader
        onClick={props.toggle.onToggle}
        expanded={props.toggle.expanded}
        tone={props.isDropTarget ? "accent" : props.dragging ? "emphasized" : "muted"}
        data-testid={`sidebar-${shelf}-shelf-toggle`}
        accessory={
          redesign && count !== null ? (
            <span className="font-normal tabular-nums">{count}</span>
          ) : null
        }
      >
        {props.label}
        {!redesign && collapsedCount !== null ? ` (${collapsedCount})` : null}
      </CollapsibleSectionHeader>
    </SortableSidebarMarker>
  );
}

export function SidebarProjectGroupHeader(props: {
  projectKey: string;
  label: string;
  project: ProjectFaviconProject | null;
  dragDisabled: boolean;
  first: boolean;
}) {
  const { listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: sidebarProjectGroupId(props.projectKey),
    disabled: props.dragDisabled ? SIDEBAR_SORTABLE_DRAG_DISABLED : SIDEBAR_SORTABLE_DRAG_ENABLED,
    animateLayoutChanges: animateSidebarLayoutChanges,
  });
  return (
    <li
      ref={setNodeRef}
      data-thread-selection-safe
      data-testid="sidebar-project-group"
      data-project-group={props.projectKey}
      className={cn(
        // Padding, not margin: the drag preview lays rows out from their measured heights.
        "mx-0.5 list-none rounded-md px-2 text-sm font-semibold text-foreground select-none",
        props.first || isDragging ? "pt-1.5" : "pt-4.5",
        !props.dragDisabled && "cursor-grab active:cursor-grabbing",
        isDragging && "relative z-10 bg-sidebar-row-hover pb-1.5 shadow-sm",
      )}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        visibility: !isDragging && transform?.scaleY === 0 ? "hidden" : undefined,
      }}
      {...listeners}
    >
      <div className="flex h-6 items-center gap-2">
        {props.project ? (
          <ProjectFavicon project={props.project} className="size-4 shrink-0" />
        ) : (
          <FolderIcon className="size-4 shrink-0" />
        )}
        <span className="min-w-0 truncate">{props.label}</span>
      </div>
      {/* Cancels the sidebar group's and this row's horizontal padding to span the sidebar. */}
      {isDragging ? null : (
        <div aria-hidden className="-mx-4.5 mt-1 h-px bg-sidebar-foreground/15" />
      )}
    </li>
  );
}
