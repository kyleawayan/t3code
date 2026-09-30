import type { ThreadRecapSummary } from "@t3tools/contracts";
import { Link2Icon } from "lucide-react";
import { memo } from "react";

import { useNowMinute } from "~/hooks/useNowMinute";
import { cn } from "~/lib/utils";
import { formatRelativeTimeLabel } from "~/timestampFormat";
import { SquishText } from "../ui/squish-text";
import {
  countRecapLinks,
  resumeWhoseMoveLabel,
  type RecapFreshness,
  type ResumeWhoseMove,
} from "./threadResume.logic";

interface ThreadResumeStripProps {
  /** Null while recap is on but the first summary has not been written yet. */
  summary: ThreadRecapSummary | null;
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

const FRESHNESS_LABEL: Record<RecapFreshness, string | null> = {
  current: null,
  updating: "updates after this turn",
  stale: "out of date",
};

/** Two-line "where was I" above the composer. Clicking it opens the resume map. */
export const ThreadResumeStrip = memo(function ThreadResumeStrip({
  summary,
  whoseMove,
  freshness,
  onOpenMap,
}: ThreadResumeStripProps) {
  // Re-render once a minute so the age label does not freeze.
  useNowMinute();
  const linkCount = summary === null ? 0 : countRecapLinks(summary);
  const whoseMoveNode = (
    <span className={cn("shrink-0 font-semibold", WHOSE_MOVE_CLASS[whoseMove])}>
      {resumeWhoseMoveLabel(whoseMove)}
    </span>
  );

  return (
    <button
      type="button"
      onClick={onOpenMap}
      data-thread-resume-strip
      className="mb-1.5 flex w-full min-w-0 cursor-pointer flex-col gap-0.5 rounded-lg border border-border/70 bg-background px-3 py-1.5 text-left text-muted-foreground text-xs hover:bg-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
    >
      {summary === null ? (
        <span className="flex min-w-0 items-center gap-1.5">
          {whoseMoveNode}
          <span aria-hidden>·</span>
          <SquishText>Recap appears after the next turn.</SquishText>
        </span>
      ) : (
        <>
          <span className="flex min-w-0 items-center gap-2">
            <SquishText className="flex-1">{`Goal: ${summary.goal}`}</SquishText>
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
          </span>
          {/* One idea per line so nothing squishes to nothing in a narrow chat column.
              Done steps live in the map; the strip only answers "what now". */}
          <span className="flex min-w-0 items-center gap-1.5">
            {whoseMoveNode}
            <span aria-hidden>·</span>
            <span className="flex min-w-0 items-center gap-1 text-foreground">
              <span aria-hidden className="shrink-0">
                ▶
              </span>
              <SquishText>{`Now: ${summary.now}`}</SquishText>
            </span>
          </span>
          {summary.blocked ? (
            <SquishText className="text-warning-foreground">{`Blocked: ${summary.blocked}`}</SquishText>
          ) : summary.next ? (
            <SquishText>{`Next: ${summary.next}`}</SquishText>
          ) : null}
        </>
      )}
    </button>
  );
});
