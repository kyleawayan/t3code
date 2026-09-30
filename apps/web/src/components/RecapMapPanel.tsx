/**
 * Resume map right-panel surface: the thread's recap steps as one column in
 * dependency order, with dependency lines in a narrow left gutter like a
 * git-log graph. Layout lives in `recapMapLayout.logic`. Status always reads
 * from a shape and a word, never color alone; green marks only the current
 * step and amber only blocked ones. Everything is static: no pulses or
 * spinners, since the summary only changes between turns.
 */
import type {
  ScopedThreadRef,
  ThreadRecap,
  ThreadRecapLink,
  ThreadRecapStep,
} from "@t3tools/contracts";
import {
  Check,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Link2,
  Map as MapIcon,
} from "lucide-react";
import {
  memo,
  useCallback,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";

import { useOpenLink } from "~/browser/useOpenLink";
import { useNowMinute } from "~/hooks/useNowMinute";
import { cn } from "~/lib/utils";
import { formatRelativeTimeLabel } from "~/timestampFormat";
import { Button } from "~/components/ui/button";
import { ScrollArea } from "~/components/ui/scroll-area";
import { SquishText } from "~/components/ui/squish-text";
import { toastManager } from "~/components/ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import {
  layoutRecapPath,
  type RecapGutterCell,
  type RecapPathRow,
  type RecapRowMarker,
} from "./chat/recapMapLayout.logic";
import { safeRecapLinkUrl } from "./chat/threadResume.logic";

const EMPTY_STEPS: ReadonlyArray<ThreadRecapStep> = [];
const EMPTY_CELL: RecapGutterCell = {
  through: [],
  arrivals: [],
  down: false,
  dashedArrival: false,
};

const LANE_WIDTH = 14;
const laneX = (lane: number) => LANE_WIDTH / 2 + lane * LANE_WIDTH;
// Vertical center of a row's first text line; the row paddings below are sized to match.
const MARKER_Y = 17.5;
const NOW_MARKER_Y = 22;
const CORNER_RADIUS = 5;
const LINE_CLASS = "stroke-muted-foreground/45";

function MarkerShape({ marker, x, y }: { marker: RecapRowMarker; x: number; y: number }) {
  switch (marker) {
    case "now":
      return <circle cx={x} cy={y} r={5} className="fill-success" />;
    case "next":
      return (
        <circle
          cx={x}
          cy={y}
          r={4.25}
          strokeWidth={1.5}
          className="fill-background stroke-muted-foreground"
        />
      );
    case "blocked":
      return (
        <rect x={x - 4.5} y={y - 4.5} width={9} height={9} rx={1.5} className="fill-warning" />
      );
    case "unknown":
      return (
        <circle
          cx={x}
          cy={y}
          r={4.25}
          strokeWidth={1.25}
          strokeDasharray="2 2"
          className="fill-background stroke-muted-foreground"
        />
      );
  }
}

/** One row's slice of the gutter. Lines run to "100%" so the row can grow with its label. */
function GutterCell({
  cell,
  lane,
  laneCount,
  marker,
  markerY,
}: {
  cell: RecapGutterCell;
  lane: number;
  laneCount: number;
  marker: RecapRowMarker;
  markerY: number;
}) {
  const x = laneX(lane);
  return (
    <div
      aria-hidden
      className="relative shrink-0 self-stretch"
      style={{ width: laneCount * LANE_WIDTH }}
    >
      <svg className="absolute inset-0 size-full overflow-visible" fill="none" strokeWidth={1.5}>
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
            return (
              <line
                key={`arrival-${arrival.lane}`}
                x1={from}
                x2={x}
                y1={markerY}
                y2={markerY}
                className={LINE_CLASS}
              />
            );
          }
          if (arrival.lane === lane) {
            return (
              <line
                key={`arrival-${arrival.lane}`}
                x1={x}
                x2={x}
                y1={0}
                y2={markerY}
                className={LINE_CLASS}
              />
            );
          }
          const direction = x > from ? 1 : -1;
          return (
            <path
              key={`arrival-${arrival.lane}`}
              d={`M ${from} 0 V ${markerY - CORNER_RADIUS} Q ${from} ${markerY} ${from + direction * CORNER_RADIUS} ${markerY} H ${x}`}
              className={LINE_CLASS}
            />
          );
        })}
        {cell.dashedArrival ? (
          <line x1={x} x2={x} y1={0} y2={markerY} strokeDasharray="2 3" className={LINE_CLASS} />
        ) : null}
        {cell.down ? <line x1={x} x2={x} y1={markerY} y2="100%" className={LINE_CLASS} /> : null}
        <MarkerShape marker={marker} x={x} y={markerY} />
      </svg>
    </div>
  );
}

