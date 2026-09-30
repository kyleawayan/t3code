import type { ThreadRecapSummary } from "@t3tools/contracts";
import { GitBranchIcon, Link2Icon } from "lucide-react";
import { memo } from "react";

import { useNowMinute } from "~/hooks/useNowMinute";
import { cn } from "~/lib/utils";
import { formatRelativeTimeLabel } from "~/timestampFormat";
import { ProjectFavicon, type ProjectFaviconProject } from "../ProjectFavicon";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import {
  countRecapLinks,
  resumeWhoseMoveLabel,
  type RecapFreshness,
  type ResumeWhoseMove,
} from "./threadResume.logic";

interface ThreadResumeStripProps {
  /** Which project and branch this thread works in, so the strip answers "where" too. */
  project: ProjectFaviconProject | null;
  branch: string | null;
  /** Null for drafts, which show only the project line and do not open the map. */
  title: string | null;
  recapEnabled: boolean;
  /** Null while recap is on but the first summary has not been written yet. */
  summary: ThreadRecapSummary | null;
  whoseMove: ResumeWhoseMove;
  freshness: RecapFreshness;
  onOpenMap: () => void;
}

/** Project name stays whole; a long branch name truncates at the end. */
function ProjectBranchLine({
  project,
  branch,
}: {
  project: ProjectFaviconProject;
  branch: string | null;
}) {
  return (
    <span className="flex min-w-0 items-center gap-1.5 whitespace-nowrap">
      <ProjectFavicon project={project} className="size-3 shrink-0" />
      <span className="shrink-0">{project.title}</span>
      {branch ? (
        <>
          <span aria-hidden>·</span>
          <GitBranchIcon aria-hidden className="size-3 shrink-0 opacity-70" />
          <span className="min-w-0 truncate">{branch}</span>
        </>
      ) : null}
    </span>
  );
}

const WHOSE_MOVE_CLASS: Record<ResumeWhoseMove, string> = {
  approve: "text-warning-foreground",
  answer: "text-warning-foreground",
  agent: "text-muted-foreground",
  user: "text-foreground",
};

const STRIP_CLASS =
  "mb-1.5 flex w-full min-w-0 flex-col gap-0.5 rounded-lg border border-border/70 bg-background px-3 py-1.5 text-left text-muted-foreground text-xs";
const STRIP_BUTTON_CLASS = cn(
  STRIP_CLASS,
  "cursor-pointer hover:bg-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
);

const FRESHNESS_LABEL: Record<RecapFreshness, string | null> = {
  current: null,
  updating: "updates after this turn",
  stale: "out of date",
};

/**
 * Summary age and link count. Its own component so only strips showing a
 * summary subscribe to the minute clock, not every thread's strip.
 */
function RecapAge({
  summary,
  freshness,
}: {
  summary: ThreadRecapSummary;
  freshness: RecapFreshness;
}) {
  useNowMinute();
  const linkCount = countRecapLinks(summary);
  return (
    <>
      {linkCount > 0 ? (
        <span
          aria-label={`${linkCount} ${linkCount === 1 ? "link" : "links"} in the map`}
          className="flex shrink-0 items-center gap-0.5 tabular-nums"
        >
          <Link2Icon aria-hidden className="size-3" />
          {linkCount}
        </span>
      ) : null}
      <span className="shrink-0 tabular-nums">
        as of {formatRelativeTimeLabel(summary.generatedAt)}
        {FRESHNESS_LABEL[freshness] ? (
          <span className={cn(freshness === "stale" && "text-warning-foreground")}>
            {" "}
            · {FRESHNESS_LABEL[freshness]}
          </span>
        ) : null}
      </span>
    </>
  );
}

/**
 * "Where was I" above the composer, for every thread: project and branch,
 * then the thread title. With resume recap on, whose move and what is next
 * follow, each clamped to two lines, so the strip stays at most six lines.
 * Clicking opens the map, which also holds the recap's on switch.
 */
export const ThreadResumeStrip = memo(function ThreadResumeStrip({
  project,
  branch,
  title,
  recapEnabled,
  summary,
  whoseMove,
  freshness,
  onOpenMap,
}: ThreadResumeStripProps) {
  const projectLine = project ? <ProjectBranchLine project={project} branch={branch} /> : null;

  if (title === null) {
    return projectLine ? <div className={STRIP_CLASS}>{projectLine}</div> : null;
  }

  const shownSummary = recapEnabled ? summary : null;
  const titleLine = (
    <span className="flex min-w-0 items-start gap-2">
      <span className="min-w-0 flex-1 truncate text-foreground/90">{title}</span>
      {shownSummary ? <RecapAge summary={shownSummary} freshness={freshness} /> : null}
    </span>
  );

  if (shownSummary === null) {
    return (
      <button
        type="button"
        onClick={onOpenMap}
        data-thread-resume-strip
        className={STRIP_BUTTON_CLASS}
      >
        {projectLine}
        {titleLine}
        {recapEnabled ? <span className="truncate">Recap appears after the next turn.</span> : null}
      </button>
    );
  }

  const nextLine = shownSummary.blocked
    ? `Blocked: ${shownSummary.blocked}`
    : shownSummary.next
      ? `Next: ${shownSummary.next}`
      : null;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            onClick={onOpenMap}
            data-thread-resume-strip
            className={STRIP_BUTTON_CLASS}
          />
        }
      >
        {projectLine}
        {titleLine}
        {/* Done steps live in the map; the strip only answers "what now". */}
        <span className="line-clamp-2 break-words">
          <span className={cn("font-semibold", WHOSE_MOVE_CLASS[whoseMove])}>
            {resumeWhoseMoveLabel(whoseMove)}
          </span>
          <span aria-hidden> · ▶ </span>
          <span className="text-foreground">Now: {shownSummary.now}</span>
        </span>
        {nextLine ? (
          <span
            className={cn(
              "line-clamp-2 break-words",
              shownSummary.blocked && "text-warning-foreground",
            )}
          >
            {nextLine}
          </span>
        ) : null}
      </TooltipTrigger>
      <TooltipPopup side="top" className="max-w-96 whitespace-normal">
        <span className="flex flex-col gap-1">
          <span>Goal: {shownSummary.goal}</span>
          <span>Now: {shownSummary.now}</span>
          {nextLine ? <span>{nextLine}</span> : null}
        </span>
      </TooltipPopup>
    </Tooltip>
  );
});
