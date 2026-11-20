// oxlint-disable t3code/no-untranslated-copy -- Fork-only English copy, kept out of upstream's translation catalogs.
import type { EnvironmentId, ScopedThreadRef } from "@t3tools/contracts";
import { ScrollArea as ScrollAreaPrimitive } from "@base-ui/react/scroll-area";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowDownNarrowWide,
  ArrowUpNarrowWide,
  Box,
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CirclePlay,
  CircleUserRound,
  Copy,
  Diamond,
  ExternalLink,
  GitBranch,
  Link2,
  ListTree,
  RotateCw,
  Search,
  Tag,
} from "lucide-react";
import { useEffect, useRef, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";

import { useOpenLink } from "~/browser/useOpenLink";
import {
  SQUISH_TEXT_MIN_SCALE,
  SQUISH_TEXT_TIGHT_MIN_SCALE,
  SquishText,
} from "~/components/SquishText";
import ChatMarkdown from "~/components/ChatMarkdown";
import { Button } from "~/components/ui/button";
import { Popover, PopoverPopup, PopoverTrigger } from "~/components/ui/popover";
import { ScrollArea } from "~/components/ui/scroll-area";
import { Skeleton } from "~/components/ui/skeleton";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { useCopyToClipboard } from "~/hooks/useCopyToClipboard";
import { useNowMinute } from "~/hooks/useNowMinute";
import { cn } from "~/lib/utils";

import { linearBridge, useLinearKeyStore } from "./linearBridge";
import { linearScrollKey, usePersistedScrollAreaPosition } from "./linearScroll";
import {
  LinearAvatar,
  LinearBlockedIcon,
  LinearBlockingIcon,
  LinearColorDot,
  LinearEstimateIcon,
  LinearLogo,
  LinearPriorityIcon,
  LinearProgressRing,
  LinearStateFractionsContext,
  LinearStatusIcon,
} from "./LinearIcons";
import {
  fetchLinearIssue,
  isLinearIssueStale,
  LINEAR_REFRESH_MS,
  useLinearIssueStore,
  type LinearIssueEntry,
} from "./linearIssueStore";
import {
  fetchLinearMilestone,
  isLinearMilestoneStale,
  useLinearMilestoneStore,
  type LinearMilestoneEntry,
} from "./linearMilestoneStore";
import { LinearMarkdown } from "./LinearMarkdown";
import {
  activityItems,
  ancestorChain,
  commentAuthor,
  cycleLabel,
  linearCycleUrl,
  dueDateLabel,
  estimateLabel,
  linearRelativeTime,
  relationGroups,
  subIssueProgress,
  startedStateFractions,
  subIssueRows,
  type LinearActivityIcon,
  type LinearActivityItem,
  type LinearCommentThread,
  type LinearRelationGroup,
  type LinearSubIssueRow,
} from "./linearModel";
import { linearLinkIdentifier, openLinearIssueInSurface, stepLinearIssue } from "./linearOpen";
import { LinearIssueSearch } from "./LinearIssueSearch";
import { useLinearIssueView } from "./linearIssueView";
import {
  LINEAR_SEARCH_ENTRY,
  linearEntryMilestone,
  linearMilestoneEntry,
  linearSurfaceIssue,
  type LinearSurface,
} from "./linearSurface";
import type {
  LinearComment,
  LinearIssue,
  LinearMilestone,
  LinearRelatedIssue,
  LinearSubIssue,
} from "./linearTypes";

const FOCUS_REFRESH_MS = 5_000;

function useLinearRefresh(
  key: string,
  active: boolean,
  isStale: (key: string, maxAgeMs: number) => boolean,
  fetch: (key: string) => Promise<void>,
) {
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- polls Linear while the tab is on screen and the window is focused
  useEffect(() => {
    if (!active) return;
    const refresh = (maxAgeMs: number) => {
      if (document.visibilityState !== "visible") return;
      if (isStale(key, maxAgeMs)) void fetch(key);
    };
    refresh(FOCUS_REFRESH_MS);
    const interval = window.setInterval(() => {
      if (document.hasFocus()) refresh(LINEAR_REFRESH_MS - 1_000);
    }, LINEAR_REFRESH_MS);
    const onFocus = () => refresh(FOCUS_REFRESH_MS);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [key, active, isStale, fetch]);
}

function useLinearIssue(identifier: string, active: boolean): LinearIssueEntry | undefined {
  const entry = useLinearIssueStore((state) => state.entries[identifier]);
  const isIssue = identifier !== LINEAR_SEARCH_ENTRY && linearEntryMilestone(identifier) === null;
  useLinearRefresh(identifier, active && isIssue, isLinearIssueStale, fetchLinearIssue);
  return entry;
}

function useLinearMilestone(id: string | null, active: boolean): LinearMilestoneEntry | undefined {
  const entry = useLinearMilestoneStore((state) => (id === null ? undefined : state.entries[id]));
  useLinearRefresh(id ?? "", active && id !== null, isLinearMilestoneStale, fetchLinearMilestone);
  return entry;
}

const isMac = typeof navigator !== "undefined" && /Mac/.test(navigator.platform);

export function LinearIssuePanel(props: {
  readonly threadRef: ScopedThreadRef;
  readonly environmentId: EnvironmentId;
  readonly surface: LinearSurface;
  readonly visible: boolean;
}) {
  const { threadRef, surface } = props;
  const identifier = linearSurfaceIssue(surface);
  const entry = useLinearIssue(identifier, props.visible);
  const issue = entry?.issue;
  const milestoneId = linearEntryMilestone(identifier);
  const milestoneEntry = useLinearMilestone(milestoneId, props.visible);
  const panelRef = useRef<HTMLDivElement>(null);
  // Each issue keeps its scroll per thread, across tab switches and reloads.
  const scrollRef = usePersistedScrollAreaPosition(linearScrollKey(threadRef, identifier));
  // The clicked row unmounts with the old issue; keep focus here so back keys stay in the tab.
  const keepFocus = () => panelRef.current?.focus({ preventScroll: true });
  const open = (next: string) => {
    openLinearIssueInSurface(threadRef, surface.id, next);
    keepFocus();
  };
  const step = (delta: -1 | 1) => {
    if (stepLinearIssue(threadRef, surface.id, delta)) keepFocus();
  };
  // Issue links inside this tab (description, comments, resources) move this tab, not another.
  const onClickCapture = (event: MouseEvent<HTMLDivElement>) => {
    if (event.metaKey || event.ctrlKey || event.button !== 0) return;
    const anchor = (event.target as Element).closest?.("a[href]");
    const next = anchor ? linearLinkIdentifier(anchor.getAttribute("href") ?? "") : null;
    if (!next) return;
    event.preventDefault();
    event.stopPropagation();
    open(next);
  };
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- receives mouse-driver Back/Forward swipes from the desktop window while this tab claims them
  useEffect(() => {
    const bridge = linearBridge();
    if (!bridge || !props.visible) return;
    const unsubscribe = bridge.onHistoryStep((delta) => {
      if (stepLinearIssue(threadRef, surface.id, delta)) {
        panelRef.current?.focus({ preventScroll: true });
      }
    });
    return () => {
      unsubscribe();
      void bridge.claimHistory(false);
    };
  }, [threadRef, surface.id, props.visible]);

  // Back and forward move this tab's history while focus is inside it, before the app sees them.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const mod = isMac ? event.metaKey : event.ctrlKey;
    if (!mod || event.altKey || event.shiftKey) return;
    if (event.key !== "[" && event.key !== "]") return;
    event.preventDefault();
    event.stopPropagation();
    step(event.key === "[" ? -1 : 1);
  };
  const onMouseUp = (event: MouseEvent<HTMLDivElement>) => {
    if (event.button !== 3 && event.button !== 4) return;
    event.preventDefault();
    event.stopPropagation();
    step(event.button === 3 ? -1 : 1);
  };

  return (
    <div
      data-linear-issue-panel=""
      ref={panelRef}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      onMouseUp={onMouseUp}
      onClickCapture={onClickCapture}
      onPointerEnter={() => void linearBridge()?.claimHistory(props.visible)}
      onPointerLeave={() => void linearBridge()?.claimHistory(false)}
      className="flex min-h-0 flex-1 flex-col outline-none"
    >
      <LinearIssueHeader
        identifier={identifier}
        issue={milestoneId === null ? (issue ?? null) : null}
        milestoneId={milestoneId}
        milestone={milestoneEntry?.milestone ?? null}
        surface={surface}
        loading={(milestoneId === null ? entry : milestoneEntry)?.loading === true}
        threadRef={threadRef}
        onOpen={open}
        onStep={step}
      />
      <ScrollArea key={identifier} ref={scrollRef} className="min-h-0 flex-1">
        {/* Content re-measures when a section collapses, so the scrollbar can't go stale. */}
        <ScrollAreaPrimitive.Content style={{ minWidth: 0 }}>
          <div className="@container mx-auto w-full max-w-3xl px-5 pt-5 pb-10">
            {identifier === LINEAR_SEARCH_ENTRY ? (
              <LinearIssueSearch onOpen={open} />
            ) : milestoneId !== null ? (
              <LinearMilestoneBody
                id={milestoneId}
                entry={milestoneEntry}
                threadRef={threadRef}
                onOpen={open}
              />
            ) : (
              <LinearIssueBody
                identifier={identifier}
                entry={entry}
                threadRef={threadRef}
                environmentId={props.environmentId}
                onOpen={open}
              />
            )}
          </div>
        </ScrollAreaPrimitive.Content>
      </ScrollArea>
    </div>
  );
}

function LinearIssueHeader(props: {
  readonly identifier: string;
  readonly issue: LinearIssue | null;
  readonly milestoneId: string | null;
  readonly milestone: LinearMilestone | null;
  readonly surface: LinearSurface;
  readonly loading: boolean;
  readonly threadRef: ScopedThreadRef;
  readonly onOpen: (identifier: string) => void;
  readonly onStep: (delta: -1 | 1) => void;
}) {
  const { issue, surface, milestoneId } = props;
  const title = issue?.title ?? props.milestone?.name;
  const ancestors = issue ? ancestorChain(issue) : [];
  return (
    <div className="flex min-h-10 shrink-0 flex-wrap items-center gap-x-1 border-b border-border px-2 py-1">
      <HeaderButton label="Back" disabled={surface.index === 0} onClick={() => props.onStep(-1)}>
        <ChevronLeft />
      </HeaderButton>
      <HeaderButton
        label="Forward"
        disabled={surface.index >= surface.history.length - 1}
        onClick={() => props.onStep(1)}
      >
        <ChevronRight />
      </HeaderButton>
      <nav
        aria-label="Issue breadcrumb"
        className="flex min-w-32 flex-1 items-center gap-1 overflow-hidden text-sm"
      >
        {ancestors.map((ancestor) => (
          <span key={ancestor.identifier} className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              className="rounded px-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label={`${ancestor.identifier} ${ancestor.title}`}
              onClick={() => props.onOpen(ancestor.identifier)}
            >
              {ancestor.identifier}
            </button>
            <ChevronRight aria-hidden="true" className="size-3 text-muted-foreground" />
          </span>
        ))}
        <span className="shrink-0 px-1 font-medium">
          {milestoneId !== null ? "Milestone" : props.identifier || "Search"}
        </span>
        {title ? <span className="min-w-0 truncate text-foreground/80">{title}</span> : null}
      </nav>
      {issue ? (
        <div className="ms-auto flex shrink-0 items-center">
          <OpenInLinearButton url={issue.url} threadRef={props.threadRef} />
          <CopyButton label="Copy issue link" value={issue.url} icon={<Link2 />} />
          <CopyButton label="Copy issue ID" value={issue.identifier} icon={<Copy />} />
          <CopyButton label="Copy git branch name" value={issue.branchName} icon={<GitBranch />} />
        </div>
      ) : null}
      {props.identifier === LINEAR_SEARCH_ENTRY ? null : (
        <>
          <HeaderButton
            label="Refresh"
            disabled={props.loading}
            onClick={() =>
              void (milestoneId !== null
                ? fetchLinearMilestone(milestoneId)
                : fetchLinearIssue(props.identifier))
            }
          >
            <RotateCw />
          </HeaderButton>
          <HeaderButton label="Search issues" onClick={() => props.onOpen(LINEAR_SEARCH_ENTRY)}>
            <Search />
          </HeaderButton>
        </>
      )}
    </div>
  );
}

/** In the accent color, so the way out to Linear stands out from the copy buttons. */
function OpenInLinearButton(props: { readonly url: string; readonly threadRef: ScopedThreadRef }) {
  const openLink = useOpenLink(props.threadRef);
  return (
    <HeaderButton label="Open in Linear" onClick={(event) => void openLink(props.url, { event })}>
      <ExternalLink className="text-primary" />
    </HeaderButton>
  );
}

function CopyButton(props: {
  readonly label: string;
  readonly value: string;
  readonly icon: ReactNode;
}) {
  const { copyToClipboard, isCopied } = useCopyToClipboard();
  return (
    <HeaderButton
      label={isCopied ? "Copied" : props.label}
      onClick={() => copyToClipboard(props.value, undefined)}
    >
      {props.icon}
    </HeaderButton>
  );
}

function HeaderButton(props: {
  readonly label: string;
  readonly disabled?: boolean;
  readonly onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  readonly children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label={props.label}
            disabled={props.disabled}
            onClick={props.onClick}
          >
            {props.children}
          </Button>
        }
      />
      <TooltipPopup side="bottom">{props.label}</TooltipPopup>
    </Tooltip>
  );
}