type OpenRecapLink = (url: string, event: ReactMouseEvent) => void;

function RowWord({ row }: { row: RecapPathRow }) {
  switch (row.marker) {
    case "now":
      return <span className="font-semibold text-success-foreground">NOW</span>;
    case "blocked":
      return (
        <span className="text-warning-foreground">
          {row.after.length > 0 ? `after ${row.after.join(", ")}` : "blocked"}
        </span>
      );
    case "next":
      return row.canStartNow ? (
        <span className="text-foreground/80">can start now</span>
      ) : (
        <span className="text-muted-foreground">after {row.after.join(", ")}</span>
      );
    case "unknown":
      return <span className="text-muted-foreground">?</span>;
  }
}

function StepBadges({ step }: { step: ThreadRecapStep }) {
  return (
    <>
      {step.source === "linear" && step.linearIssueId ? (
        <span className="shrink-0 rounded border border-border px-1 font-mono text-[10px] leading-4 text-muted-foreground">
          {step.linearIssueId}
        </span>
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
  onOpenLink,
  rowRef,
}: {
  row: RecapPathRow;
  cell: RecapGutterCell;
  laneCount: number;
  onOpenLink: OpenRecapLink;
  rowRef?: ((element: HTMLLIElement | null) => void) | undefined;
}) {
  const isNow = row.marker === "now";
  const url = row.step.url === undefined ? null : safeRecapLinkUrl(row.step.url);
  return (
    <li ref={rowRef} className="flex min-h-9 items-stretch gap-2">
      <GutterCell
        cell={cell}
        lane={row.lane}
        laneCount={laneCount}
        marker={row.marker}
        markerY={isNow ? NOW_MARKER_Y : MARKER_Y}
      />
      <div
        className={cn(
          "flex min-w-0 flex-1 items-start gap-2 rounded-md border px-1.5",
          isNow ? "border-success/50 bg-success/8 py-3" : "border-transparent pt-2.5 pb-1",
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
        {isNow ? (
          // The current step is the one thing the reader must not lose, so it wraps in full.
          <p className="min-w-0 flex-1 text-sm font-medium leading-5 text-foreground [overflow-wrap:anywhere]">
            {row.step.label}
          </p>
        ) : (
          <Tooltip>
            <TooltipTrigger
              render={
                <p
                  className={cn(
                    "line-clamp-2 min-w-0 flex-1 text-xs leading-[15px] [overflow-wrap:anywhere]",
                    row.marker === "unknown" ? "text-muted-foreground" : "text-foreground/90",
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
        <span
          className={cn(
            "flex shrink-0 items-center gap-1.5 text-[11px]",
            isNow ? "leading-5" : "leading-[15px]",
          )}
        >
          <StepBadges step={row.step} />
          <RowWord row={row} />
          {url ? (
            <button
              type="button"
              aria-label={`Open link for ${row.step.label}`}
              onClick={(event) => onOpenLink(url, event)}
              className="rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ExternalLink aria-hidden className="size-3" />
            </button>
          ) : null}
        </span>
      </div>
    </li>
  );
}

function HeaderLine({
  shape,
  word,
  wordClass,
  children,
}: {
  shape: ReactNode;
  word: string;
  wordClass: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-start gap-2">
      <svg aria-hidden className="mt-1 size-3 shrink-0 overflow-visible" viewBox="0 0 12 12">
        {shape}
      </svg>
      <span className={cn("w-10 shrink-0 text-[11px] font-semibold leading-5", wordClass)}>
        {word}
      </span>
      {children}
    </div>
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
        <button
          key={link.url}
          type="button"
          onClick={(event) => onOpenLink(link.url, event)}
          className="inline-flex max-w-full items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-[11px] text-foreground/90 hover:bg-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Link2 aria-hidden className="size-3 shrink-0 text-muted-foreground" />
          <span className="max-w-48 truncate">{link.label}</span>
        </button>
      ))}
    </div>
  );
}

export const RecapMapPanel = memo(function RecapMapPanel({
  recap,
  threadRef,
  onSetEnabled,
}: {
  recap: ThreadRecap | null;
  threadRef: ScopedThreadRef | null;
  /** Absent for drafts, which have no server thread to turn recap on for yet. */
  onSetEnabled: ((enabled: boolean) => void) | null;
}) {
  useNowMinute();
  const [doneExpanded, setDoneExpanded] = useState(false);
  const steps = recap?.summary?.steps ?? EMPTY_STEPS;
  const layout = useMemo(() => layoutRecapPath(steps), [steps]);
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
    const rowRect = element.getBoundingClientRect();
    const viewportRect = viewport.getBoundingClientRect();
    if (rowRect.top < viewportRect.top || rowRect.bottom > viewportRect.bottom) {
      viewport.scrollTop += rowRect.top - viewportRect.top - 8;
    }
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
        {turnOff}
      </div>
    );
  }

  const { done, rows, cells, laneCount, now, canStart, wait } = layout;
  const firstNowIndex = now === null ? -1 : rows.indexOf(now);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-col gap-1 border-b border-border/60 px-3 py-2.5">
        {layout.totalCount > 0 ? (
          <p className="text-[11px] text-muted-foreground tabular-nums">
            {done.length} of {layout.totalCount} done
          </p>
        ) : null}
        <HeaderLine
          shape={<circle cx={6} cy={6} r={5} className="fill-success" />}
          word="NOW"
          wordClass="text-success-foreground"
        >
          <p className="min-w-0 flex-1 text-sm font-medium leading-5 [overflow-wrap:anywhere]">
            {now?.step.label ?? summary.now}
          </p>
        </HeaderLine>
        {canStart ? (
          <HeaderLine
            shape={
              <circle
                cx={6}
                cy={6}
                r={4.25}
                strokeWidth={1.5}
                className="fill-background stroke-muted-foreground"
              />
            }
            word="ALSO"
            wordClass="text-muted-foreground"
          >
            <SquishText className="flex-1 text-xs leading-5">
              {`${canStart.step.label} (can start now)`}
            </SquishText>
          </HeaderLine>
        ) : null}
        {wait !== null || summary.blocked ? (
          <HeaderLine
            shape={<rect x={1.5} y={1.5} width={9} height={9} rx={1.5} className="fill-warning" />}
            word="WAIT"
            wordClass="text-warning-foreground"
          >
            <SquishText className="flex-1 text-xs leading-5">
              {wait !== null
                ? `${wait.count} ${wait.count === 1 ? "step waits" : "steps wait"} on step ${wait.cause.number}: ${wait.cause.step.label}`
                : (summary.blocked ?? "")}
            </SquishText>
          </HeaderLine>
        ) : null}
      </header>
      <div className="flex flex-col gap-2 px-3 pt-2.5">
        <LinkChips links={summary.links} onOpenLink={openRecapLink} />
        {summary.linearIssueIds.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {summary.linearIssueIds.map((issueId) => (
              <span
                key={issueId}
                className="rounded-md border border-border px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground"
              >
                {issueId}
              </span>
            ))}
          </div>
        ) : null}
        <SquishText className="text-[11px] text-muted-foreground">{`Goal: ${summary.goal}`}</SquishText>
      </div>
      {/* About eight rows tall: more than that scrolls rather than filling the panel. */}
      <ScrollArea className="h-auto max-h-[25rem] min-h-0 shrink">
        <div className="px-3 py-2">
          {done.length > 0 ? (
            <div className="mb-1">
              <button
                type="button"
                aria-expanded={doneExpanded}
                onClick={() => setDoneExpanded((expanded) => !expanded)}
                className="flex w-full min-w-0 items-center gap-2 rounded-md py-1 text-left text-xs text-muted-foreground hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span
                  className="flex shrink-0 justify-center"
                  style={{ width: laneCount * LANE_WIDTH }}
                >
                  <Check aria-hidden className="size-3.5 text-muted-foreground" />
                </span>
                <SquishText className="flex-1">
                  {`${done.length} done: ${done.map((entry) => entry.step.label).join(", ")}`}
                </SquishText>
                {doneExpanded ? (
                  <ChevronDown aria-hidden className="size-3 shrink-0" />
                ) : (
                  <ChevronRight aria-hidden className="size-3 shrink-0" />
                )}
              </button>
              {doneExpanded ? (
                <ol className="mt-1 flex flex-col gap-1 pb-1">
                  {done.map((entry) => (
                    <li
                      key={entry.step.id}
                      className="flex min-w-0 items-start gap-2 text-xs text-muted-foreground"
                    >
                      <span className="shrink-0" style={{ width: laneCount * LANE_WIDTH }} />
                      <span className="w-4 shrink-0 text-right text-[11px] tabular-nums">
                        {entry.number}
                      </span>
                      <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                        {entry.step.label}
                      </span>
                      <StepBadges step={entry.step} />
                    </li>
                  ))}
                </ol>
              ) : null}
            </div>
          ) : null}
          {rows.length > 0 ? (
            <ol aria-label="Steps in order">
              {rows.map((row, index) => (
                <PathRow
                  key={row.step.id}
                  row={row}
                  cell={cells?.[index] ?? EMPTY_CELL}
                  laneCount={laneCount}
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
