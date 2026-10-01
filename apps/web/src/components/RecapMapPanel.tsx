/**
 * Resume map right-panel surface, read like a quest map: the thread's steps
 * in one column in dependency order, with arrows in a narrow left gutter from
 * each prerequisite to the step it unlocks. Layout lives in
 * `recapMapLayout.logic`. Status always reads from a shape and a word, never
 * color alone; green marks only the current step and amber only blocked or
 * waiting ones. Everything is static: no pulses or spinners, since the
 * summary only changes between turns.
 */
import type {
  ScopedThreadRef,
  ThreadRecap,
  ThreadRecapLink,
  ThreadRecapStep,
} from "@t3tools/contracts";
import { Check, Hourglass, Lock, Map as MapIcon, MapPin, RefreshCw, Signpost } from "lucide-react";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";

import { useAtomValue } from "@effect/atom-react";
import { Atom } from "effect/unstable/reactivity";

import { scopedThreadKey } from "@t3tools/client-runtime/environment";

import { useOpenLink } from "~/browser/useOpenLink";
import { useRecapRefreshStore, useRefreshThreadRecap } from "~/hooks/useThreadRecap";
import { useNowMinute } from "~/hooks/useNowMinute";
import { cn } from "~/lib/utils";
import { formatRelativeTimeLabel } from "~/timestampFormat";
import { Button } from "~/components/ui/button";
import { ScrollArea } from "~/components/ui/scroll-area";
import { toastManager } from "~/components/ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { MarkdownLinkFavicon } from "./ChatMarkdown";
import { ProjectBranchLine } from "./ProjectBranchLine";
import type { ProjectFaviconProject } from "./ProjectFavicon";
import { resolveExternalWebLinkHost } from "./chat/externalLinkContextMenu";
import {
  layoutRecapPath,
  type RecapGutterCell,
  type RecapPathRow,
} from "./chat/recapMapLayout.logic";
import {
  isLinearWorkspaceSlug,
  isRecapRefreshPending,
  latestLinearWorkspace,
  RECAP_REFRESH_TIMEOUT_MS,
  linearIssueUrl,
  safeRecapLinkUrl,
} from "./chat/threadResume.logic";
import { environmentThreadShells } from "~/state/threads";

/**
 * Fallback Linear workspace from any thread's recap, for summaries written
 * before workspace detection. The atom's value is a string, so the map only
 * re-renders when the workspace itself changes, not on every shell update.
 */
const latestLinearWorkspaceAtom = Atom.make((get) =>
  latestLinearWorkspace(
    get(environmentThreadShells.threadShellsAtom).map((shell) => shell.recap?.summary),
  ),
).pipe(Atom.withLabel("recap-map:latest-linear-workspace"));

const EMPTY_STEPS: ReadonlyArray<ThreadRecapStep> = [];
const EMPTY_CELL: RecapGutterCell = {
  through: [],
  arrivals: [],
  down: false,
};

const LANE_WIDTH = 16;
const laneX = (lane: number) => LANE_WIDTH / 2 + lane * LANE_WIDTH;
// Vertical center of a row's first text line; the row paddings below are sized to match.
const MARKER_Y = 17.5;
const NOW_MARKER_Y = 22;
/** Clearance around a marker, where arrowheads stop. */
const MARKER_RADIUS = 6;
const ARROW_LENGTH = 5;
const ARROW_HALF_WIDTH = 3.25;
const CORNER_RADIUS = 5;
const LINE_CLASS = "stroke-muted-foreground/60";
const ARROW_CLASS = "fill-muted-foreground";

type ArrowDirection = "down" | "left" | "right";

function Arrowhead({ x, y, direction }: { x: number; y: number; direction: ArrowDirection }) {
  const points =
    direction === "down"
      ? `${x - ARROW_HALF_WIDTH},${y - ARROW_LENGTH} ${x + ARROW_HALF_WIDTH},${y - ARROW_LENGTH} ${x},${y}`
      : direction === "right"
        ? `${x - ARROW_LENGTH},${y - ARROW_HALF_WIDTH} ${x - ARROW_LENGTH},${y + ARROW_HALF_WIDTH} ${x},${y}`
        : `${x + ARROW_LENGTH},${y - ARROW_HALF_WIDTH} ${x + ARROW_LENGTH},${y + ARROW_HALF_WIDTH} ${x},${y}`;
  return <polygon points={points} className={ARROW_CLASS} />;
}