function LinearIssueBody(props: {
  readonly identifier: string;
  readonly entry: LinearIssueEntry | undefined;
  readonly threadRef: ScopedThreadRef;
  readonly environmentId: EnvironmentId;
  readonly onOpen: (identifier: string) => void;
}) {
  const { entry } = props;
  const keyStatus = useLinearKeyStore((state) => state.status);
  const navigate = useNavigate();
  if (entry?.issue) {
    return (
      <LinearIssueView
        issue={entry.issue}
        threadRef={props.threadRef}
        environmentId={props.environmentId}
        onOpen={props.onOpen}
        error={entry.error?.message ?? null}
      />
    );
  }
  if (entry?.error) {
    const needsKey = entry.error.kind === "no-key" || entry.error.kind === "unauthorized";
    return (
      <LinearNotice title={needsKey ? "Linear needs an API key" : "Couldn't load this issue"}>
        {needsKey
          ? `${entry.error.message} Add a read-only key in Settings → Diffs → Linear.`
          : entry.error.message}
        <div className="flex gap-2">
          {needsKey ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => void navigate({ to: "/settings/diffs" })}
            >
              Open Settings
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            onClick={() => void fetchLinearIssue(props.identifier)}
          >
            Try again
          </Button>
        </div>
      </LinearNotice>
    );
  }
  if (entry?.issue === null) {
    return (
      <LinearNotice title={`${props.identifier} wasn't found`}>
        {keyStatus?.workspaceName
          ? `It isn't in the ${keyStatus.workspaceName} workspace, or the API key can't see it.`
          : "The API key can't see it."}
      </LinearNotice>
    );
  }
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading issue">
      <Skeleton className="h-7 w-3/4" />
      <Skeleton className="h-6 w-1/2" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

function LinearMilestoneBody(props: {
  readonly id: string;
  readonly entry: LinearMilestoneEntry | undefined;
  readonly threadRef: ScopedThreadRef;
  readonly onOpen: (identifier: string) => void;
}) {
  const { entry } = props;
  const navigate = useNavigate();
  if (entry?.milestone) {
    return (
      <LinearMilestoneView
        milestone={entry.milestone}
        threadRef={props.threadRef}
        onOpen={props.onOpen}
        error={entry.error?.message ?? null}
      />
    );
  }
  if (entry?.error) {
    const needsKey = entry.error.kind === "no-key" || entry.error.kind === "unauthorized";
    return (
      <LinearNotice title={needsKey ? "Linear needs an API key" : "Couldn't load this milestone"}>
        {needsKey
          ? `${entry.error.message} Add a read-only key in Settings → Diffs → Linear.`
          : entry.error.message}
        <div className="flex gap-2">
          {needsKey ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => void navigate({ to: "/settings/diffs" })}
            >
              Open Settings
            </Button>
          ) : null}
          <Button size="sm" variant="outline" onClick={() => void fetchLinearMilestone(props.id)}>
            Try again
          </Button>
        </div>
      </LinearNotice>
    );
  }
  if (entry?.milestone === null) {
    return (
      <LinearNotice title="This milestone wasn't found">
        The API key can't see it, or it was deleted.
      </LinearNotice>
    );
  }
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading milestone">
      <Skeleton className="h-7 w-1/2" />
      <Skeleton className="h-6 w-1/3" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

