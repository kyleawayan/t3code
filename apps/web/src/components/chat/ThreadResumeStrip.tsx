import type { ThreadRecapSummary } from "@t3tools/contracts";
import { Check, ChevronDown, ChevronUp, CircleIcon, Hourglass, MapPin } from "lucide-react";
import { memo, type ReactNode } from "react";
import * as Schema from "effect/Schema";

import { useLocalStorage } from "~/hooks/useLocalStorage";
import { useNowMinute } from "~/hooks/useNowMinute";
import { cn } from "~/lib/utils";
import { formatRelativeTimeLabel } from "~/timestampFormat";
import { RecapActivityBar } from "./RecapActivityBar";
import {
  isServerRecapRefreshing,
  recapBeforeText,
  resumeWhoseMoveLabel,
  type RecapFreshness,
  type ResumeWhoseMove,
} from "./threadResume.logic";

interface ThreadResumeStripProps {
  /** Null while recap is on but the first summary has not been written yet. */
  summary: ThreadRecapSummary | null;
  /** When the newest message the summary covers was sent (see recapCoveredAt). */
  coveredAt: string | null;
  /** Set by the server while it writes a new summary. */
  refreshStartedAt: string | undefined;
  whoseMove: ResumeWhoseMove;
  freshness: RecapFreshness;
  onOpenMap: () => void;
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
  "flex w-full min-w-0 flex-col gap-3 rounded-lg border border-border/70 bg-background px-3 py-3 text-left text-muted-foreground text-xs";
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
 * How current the summary is. Its own component so only strips showing a
 * summary subscribe to the minute clock, not every thread's strip.
 */
function RecapAge({
  coveredAt,
  freshness,
  refreshing,
}: {
  coveredAt: string;
  freshness: RecapFreshness;
  refreshing: boolean;
}) {
  const label = refreshing ? "updating…" : FRESHNESS_LABEL[freshness];
  return (
    <span className="shrink-0 tabular-nums">
      as of {formatRelativeTimeLabel(coveredAt)}
      {label ? (
        <span className={cn(!refreshing && freshness === "stale" && "text-warning-foreground")}>
          {" "}
          · {label}
        </span>
      ) : null}
    </span>
  );
}

/** Label on its own line, value below: reads well in a narrow chat column. */
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
    <span className={cn("flex min-w-0 flex-col gap-1", className)}>
      <span
        className={cn(
          "flex h-[1lh] min-w-0 items-center gap-1 font-medium text-xs",
          labelClassName,
        )}
      >
        {icon}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {aside ? (
          <span className="flex shrink-0 items-center gap-2 font-normal">{aside}</span>
        ) : null}
      </span>
      {children}
    </span>
  );
}

const ICON_CLASS = "size-3 shrink-0";
// Spans the strip's padding, like the suggested move's band.
const GOAL_DIVIDER_CLASS = "-mx-3 block border-t border-border/60";
// Hold a field's height (label, gap, two lines) while it has nothing to show,
// and the suggested move's band, which adds its vertical padding.
const FIELD_SPACER_CLASS = "block h-[calc(3lh+--spacing(1))]";
const BAND_SPACER_CLASS = "block h-[calc(3lh+--spacing(6))]";

/**
 * Resume recap above the composer, only while the map is on: the goal leads,
 * then what came before, the suggested move, and what is next. Project and
 * branch live in the composer's bottom bar. Every slot has a fixed height, so
 * switching threads never moves the composer. Clicking opens the map; the
 * chevron folds the note down to its goal.
 */
export const ThreadResumeStrip = memo(function ThreadResumeStrip(props: ThreadResumeStripProps) {
  // One choice for every thread, so switching threads never changes the note's height.
  const [collapsed, setCollapsed] = useLocalStorage(NOTE_COLLAPSED_KEY, false, Schema.Boolean);
  const refreshing = isServerRecapRefreshing(props.refreshStartedAt, useNowMinute());
  return (
    <div className="relative mb-1.5">
      {/* Over the top border, so showing it never moves anything. */}
      {refreshing ? <RecapActivityBar className="absolute inset-x-3 top-0 rounded-full" /> : null}
      <NoteBody {...props} collapsed={collapsed} refreshing={refreshing} />
      <button
        type="button"
        onClick={() => setCollapsed((current) => !current)}
        aria-label={collapsed ? "Expand note" : "Collapse note"}
        aria-expanded={!collapsed}
        className="absolute top-2 right-1.5 flex size-6 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
      >
        {collapsed ? (
          <ChevronDown aria-hidden className="size-3.5" />
        ) : (
          <ChevronUp aria-hidden className="size-3.5" />
        )}
      </button>
    </div>
  );
});

