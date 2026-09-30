import type { ThreadRecapSummary } from "@t3tools/contracts";
import { CircleIcon, GitBranchIcon, Hourglass, Link2Icon, MapPin } from "lucide-react";
import { memo, type ReactNode } from "react";

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
    <span className="flex h-[1lh] min-w-0 items-center gap-1.5 whitespace-nowrap">
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

// Every line keeps a fixed height, so switching threads never moves the composer.
const TWO_LINE_SLOT_CLASS = "block h-[2lh] min-w-0 line-clamp-2 break-words";
const GOAL_SLOT_CLASS = cn(TWO_LINE_SLOT_CLASS, "font-semibold text-foreground text-sm");

const STRIP_CLASS =
  "mb-1.5 flex w-full min-w-0 flex-col gap-2 rounded-lg border border-border/70 bg-background px-3 py-2.5 text-left text-muted-foreground text-xs";
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

/** Small uppercase label on its own line, value below: reads well in a narrow chat column. */
function Field({
  label,
  icon,
  aside,
  className,
  labelClassName,
  children,
}: {
  label: string;
  icon?: ReactNode | undefined;
  aside?: ReactNode | undefined;
  className?: string | undefined;
  labelClassName?: string | undefined;
  children: ReactNode;
}) {
  return (
    <span className={cn("flex min-w-0 flex-col gap-0.5", className)}>
      <span
        className={cn(
          "flex h-[1lh] min-w-0 items-center gap-1 font-semibold text-[10px] uppercase tracking-wide",
          labelClassName,
        )}
      >
        {icon}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {aside ? (
          <span className="flex shrink-0 items-center gap-2 font-normal text-xs normal-case tracking-normal">
            {aside}
          </span>
        ) : null}
      </span>
      {children}
    </span>
  );
}

const ICON_CLASS = "size-3 shrink-0";

/**
 * "Where was I" above the composer, for every thread: project and branch,
 * then the conversation name. With resume recap on, the goal leads and the
 * suggested move and what is next follow. Every slot has a fixed height.
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
  const conversationField = (
    <Field
      label="Conversation name"
      aside={shownSummary ? <RecapAge summary={shownSummary} freshness={freshness} /> : null}
    >
      <span className="block h-[1lh] min-w-0 truncate text-foreground/90">{title}</span>
    </Field>
  );

  if (shownSummary === null) {
    return (
      <button
        type="button"
        onClick={onOpenMap}
        data-thread-resume-strip
        className={STRIP_BUTTON_CLASS}
      >
        {recapEnabled ? (
          <Field label="Goal">
            <span className={cn(TWO_LINE_SLOT_CLASS, "text-muted-foreground")}>
              Recap appears after the next turn.
            </span>
          </Field>
        ) : null}
        {projectLine}
        {conversationField}
        {recapEnabled ? (
          <>
            <span aria-hidden className="block h-[3lh] py-0.5" />
            <span aria-hidden className="block h-[3lh]" />
          </>
        ) : null}
      </button>
    );
  }

  const blocked = shownSummary.blocked;
  const nextText = blocked ?? shownSummary.next;
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
        <Field label="Goal">
          <span className={GOAL_SLOT_CLASS}>{shownSummary.goal}</span>
        </Field>
        {projectLine}
        {conversationField}
        {/* Done steps live in the map; the strip only answers "what now". Icons and colors
            match the map: green pin for now, amber hourglass for blocked, hollow circle for next. */}
        <Field
          label={resumeWhoseMoveLabel(whoseMove)}
          icon={<MapPin aria-hidden className={cn(ICON_CLASS, "text-success-foreground")} />}
          className="rounded-md bg-success/8 px-2 py-1.5"
          labelClassName={WHOSE_MOVE_CLASS[whoseMove]}
        >
          <span className={cn(TWO_LINE_SLOT_CLASS, "font-medium text-success-foreground")}>
            {shownSummary.now}
          </span>
        </Field>
        {nextText ? (
          <Field
            label={blocked ? "Blocked" : "Next"}
            icon={
              blocked ? (
                <Hourglass aria-hidden className={ICON_CLASS} />
              ) : (
                <CircleIcon aria-hidden className={ICON_CLASS} />
              )
            }
            className="px-2"
            labelClassName={blocked ? "text-warning-foreground" : undefined}
          >
            <span className={cn(TWO_LINE_SLOT_CLASS, blocked && "text-warning-foreground")}>
              {nextText}
            </span>
          </Field>
        ) : (
          <span aria-hidden className="block h-[3lh]" />
        )}
      </TooltipTrigger>
      <TooltipPopup side="top" className="max-w-96 whitespace-normal">
        <span className="flex flex-col gap-1">
          <span>Goal: {shownSummary.goal}</span>
          <span>Now: {shownSummary.now}</span>
          {nextText ? <span>{`${blocked ? "Blocked" : "Next"}: ${nextText}`}</span> : null}
        </span>
      </TooltipPopup>
    </Tooltip>
  );
});