/** A milestone's issues as plain rows, like Linear's issue list filtered to the milestone. */
function LinearMilestoneView(props: {
  readonly milestone: LinearMilestone;
  readonly threadRef: ScopedThreadRef;
  readonly onOpen: (identifier: string) => void;
  readonly error: string | null;
}) {
  const { milestone } = props;
  const now = new Date(`${useNowMinute()}Z`);
  const target = milestone.targetDate ? dueDateLabel(milestone.targetDate, now) : null;
  const estimationTypes = new Map(
    milestone.issues.nodes.map((issue) => [issue.identifier, issue.team.issueEstimationType]),
  );
  return (
    <article className="flex flex-col">
      {props.error ? (
        <p className="mb-3 text-xs text-muted-foreground">Showing the last copy: {props.error}</p>
      ) : null}
      <h1 className="flex min-w-0 items-center gap-2 text-xl font-semibold text-balance select-text">
        <Diamond aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        {milestone.name}
      </h1>
      <div className="mt-3 flex flex-wrap gap-1" aria-label="Properties">
        <LinkChip
          url={milestone.project.url}
          label={`Open project ${milestone.project.name} in Linear`}
          threadRef={props.threadRef}
        >
          <Box className="size-3.5 shrink-0" style={{ color: milestone.project.color }} />
          <span className="truncate">{milestone.project.name}</span>
        </LinkChip>
        {target ? (
          <Chip className={cn(target.overdue && "text-destructive")}>
            <Calendar className="size-3.5 shrink-0" />
            {target.label}
          </Chip>
        ) : null}
      </div>
      <section className="mt-7 flex flex-col gap-1" aria-label="Issues">
        <div className="flex items-center gap-1.5 px-1 py-0.5 text-sm text-muted-foreground">
          Issues
          <ProgressPill progress={subIssueProgress(milestone.issues.nodes)} bare />
        </div>
        {milestone.issues.nodes.length > 0 ? (
          <SubIssueList
            rows={subIssueRows(milestone.issues.nodes)}
            estimationType={(issue) => estimationTypes.get(issue.identifier) ?? "notUsed"}
            onOpen={props.onOpen}
            milestoneId={milestone.id}
          />
        ) : (
          <p className="px-1 text-sm text-muted-foreground">No issues</p>
        )}
      </section>
    </article>
  );
}