const NOTE_COLLAPSED_KEY = "t3code:resume-note-collapsed";
// Leaves room in the Goal row for the collapse button over its corner.
const GOAL_LABEL_CLASS = "pe-6";

function NoteBody({
  summary,
  coveredAt,
  whoseMove,
  freshness,
  onOpenMap,
  collapsed,
  refreshing,
}: ThreadResumeStripProps & { collapsed: boolean; refreshing: boolean }) {
  const age = summary ? (
    <RecapAge
      coveredAt={coveredAt ?? summary.generatedAt}
      freshness={freshness}
      refreshing={refreshing}
    />
  ) : null;
  if (collapsed) {
    return (
      <button
        type="button"
        onClick={onOpenMap}
        data-thread-resume-strip
        className={STRIP_BUTTON_CLASS}
      >
        <Field label="Goal" aside={age} labelClassName={GOAL_LABEL_CLASS}>
          <span className="block h-[1lh] min-w-0 truncate font-semibold text-foreground text-sm">
            {summary?.goal ?? "Recap appears after the next turn."}
          </span>
        </Field>
      </button>
    );
  }
  if (summary === null) {
    return (
      <button
        type="button"
        onClick={onOpenMap}
        data-thread-resume-strip
        className={STRIP_BUTTON_CLASS}
      >
        <Field label="Goal" labelClassName={GOAL_LABEL_CLASS}>
          <span className={cn(TWO_LINE_SLOT_CLASS, "text-muted-foreground")}>
            Recap appears after the next turn.
          </span>
        </Field>
        <span aria-hidden className={GOAL_DIVIDER_CLASS} />
        <span aria-hidden className={FIELD_SPACER_CLASS} />
        <span aria-hidden className={BAND_SPACER_CLASS} />
        <span aria-hidden className={FIELD_SPACER_CLASS} />
      </button>
    );
  }

  const blocked = summary.blocked;
  const nextText = blocked ?? summary.next;
  const beforeText = recapBeforeText(summary);
  return (
    <button
      type="button"
      onClick={onOpenMap}
      data-thread-resume-strip
      className={STRIP_BUTTON_CLASS}
    >
      <Field label="Goal" aside={age} labelClassName={GOAL_LABEL_CLASS}>
        <span className={GOAL_SLOT_CLASS}>{summary.goal}</span>
      </Field>
      <span aria-hidden className={GOAL_DIVIDER_CLASS} />
      {/* Icons and colors match the map: check for cleared, green pin for now,
            amber hourglass for blocked, hollow circle for next. */}
      <Field label="Before" icon={<Check aria-hidden className={ICON_CLASS} />}>
        <span className={TWO_LINE_SLOT_CLASS}>{beforeText ?? "Nothing finished yet."}</span>
      </Field>
      <Field
        label={resumeWhoseMoveLabel(whoseMove)}
        icon={<MapPin aria-hidden className={cn(ICON_CLASS, "text-success-foreground")} />}
        // A full-width band: the tint spans the strip's padding, and the text stays on the Goal's edge.
        className="-mx-3 bg-success/8 px-3 py-2.5"
        labelClassName={WHOSE_MOVE_CLASS[whoseMove]}
      >
        <span className={cn(TWO_LINE_SLOT_CLASS, "font-medium text-success-foreground")}>
          {summary.now}
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
          labelClassName={blocked ? "text-warning-foreground" : undefined}
        >
          <span className={cn(TWO_LINE_SLOT_CLASS, blocked && "text-warning-foreground")}>
            {nextText}
          </span>
        </Field>
      ) : (
        <span aria-hidden className={FIELD_SPACER_CLASS} />
      )}
    </button>
  );
}