/** An arrow from the top of `fromLane` that turns into the marker from the side. */
function SideArrow({
  from,
  to,
  markerY,
  dashed = false,
}: {
  from: number;
  to: number;
  markerY: number;
  dashed?: boolean;
}) {
  const direction = to > from ? 1 : -1;
  const tipX = to - direction * MARKER_RADIUS;
  return (
    <>
      <path
        d={`M ${from} 0 V ${markerY - CORNER_RADIUS} Q ${from} ${markerY} ${from + direction * CORNER_RADIUS} ${markerY} H ${tipX - direction * ARROW_LENGTH}`}
        strokeDasharray={dashed ? "3 3" : undefined}
        className={LINE_CLASS}
      />
      <Arrowhead x={tipX} y={markerY} direction={direction > 0 ? "right" : "left"} />
    </>
  );
}

function MarkerShape({ row, x, y }: { row: RecapPathRow; x: number; y: number }) {
  switch (row.kind) {
    case "now":
      return <circle cx={x} cy={y} r={5.5} className="fill-success" />;
    case "side-quest":
    case "ready":
      return (
        <circle
          cx={x}
          cy={y}
          r={4.5}
          strokeWidth={1.75}
          className="fill-background stroke-muted-foreground"
        />
      );
    case "locked": {
      // A padlock: shackle over a body. Amber only when the step reports itself blocked.
      const tone = row.marker === "blocked" ? "warning" : "muted-foreground";
      return (
        <>
          <path
            d={`M ${x - 2.5} ${y - 1} V ${y - 3} A 2.5 2.5 0 0 1 ${x + 2.5} ${y - 3} V ${y - 1}`}
            strokeWidth={1.5}
            className={tone === "warning" ? "stroke-warning" : "stroke-muted-foreground"}
          />
          <rect
            x={x - 4}
            y={y - 1}
            width={8}
            height={6}
            rx={1.25}
            className={tone === "warning" ? "fill-warning" : "fill-muted-foreground"}
          />
        </>
      );
    }
    case "waiting":
      // An hourglass: the self-crossing outline fills as two triangles.
      return (
        <path
          d={`M ${x - 4} ${y - 5} H ${x + 4} L ${x - 4} ${y + 5} H ${x + 4} Z`}
          className="fill-warning"
        />
      );
    case "unknown":
      return (
        <circle
          cx={x}
          cy={y}
          r={4.5}
          strokeWidth={1.25}
          strokeDasharray="2 2"
          className="fill-background stroke-muted-foreground"
        />
      );
  }
}

/** One row's slice of the gutter. Lines run to "100%" so the row can grow with its label. */
function GutterCell({
  row,
  cell,
  laneCount,
  markerY,
}: {
  row: RecapPathRow;
  cell: RecapGutterCell;
  laneCount: number;
  markerY: number;
}) {
  const x = laneX(row.lane);
  const arrowTipY = markerY - MARKER_RADIUS;
  return (
    <div
      aria-hidden
      className="relative shrink-0 self-stretch"
      style={{ width: laneCount * LANE_WIDTH }}
    >
      <svg className="absolute inset-0 size-full overflow-visible" fill="none" strokeWidth={1.75}>
        {cell.through.map((through) => (
          <line
            key={`through-${through}`}
            x1={laneX(through)}
            x2={laneX(through)}
            y1={0}
            y2="100%"
            className={LINE_CLASS}
          />
        ))}
        {cell.arrivals.map((arrival) => {
          const from = laneX(arrival.lane);
          if (arrival.continues) {
            // Branch off a line that keeps going down.
            const direction = x > from ? 1 : -1;
            const tipX = x - direction * MARKER_RADIUS;
            return (
              <g key={`arrival-${arrival.lane}`}>
                <line
                  x1={from}
                  x2={tipX - direction * ARROW_LENGTH}
                  y1={markerY}
                  y2={markerY}
                  className={LINE_CLASS}
                />
                <Arrowhead x={tipX} y={markerY} direction={direction > 0 ? "right" : "left"} />
              </g>
            );
          }
          if (arrival.lane === row.lane) {
            return (
              <g key={`arrival-${arrival.lane}`}>
                <line x1={x} x2={x} y1={0} y2={arrowTipY - ARROW_LENGTH} className={LINE_CLASS} />
                <Arrowhead x={x} y={arrowTipY} direction="down" />
              </g>
            );
          }
          return <SideArrow key={`arrival-${arrival.lane}`} from={from} to={x} markerY={markerY} />;
        })}
        {cell.down ? (
          <line x1={x} x2={x} y1={markerY + MARKER_RADIUS} y2="100%" className={LINE_CLASS} />
        ) : null}
        <MarkerShape row={row} x={x} y={markerY} />
      </svg>
    </div>
  );
}