function LinearNotice(props: { readonly title: string; readonly children: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-3 text-sm">
      <h2 className="text-base font-medium">{props.title}</h2>
      <div className="flex flex-col items-start gap-3 text-muted-foreground">{props.children}</div>
    </div>
  );
}

function LinearIssueView(props: {
  readonly issue: LinearIssue;
  readonly threadRef: ScopedThreadRef;
  readonly environmentId: EnvironmentId;
  readonly onOpen: (identifier: string) => void;
  readonly error: string | null;
}) {
  const { issue } = props;
  const view = useLinearIssueView(issue.identifier);
  const markdown = (text: string) => (
    <LinearMarkdown text={text} threadRef={props.threadRef} environmentId={props.environmentId} />
  );
  return (
    <LinearStateFractionsContext value={startedStateFractions(issue.team.states.nodes)}>
      <article className="flex flex-col">
        {props.error ? (
          <p className="mb-3 text-xs text-muted-foreground">Showing the last copy: {props.error}</p>
        ) : null}
        <div className="flex items-start gap-1">
          <h1 className="min-w-0 text-xl font-semibold text-balance select-text">{issue.title}</h1>
          <span className="mt-0.5 shrink-0">
            <OpenInLinearButton url={issue.url} threadRef={props.threadRef} />
          </span>
        </div>
        {issue.parent ? (
          <div className="mt-1.5 flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
            <span className="shrink-0">Sub-issue of</span>
            <button
              type="button"
              className="flex min-w-0 items-center gap-1.5 rounded px-1 hover:bg-accent"
              onClick={() => props.onOpen(issue.parent!.identifier)}
            >
              <LinearStatusIcon state={issue.parent.state} />
              <span className="shrink-0">{issue.parent.identifier}</span>
              <span className="truncate font-medium text-foreground">{issue.parent.title}</span>
            </button>
            <ProgressPill progress={subIssueProgress(issue.parent.children.nodes)} />
          </div>
        ) : null}
        <LinearProperties issue={issue} threadRef={props.threadRef} onOpen={props.onOpen} />
        <LinearDescription
          open={view.isOpen("description")}
          onToggle={() => view.toggle("description")}
        >
          {issue.description?.trim() ? (
            markdown(issue.description)
          ) : (
            <p className="text-muted-foreground">No description</p>
          )}
        </LinearDescription>
        {issue.children.nodes.length > 0 ? (
          <LinearSubIssues
            issue={issue}
            onOpen={props.onOpen}
            open={view.isOpen("sub-issues")}
            onToggle={() => view.toggle("sub-issues")}
          />
        ) : null}
        {issue.attachments.nodes.length > 0 ? (
          <LinearResources
            issue={issue}
            threadRef={props.threadRef}
            environmentId={props.environmentId}
            open={view.isOpen("resources")}
            onToggle={() => view.toggle("resources")}
          />
        ) : null}
        <LinearActivity
          issue={issue}
          markdown={markdown}
          newestFirst={view.newestFirst}
          onToggleOrder={view.toggleOrder}
        />
      </article>
    </LinearStateFractionsContext>
  );
}

const CHIP =
  "inline-flex h-5 max-w-full items-center gap-1 rounded-full border border-border px-1.5 text-xs";

// Sub-issue rows use tighter pills, 2px apart.
const ROW_CHIP =
  "inline-flex h-5 max-w-full shrink-0 items-center gap-0.5 rounded-full border border-border px-1 text-xs";

// Only labels shrink, squishing before they clip; counts, cycles, and estimates stay readable.
const ROW_LABEL_CHIP = cn(ROW_CHIP, "min-w-0 shrink");

// Below @md a row keeps only its estimate chip.
const WIDE_ROW_ONLY = "hidden @md:inline-flex";

/** A label chip's text squishes in a row; elsewhere it stays plain text. */
function ChipText(props: { readonly children: string; readonly squish?: boolean | undefined }) {
  return props.squish ? (
    <SquishText minScale={SQUISH_TEXT_TIGHT_MIN_SCALE}>{props.children}</SquishText>
  ) : (
    props.children
  );
}

function Chip(props: {
  readonly children: ReactNode;
  readonly className?: string;
  /** In a sub-issue row: a `label` chip squishes, a `value` chip keeps its size. */
  readonly row?: "label" | "value";
}) {
  const chip = props.row === "label" ? ROW_LABEL_CHIP : props.row === "value" ? ROW_CHIP : CHIP;
  return <span className={cn(chip, props.className)}>{props.children}</span>;
}

/** A chip that opens its page in Linear, marked by the open icon at its end. */
function LinkChip(props: {
  readonly url: string | null;
  readonly label: string;
  readonly threadRef: ScopedThreadRef;
  readonly children: ReactNode;
}) {
  const openLink = useOpenLink(props.threadRef);
  const { url } = props;
  if (!url) return <Chip>{props.children}</Chip>;
  return (
    <button
      type="button"
      aria-label={props.label}
      className={cn(CHIP, "hover:bg-accent")}
      onClick={(event) => void openLink(url, { event })}
    >
      {props.children}
      <ExternalLink aria-hidden="true" className="size-3 shrink-0 text-muted-foreground" />
    </button>
  );
}

function LinearProperties(props: {
  readonly issue: LinearIssue;
  readonly threadRef: ScopedThreadRef;
  readonly onOpen: (id: string) => void;
}) {
  const { issue } = props;
  const now = new Date(`${useNowMinute()}Z`);
  const due = issue.dueDate ? dueDateLabel(issue.dueDate, now) : null;
  const estimate = estimateLabel(issue.estimate, issue.team.issueEstimationType);
  return (
    <div className="mt-3 flex flex-wrap gap-1" aria-label="Properties">
      <Chip>
        <LinearStatusIcon state={issue.state} />
        {issue.state.name}
      </Chip>
      {issue.priority > 0 ? (
        <Chip>
          <LinearPriorityIcon priority={issue.priority} />
          {issue.priorityLabel}
        </Chip>
      ) : null}
      {issue.assignee ? (
        <Chip>
          <LinearAvatar user={issue.assignee} className="size-3.5" />
          <span className="truncate">{issue.assignee.displayName}</span>
        </Chip>
      ) : null}
      {estimate ? (
        <Chip>
          <LinearEstimateIcon />
          {estimate}
        </Chip>
      ) : null}
      {issue.project ? (
        <LinkChip
          url={issue.project.url}
          label={`Open project ${issue.project.name} in Linear`}
          threadRef={props.threadRef}
        >
          <Box className="size-3.5 shrink-0" style={{ color: issue.project.color }} />
          <span className="truncate">{issue.project.name}</span>
        </LinkChip>
      ) : null}
      {issue.projectMilestone ? (
        <button
          type="button"
          aria-label={`Show milestone ${issue.projectMilestone.name}`}
          className={cn(CHIP, "hover:bg-accent")}
          onClick={() => props.onOpen(linearMilestoneEntry(issue.projectMilestone!.id))}
        >
          <Diamond aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">{issue.projectMilestone.name}</span>
        </button>
      ) : null}
      {issue.labels.nodes.map((label) => (
        <Chip key={label.name}>
          <LinearColorDot color={label.color} />
          <span className="truncate">{label.name}</span>
        </Chip>
      ))}
      {issue.cycle ? (
        <LinkChip
          url={linearCycleUrl(issue.url, issue.team.key, issue.cycle.number)}
          label={`Open ${cycleLabel(issue.cycle, now)} in Linear`}
          threadRef={props.threadRef}
        >
          <CirclePlay className="size-3.5 shrink-0 text-muted-foreground" />
          {cycleLabel(issue.cycle, now)}
        </LinkChip>
      ) : null}
      {due ? (
        <Chip className={cn(due.overdue && "text-destructive")}>
          <Calendar className="size-3.5 shrink-0" />
          {due.label}
        </Chip>
      ) : null}
      {relationGroups(issue).map((group) => (
        <RelationChip key={group.kind} group={group} onOpen={props.onOpen} />
      ))}
    </div>
  );
}