type OpenRecapLink = (url: string, event: ReactMouseEvent) => void;

function RowTag({ row }: { row: RecapPathRow }) {
  switch (row.kind) {
    case "now":
      return (
        <span className="inline-flex items-center gap-1 font-semibold text-success-foreground">
          <MapPin aria-hidden className="size-3" />
          You are here
        </span>
      );
    case "side-quest":
      return <span className="text-foreground/80">side quest · can start now</span>;
    case "ready":
      return <span className="text-foreground/80">can start now</span>;
    case "locked":
      return (
        <span
          className={cn(
            "inline-flex items-center gap-1",
            row.marker === "blocked" ? "text-warning-foreground" : "text-muted-foreground",
          )}
        >
          <Lock aria-hidden className="size-3" />
          unlocks after {row.after.join(", ")}
        </span>
      );
    case "waiting":
      return (
        <span className="inline-flex items-center gap-1 text-warning-foreground">
          <Hourglass aria-hidden className="size-3" />
          waiting
        </span>
      );
    case "unknown":
      return <span className="text-muted-foreground">? unknown</span>;
  }
}

function LinearChip({
  issueId,
  workspace,
  onOpenLink,
  size,
}: {
  issueId: string;
  workspace: string | null;
  onOpenLink: OpenRecapLink;
  size: "row" | "header";
}) {
  const url = linearIssueUrl(workspace, issueId);
  const className = cn(
    "inline-flex shrink-0 items-center rounded border border-border font-mono text-muted-foreground",
    size === "row" ? "px-1 text-[10px] leading-4" : "rounded-md px-1.5 py-0.5 text-[11px]",
  );
  if (url === null) return <span className={className}>{issueId}</span>;
  const host = resolveExternalWebLinkHost(url);
  return (
    <button
      type="button"
      aria-label={`Open ${issueId} in Linear`}
      onClick={(event) => onOpenLink(url, event)}
      className={cn(
        className,
        "cursor-pointer hover:bg-accent hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      {host ? <MarkdownLinkFavicon host={host} /> : null}
      {issueId}
    </button>
  );
}

function StepBadges({
  step,
  workspace,
  onOpenLink,
}: {
  step: ThreadRecapStep;
  workspace: string | null;
  onOpenLink: OpenRecapLink;
}) {
  return (
    <>
      {step.source === "linear" && step.linearIssueId ? (
        <LinearChip
          issueId={step.linearIssueId}
          workspace={workspace}
          onOpenLink={onOpenLink}
          size="row"
        />
      ) : null}
      {step.source === "inferred" ? (
        <span className="shrink-0 rounded border border-dashed border-muted-foreground/50 px-1 text-[10px] leading-4 text-muted-foreground">
          guess
        </span>
      ) : null}
    </>
  );
}

function PathRow({
  row,
  cell,
  laneCount,
  workspace,
  links,
  onOpenLink,
  rowRef,
}: {
  row: RecapPathRow;
  cell: RecapGutterCell;
  laneCount: number;
  workspace: string | null;
  links: ReadonlyArray<ThreadRecapLink>;
  onOpenLink: OpenRecapLink;
  rowRef?: ((element: HTMLLIElement | null) => void) | undefined;
}) {
  const isNow = row.kind === "now";
  const isFog = row.kind === "unknown";
  const url = row.step.url === undefined ? null : safeRecapLinkUrl(row.step.url);
  return (
    <li ref={rowRef} className="flex min-h-9 items-stretch gap-2">
      <GutterCell
        row={row}
        cell={cell}
        laneCount={laneCount}
        markerY={isNow ? NOW_MARKER_Y : MARKER_Y}
      />
      <div
        className={cn(
          "mb-1 flex min-w-0 flex-1 items-start gap-2 rounded-md border px-1.5",
          isNow ? "border-success/60 bg-success/8 py-3" : "border-transparent pt-2.5 pb-1.5",
          isFog && "border-dashed border-muted-foreground/40 bg-muted/40",
          row.step.source === "inferred" && "border-dashed border-muted-foreground/40",
        )}
      >
        <span
          className={cn(
            "w-4 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground",
            isNow ? "leading-5" : "leading-[15px]",
          )}
        >
          {row.number}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {isNow ? (
            // The current step is the one thing the reader must not lose, so it wraps in full.
            <p className="text-sm font-medium leading-5 text-foreground [overflow-wrap:anywhere]">
              {row.step.label}
            </p>
          ) : (
            <Tooltip>
              <TooltipTrigger
                render={
                  <p
                    className={cn(
                      "line-clamp-2 text-xs leading-[15px] [overflow-wrap:anywhere]",
                      isFog ? "text-muted-foreground" : "text-foreground/90",
                    )}
                  />
                }
              >
                {row.step.label}
              </TooltipTrigger>
              <TooltipPopup side="top" className="max-w-72 whitespace-normal">
                {row.step.label}
              </TooltipPopup>
            </Tooltip>
          )}
          <span className="flex flex-wrap items-center gap-1.5 text-[11px] leading-4">
            <RowTag row={row} />
            <StepBadges step={row.step} workspace={workspace} onOpenLink={onOpenLink} />
            {url ? (
              <LinkChip
                label={
                  links.find((link) => safeRecapLinkUrl(link.url) === url)?.label ??
                  resolveExternalWebLinkHost(url) ??
                  "Link"
                }
                url={url}
                size="row"
                onOpenLink={onOpenLink}
              />
            ) : null}
          </span>
        </div>
      </div>
    </li>
  );
}

function HeaderLine({
  icon,
  word,
  wordClass,
  children,
}: {
  icon: ReactNode;
  word: string;
  wordClass: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-start gap-1.5">
      <span className={cn("flex h-5 shrink-0 items-center", wordClass)}>{icon}</span>
      <span className={cn("w-[5.25rem] shrink-0 text-[11px] font-semibold leading-5", wordClass)}>
        {word}
      </span>
      {children}
    </div>
  );
}

function LinkChip({
  label,
  url,
  size,
  onOpenLink,
}: {
  label: string;
  url: string;
  size: "row" | "header";
  onOpenLink: OpenRecapLink;
}) {
  const host = resolveExternalWebLinkHost(url);
  return (
    <button
      type="button"
      onClick={(event) => onOpenLink(url, event)}
      className={cn(
        "inline-flex max-w-full cursor-pointer items-center rounded-md border border-border text-foreground/90 hover:bg-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
        size === "row" ? "px-1 text-[10px] leading-4" : "px-1.5 py-0.5 text-[11px]",
      )}
    >
      {host ? <MarkdownLinkFavicon host={host} /> : null}
      <span className="max-w-48 truncate">{label}</span>
    </button>
  );
}

function LinkChips({
  links,
  onOpenLink,
}: {
  links: ReadonlyArray<ThreadRecapLink>;
  onOpenLink: OpenRecapLink;
}) {
  const openable = links.flatMap((link) => {
    const url = safeRecapLinkUrl(link.url);
    return url === null ? [] : [{ label: link.label, url }];
  });
  if (openable.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {openable.map((link) => (
        <LinkChip
          key={link.url}
          label={link.label}
          url={link.url}
          size="header"
          onOpenLink={onOpenLink}
        />
      ))}
    </div>
  );
}

export const RecapMapPanel = memo(function RecapMapPanel({
  recap,
  threadRef,
  project,
  branch,
  onSetEnabled,
}: {
  recap: ThreadRecap | null;
  threadRef: ScopedThreadRef | null;
  project: ProjectFaviconProject | null;
  branch: string | null;
  /** Absent for drafts, which have no server thread to turn recap on for yet. */
  onSetEnabled: ((enabled: boolean) => void) | null;
}) {
  useNowMinute();
  const steps = recap?.summary?.steps ?? EMPTY_STEPS;
  const summaryNow = recap?.summary?.now ?? null;
  const fallbackLinearWorkspace = useAtomValue(latestLinearWorkspaceAtom);
  const threadKey = threadRef === null ? null : scopedThreadKey(threadRef);
  const currentGeneratedAt = recap?.summary?.generatedAt ?? null;
  const refreshRequest = useRecapRefreshStore((state) =>
    threadKey === null ? undefined : state.byThreadKey[threadKey],
  );
  const refreshThreadRecap = useRefreshThreadRecap();
  // Drop the request once a newer summary lands or the timeout passes, so
  // "Refreshing…" can never stick.
  useEffect(() => {
    if (refreshRequest === undefined || threadKey === null) return;
    const clear = () => useRecapRefreshStore.getState().clear(threadKey);
    const remaining = RECAP_REFRESH_TIMEOUT_MS - (Date.now() - refreshRequest.requestedAtMs);
    if (currentGeneratedAt !== refreshRequest.baselineGeneratedAt || remaining <= 0) {
      clear();
      return;
    }
    const timer = window.setTimeout(clear, remaining);
    return () => window.clearTimeout(timer);
  }, [currentGeneratedAt, refreshRequest, threadKey]);
  // The effect above clears a timed-out request, so render only compares summaries.
  const refreshing = isRecapRefreshPending(
    refreshRequest,
    currentGeneratedAt,
    refreshRequest?.requestedAtMs ?? 0,
  );
  const layout = useMemo(() => layoutRecapPath(steps, summaryNow), [steps, summaryNow]);
  const openLink = useOpenLink(threadRef);
  const openRecapLink = useCallback<OpenRecapLink>(
    (url, event) => {
      void openLink(url, { event }).catch((error: unknown) => {
        console.error(error);
        toastManager.add({ type: "error", title: "Unable to open link" });
      });
    },
    [openLink],
  );
  // Bring the current step into view once per open, not on every summary update.
  const scrolledToNowRef = useRef(false);
  const scrollNowRowIntoView = useCallback((element: HTMLLIElement | null) => {
    if (!element || scrolledToNowRef.current) return;
    scrolledToNowRef.current = true;
    const viewport = element.closest<HTMLElement>('[data-slot="scroll-area-viewport"]');
    if (!viewport) return;
    // Only a map taller than the panel scrolls; the current step lands a third of the way down.
    if (viewport.scrollHeight <= viewport.clientHeight) return;
    const rowTop = element.getBoundingClientRect().top - viewport.getBoundingClientRect().top;
    viewport.scrollTop += rowTop - viewport.clientHeight / 3;
  }, []);

  if (recap?.enabled !== true) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <MapIcon aria-hidden className="size-6 text-muted-foreground/60" />
        <p className="text-sm font-medium">Resume recap is off for this thread</p>
        <p className="max-w-60 text-xs text-muted-foreground">
          When it is on, a short summary of the goal, what is done, and what is next is written
          after each turn, so you can pick the thread back up without scrolling.
        </p>
        {onSetEnabled ? (
          <Button size="xs" variant="outline" onClick={() => onSetEnabled(true)}>
            Turn on
          </Button>
        ) : null}
      </div>
    );
  }

  const summary = recap.summary;
  const refreshButton =
    threadRef === null ? null : (
      <Button
        size="xs"
        variant="ghost"
        disabled={refreshing}
        onClick={() => void refreshThreadRecap(threadRef, currentGeneratedAt)}
      >
        <RefreshCw aria-hidden className="size-3" />
        {refreshing ? "Refreshing…" : "Refresh"}
      </Button>
    );
  const linearWorkspace = isLinearWorkspaceSlug(summary?.linearWorkspace)
    ? summary.linearWorkspace
    : fallbackLinearWorkspace;
  const turnOff = onSetEnabled ? (
    <Button size="xs" variant="ghost" onClick={() => onSetEnabled(false)}>
      Turn off
    </Button>
  ) : null;

  if (summary === null) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <MapIcon aria-hidden className="size-6 text-muted-foreground/60" />
        <p className="text-sm font-medium">Recap appears after the next turn</p>
        <p className="max-w-60 text-xs text-muted-foreground">
          The map fills in once the agent finishes a turn in this thread.
        </p>
        <div className="flex items-center gap-1">
          {refreshButton}
          {turnOff}
        </div>
      </div>
    );
  }

  const { done, rows, cells, laneCount, now, canStart, waiting, wait } = layout;
  const firstNowIndex = now === null ? -1 : rows.indexOf(now);
  const waitingText =
    waiting !== null
      ? waiting.step.label
      : wait !== null
        ? `${wait.count} ${wait.count === 1 ? "step waits" : "steps wait"} on step ${wait.cause.number}: ${wait.cause.step.label}`
        : summary.blocked;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-col gap-1 border-b border-border/60 px-3 py-2.5">
        <div className="mb-1">
          <p className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
            Goal
          </p>
          <h2 className="line-clamp-3 text-base font-semibold leading-6 text-foreground [overflow-wrap:anywhere]">
            {summary.goal}
          </h2>
          {project ? (
            <div className="mt-0.5 text-xs text-muted-foreground">
              <ProjectBranchLine project={project} branch={branch} />
            </div>
          ) : null}
        </div>
        <div className="flex min-h-6 items-center justify-between gap-2">
          <p className="text-[11px] text-muted-foreground tabular-nums">
            {layout.totalCount > 0 ? `${done.length} of ${layout.totalCount} cleared` : null}
          </p>
          {refreshButton}
        </div>
        <HeaderLine
          icon={<MapPin aria-hidden className="size-3.5" />}
          word="You are here"
          wordClass="text-success-foreground"
        >
          <p className="min-w-0 flex-1 text-sm font-medium leading-5 [overflow-wrap:anywhere]">
            {now?.step.label ?? summary.now}
          </p>
        </HeaderLine>
        {canStart ? (
          <HeaderLine
            icon={<Signpost aria-hidden className="size-3.5" />}
            word="Side quest"
            wordClass="text-muted-foreground"
          >
            <p className="line-clamp-2 min-w-0 flex-1 text-xs leading-5 [overflow-wrap:anywhere]">
              {canStart.step.label} <span className="text-muted-foreground">(can start now)</span>
            </p>
          </HeaderLine>
        ) : null}
        {waitingText ? (
          <HeaderLine
            icon={<Hourglass aria-hidden className="size-3.5" />}
            word="Waiting"
            wordClass="text-warning-foreground"
          >
            <p className="line-clamp-2 min-w-0 flex-1 text-xs leading-5 [overflow-wrap:anywhere]">
              {waitingText}
            </p>
          </HeaderLine>
        ) : null}
      </header>
      <div className="flex flex-col gap-2 px-3 pt-2.5">
        <LinkChips links={summary.links} onOpenLink={openRecapLink} />
        {summary.linearIssueIds.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {summary.linearIssueIds.map((issueId) => (
              <LinearChip
                key={issueId}
                issueId={issueId}
                workspace={linearWorkspace}
                onOpenLink={openRecapLink}
                size="header"
              />
            ))}
          </div>
        ) : null}
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="px-3 py-2">
          {/* Cleared steps stay on the map so the whole path is always visible. */}
          {done.length > 0 ? (
            <ol aria-label="Cleared steps" className="mb-1 flex flex-col gap-1 pb-1">
              {done.map((entry) => (
                <li
                  key={entry.step.id}
                  className="flex min-w-0 items-start gap-2 text-xs text-muted-foreground"
                >
                  <span
                    className="flex shrink-0 justify-center pt-0.5"
                    style={{ width: laneCount * LANE_WIDTH }}
                  >
                    <Check aria-label="cleared" className="size-3.5 text-muted-foreground" />
                  </span>
                  <span className="w-4 shrink-0 pt-px text-right text-[11px] tabular-nums">
                    {entry.number}
                  </span>
                  <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                    {entry.step.label}
                  </span>
                  <StepBadges
                    step={entry.step}
                    workspace={linearWorkspace}
                    onOpenLink={openRecapLink}
                  />
                </li>
              ))}
            </ol>
          ) : null}
          {rows.length > 0 ? (
            <ol aria-label="Steps in order">
              {rows.map((row, index) => (
                <PathRow
                  key={row.step.id}
                  row={row}
                  cell={cells?.[index] ?? EMPTY_CELL}
                  laneCount={laneCount}
                  workspace={linearWorkspace}
                  links={summary.links}
                  onOpenLink={openRecapLink}
                  rowRef={index === firstNowIndex ? scrollNowRowIntoView : undefined}
                />
              ))}
            </ol>
          ) : null}
        </div>
      </ScrollArea>
      <footer className="mt-auto flex items-center justify-between border-t border-border/60 px-3 py-1 text-[.7rem] text-muted-foreground">
        <span className="tabular-nums">as of {formatRelativeTimeLabel(summary.generatedAt)}</span>
        {turnOff}
      </footer>
    </div>
  );
});