function RelationIcon(props: { readonly kind: LinearRelationGroup["kind"] }) {
  if (props.kind === "blocked-by") return <LinearBlockedIcon />;
  if (props.kind === "blocking") return <LinearBlockingIcon />;
  return <Link2 aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />;
}

/**
 * Like Linear: one linked issue opens directly; several open a list to choose from. `compact`
 * shows only the count, for sub-issue rows.
 */
function RelationChip(props: {
  readonly group: LinearRelationGroup;
  readonly onOpen: (id: string) => void;
  readonly compact?: boolean;
}) {
  const { group } = props;
  const label = <>{props.compact ? String(group.issues.length) : group.label}</>;
  const chip = props.compact ? ROW_CHIP : cn(CHIP, "shrink-0");
  const only = group.issues.length === 1 ? group.issues[0] : undefined;
  if (only) {
    return (
      <button
        type="button"
        aria-label={`${group.heading} ${only.identifier} ${only.title}`}
        className={cn(chip, "hover:bg-accent")}
        onClick={() => props.onOpen(only.identifier)}
      >
        <RelationIcon kind={group.kind} />
        {label}
      </button>
    );
  }
  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label={`${group.heading}: ${group.issues.length} issues`}
            className={cn(chip, "hover:bg-accent")}
          />
        }
      >
        <RelationIcon kind={group.kind} />
        {label}
      </PopoverTrigger>
      <PopoverPopup side="bottom" align="start" width="md" padding="compact">
        <div className="px-1 pb-1 text-xs text-muted-foreground">{group.heading}</div>
        {group.issues.map((related) => (
          <IssueRefButton key={related.identifier} issue={related} onOpen={props.onOpen} />
        ))}
      </PopoverPopup>
    </Popover>
  );
}

function IssueRefButton(props: {
  readonly issue: LinearRelatedIssue;
  readonly onOpen: (id: string) => void;
}) {
  return (
    <button
      type="button"
      className="flex w-full min-w-0 items-center gap-2 rounded-md px-1 py-1.5 text-start text-sm hover:bg-accent"
      onClick={() => props.onOpen(props.issue.identifier)}
    >
      <LinearStatusIcon state={props.issue.state} />
      <span className="shrink-0 text-muted-foreground">{props.issue.identifier}</span>
      <span className="min-w-0 flex-1 truncate">{props.issue.title}</span>
      {props.issue.priority > 0 ? <LinearPriorityIcon priority={props.issue.priority} /> : null}
      <LinearAvatar user={props.issue.assignee} />
    </button>
  );
}

/** Done over total with Linear's ring; `bare` drops the pill, as the section heading does. */
function ProgressPill(props: {
  readonly progress: { done: number; total: number };
  readonly bare?: boolean;
  readonly row?: boolean;
  readonly className?: string;
}) {
  return (
    <span
      className={cn(
        props.bare ? "inline-flex items-center gap-1.5 text-xs" : props.row ? ROW_CHIP : CHIP,
        "shrink-0",
        "text-muted-foreground tabular-nums",
        props.className,
      )}
    >
      <LinearProgressRing done={props.progress.done} total={props.progress.total} />
      {`${props.progress.done}/${props.progress.total}`}
    </span>
  );
}

function SectionHeader(props: {
  readonly title: string;
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly children?: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-expanded={props.open}
      className="flex items-center gap-1.5 self-start rounded px-1 py-0.5 text-sm text-muted-foreground hover:text-foreground"
      onClick={props.onToggle}
    >
      <ChevronDown className={cn("size-3.5 transition-transform", !props.open && "-rotate-90")} />
      {props.title}
      {props.children}
    </button>
  );
}

function LinearDescription(props: {
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly children: ReactNode;
}) {
  return (
    <section className="mt-5 flex flex-col gap-1 text-sm" aria-label="Description">
      <SectionHeader title="Description" open={props.open} onToggle={props.onToggle} />
      {props.open ? props.children : null}
    </section>
  );
}

const ROW_INSET_REM = 0.25;
const INDENT_REM = 1.25;
/** Guide columns sit just inside the parent's first glyph, as Linear draws them. */
const guideX = (level: number) => `${ROW_INSET_REM + (level - 1) * INDENT_REM + 0.5}rem`;

/**
 * Linear's tree lines: each parent's line runs down past all of its sub-issues with a rounded
 * elbow into each one, ending at the last; ancestors' lines pass through deeper rows.
 */
function TreeGuides(props: { readonly row: LinearSubIssueRow; readonly hasChildren: boolean }) {
  const { row } = props;
  const line = "pointer-events-none absolute w-px bg-border";
  return (
    <span aria-hidden="true">
      {row.guides
        .flatMap((continues, index) => (continues ? [index + 1] : []))
        .map((level) => (
          <span key={level} className={cn(line, "inset-y-0")} style={{ left: guideX(level) }} />
        ))}
      {row.depth > 0 ? (
        <>
          <span
            className="pointer-events-none absolute top-0 h-1/2 rounded-es-md border-s border-b border-border"
            style={{
              left: guideX(row.depth),
              width: `calc(${ROW_INSET_REM + row.depth * INDENT_REM - 0.25}rem - ${guideX(row.depth)})`,
            }}
          />
          {row.isLast ? null : (
            // Full height, so the line stays unbroken where the rounded elbow curves away.
            <span className={cn(line, "inset-y-0")} style={{ left: guideX(row.depth) }} />
          )}
        </>
      ) : null}
      {props.hasChildren ? (
        <span className={cn(line, "top-3/4 bottom-0")} style={{ left: guideX(row.depth + 1) }} />
      ) : null}
    </span>
  );
}

function LinearSubIssues(props: {
  readonly issue: LinearIssue;
  readonly onOpen: (id: string) => void;
  readonly open: boolean;
  readonly onToggle: () => void;
}) {
  return (
    <section className="mt-7 flex flex-col gap-1" aria-label="Sub-issues">
      <SectionHeader title="Sub-issues" open={props.open} onToggle={props.onToggle}>
        <ProgressPill progress={subIssueProgress(props.issue.children.nodes)} bare />
      </SectionHeader>
      {props.open ? (
        <SubIssueList
          rows={subIssueRows(props.issue.children.nodes)}
          estimationType={() => props.issue.team.issueEstimationType}
          onOpen={props.onOpen}
        />
      ) : null}
    </section>
  );
}

/** Issue rows with their chips, for an issue's sub-issues and a milestone's issues. */
function SubIssueList(props: {
  readonly rows: readonly LinearSubIssueRow[];
  readonly estimationType: (issue: LinearSubIssue) => string;
  readonly onOpen: (id: string) => void;
  /** The milestone page's own milestone, which its rows don't repeat as a chip. */
  readonly milestoneId?: string;
}) {
  const { rows } = props;
  // The ID column fits the longest key here (up to w-14), so short keys sit close to their status.
  const idWidth = `min(3.5rem, ${Math.max(0, ...rows.map((row) => row.issue.identifier.length))}ch)`;
  return (
    <ul className="flex flex-col">
      {rows.map((row, index) => {
        const rowEstimate = estimateLabel(
          row.issue.estimate,
          props.estimationType(row.issue),
          true,
        );
        return (
          <li key={row.issue.identifier} className="relative">
            <TreeGuides row={row} hasChildren={rows[index + 1]?.depth === row.depth + 1} />
            <div className="flex h-8 min-w-0 items-center gap-1 rounded-md pe-1 text-sm hover:bg-accent">
              <button
                type="button"
                className="flex h-full min-w-0 flex-1 items-center gap-2 text-start"
                style={{ paddingInlineStart: `${ROW_INSET_REM + row.depth * INDENT_REM}rem` }}
                onClick={() => props.onOpen(row.issue.identifier)}
              >
                <SquishText
                  className="hidden shrink-0 text-muted-foreground tabular-nums @sm:inline-grid"
                  style={{ width: idWidth }}
                >
                  {row.issue.identifier}
                </SquishText>
                <LinearStatusIcon state={row.issue.state} />
                <SquishText ellipsisScale={SQUISH_TEXT_MIN_SCALE} className="min-w-0 flex-1">
                  {row.issue.title}
                </SquishText>
                <span className="flex min-w-0 shrink items-center gap-0.5">
                  {row.progress ? (
                    <ProgressPill progress={row.progress} row className={WIDE_ROW_ONLY} />
                  ) : null}
                  {row.issue.labels.nodes.map((label) => (
                    <Chip key={label.name} row="label" className={WIDE_ROW_ONLY}>
                      <LinearColorDot color={label.color} />
                      <ChipText squish>{label.name}</ChipText>
                    </Chip>
                  ))}
                  {row.issue.projectMilestone &&
                  row.issue.projectMilestone.id !== props.milestoneId ? (
                    <Chip row="label" className={WIDE_ROW_ONLY}>
                      <Diamond
                        aria-hidden="true"
                        className="size-3.5 shrink-0 text-muted-foreground"
                      />
                      <ChipText squish>{row.issue.projectMilestone.name}</ChipText>
                    </Chip>
                  ) : null}
                  {row.issue.cycle ? (
                    <Chip row="value" className={WIDE_ROW_ONLY}>
                      <CirclePlay className="size-3.5 shrink-0 text-muted-foreground" />
                      {String(row.issue.cycle.number)}
                    </Chip>
                  ) : null}
                  {rowEstimate ? (
                    <Chip row="value">
                      <LinearEstimateIcon />
                      {rowEstimate}
                    </Chip>
                  ) : null}
                </span>
              </button>
              {row.blocks.map((group) => (
                <RelationChip key={group.kind} group={group} onOpen={props.onOpen} compact />
              ))}
              <LinearAvatar user={row.issue.assignee} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** `[title](<url>)` with the title's link syntax escaped, for the shared markdown link renderer. */
const markdownLink = (title: string, url: string) =>
  `[${title.replace(/[\\[\]]/g, "\\$&")}](<${url.replace(/[<>]/g, encodeURIComponent)}>)`;

/** Each resource uses the same link rendering as markdown: favicon chip, menu, and previews. */
function LinearResources(props: {
  readonly issue: LinearIssue;
  readonly threadRef: ScopedThreadRef;
  readonly environmentId: EnvironmentId;
  readonly open: boolean;
  readonly onToggle: () => void;
}) {
  return (
    <section className="mt-6 flex flex-col gap-1" aria-label="Resources">
      <SectionHeader title="Resources" open={props.open} onToggle={props.onToggle} />
      {props.open ? (
        <ul className="flex flex-col">
          {props.issue.attachments.nodes.map((attachment) => (
            <li key={attachment.id} className="flex h-8 min-w-0 items-center gap-2 px-1 text-sm">
              <span className="min-w-0 shrink truncate font-medium">
                <ChatMarkdown
                  inline
                  text={markdownLink(attachment.title, attachment.url)}
                  cwd={undefined}
                  threadRef={props.threadRef}
                  environmentId={props.environmentId}
                />
              </span>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">
                {attachment.subtitle}
              </span>
              <RelativeTime iso={attachment.createdAt} />
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function RelativeTime(props: { readonly iso: string }) {
  const now = new Date(`${useNowMinute()}Z`);
  const label = linearRelativeTime(props.iso, now);
  if (!label) return null;
  return (
    <Tooltip>
      <TooltipTrigger
        render={<time dateTime={props.iso} className="shrink-0 text-xs text-muted-foreground" />}
      >
        {label}
      </TooltipTrigger>
      <TooltipPopup side="top">{new Date(props.iso).toLocaleString()}</TooltipPopup>
    </Tooltip>
  );
}

function LinearActivity(props: {
  readonly issue: LinearIssue;
  readonly markdown: (text: string) => ReactNode;
  readonly newestFirst: boolean;
  readonly onToggleOrder: () => void;
}) {
  const oldestFirst = activityItems(props.issue);
  const items = props.newestFirst ? oldestFirst.toReversed() : oldestFirst;
  return (
    <section className="mt-8 flex flex-col gap-3 border-t border-border pt-5" aria-label="Activity">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">Activity</h2>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size="xs"
                variant="ghost-muted"
                aria-label={
                  props.newestFirst
                    ? "Newest first: show oldest first"
                    : "Oldest first: show newest first"
                }
                onClick={props.onToggleOrder}
              />
            }
          >
            {props.newestFirst ? <ArrowUpNarrowWide /> : <ArrowDownNarrowWide />}
            {props.newestFirst ? "Newest first" : "Oldest first"}
          </TooltipTrigger>
          <TooltipPopup side="bottom">
            {props.newestFirst ? "Show oldest first" : "Show newest first"}
          </TooltipPopup>
        </Tooltip>
      </div>
      <ol className="flex flex-col gap-3">
        {items.map((item, index) => (
          <li key={item.id} className="relative">
            {item.kind === "event" && items[index + 1]?.kind === "event" ? (
              // Linear's timeline: a line joins the glyphs of consecutive history lines.
              <span
                aria-hidden="true"
                className="pointer-events-none absolute w-px bg-border"
                style={{ left: "calc(0.5rem - 0.5px)", top: "1.25rem", bottom: "-0.5rem" }}
              />
            ) : null}
            <ActivityItem item={item} markdown={props.markdown} />
          </li>
        ))}
      </ol>
    </section>
  );
}

function ActivityItem(props: {
  readonly item: LinearActivityItem;
  readonly markdown: (text: string) => ReactNode;
}) {
  const { item } = props;
  if (item.kind === "event") {
    return (
      <div className="flex min-w-0 items-start gap-2 text-xs/4 text-muted-foreground">
        <span className="flex size-4 shrink-0 items-center justify-center">
          {item.icon.kind !== "created" ? (
            <ActivityGlyph icon={item.icon} />
          ) : item.byLinear ? (
            <LinearLogo />
          ) : (
            <LinearAvatar user={item.actor ?? { displayName: item.actorName, avatarUrl: null }} />
          )}
        </span>
        <span className="min-w-0">
          <span className="text-foreground/80">{item.actorName}</span> {item.text}
        </span>
        <span aria-hidden="true">·</span>
        <RelativeTime iso={item.at} />
      </div>
    );
  }
  return <CommentThread thread={item.thread} markdown={props.markdown} />;
}

const GLYPH = "size-3.5 shrink-0 text-muted-foreground";

function ActivityGlyph(props: { readonly icon: Exclude<LinearActivityIcon, { kind: "created" }> }) {
  const { icon } = props;
  switch (icon.kind) {
    case "status":
      return <LinearStatusIcon state={icon.state} />;
    case "priority":
      return <LinearPriorityIcon priority={icon.priority} />;
    case "relation":
      return icon.relation === "duplicate-of" || icon.relation === "duplicated-by" ? (
        <Copy aria-hidden="true" className={GLYPH} />
      ) : (
        <RelationIcon kind={icon.relation} />
      );
    case "assignee":
      return <CircleUserRound aria-hidden="true" className={GLYPH} />;
    case "label":
      return <Tag aria-hidden="true" className={GLYPH} />;
    case "cycle":
      return <CirclePlay aria-hidden="true" className={GLYPH} />;
    case "parent":
      return <ListTree aria-hidden="true" className={GLYPH} />;
  }
}

function CommentThread(props: {
  readonly thread: LinearCommentThread;
  readonly markdown: (text: string) => ReactNode;
}) {
  return (
    <div className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card">
      <CommentBody comment={props.thread.root} markdown={props.markdown} />
      {props.thread.replies.map((reply) => (
        <CommentBody key={reply.id} comment={reply} markdown={props.markdown} />
      ))}
    </div>
  );
}

function CommentBody(props: {
  readonly comment: LinearComment;
  readonly markdown: (text: string) => ReactNode;
}) {
  const author = commentAuthor(props.comment);
  return (
    <div className="flex flex-col gap-1.5 px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-2 text-xs">
        <LinearAvatar user={props.comment.user ?? { displayName: author.name, avatarUrl: null }} />
        <span className="font-medium">{author.name}</span>
        {author.via ? <span className="text-muted-foreground">via {author.via}</span> : null}
        <RelativeTime iso={props.comment.createdAt} />
      </div>
      <div className="text-sm">{props.markdown(props.comment.body)}</div>
    </div>
  );
}
