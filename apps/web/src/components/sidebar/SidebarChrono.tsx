import { memo, useEffect, useState } from "react";

import { useLocalStorage } from "../../hooks/useLocalStorage";
import { MTG_INHIBIT_STORAGE_KEY, MtgInhibitSchema } from "../../mtgInhibit";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { onChronoSendNudge } from "./chronoSendNudge";
import {
  CHRONO_RESET,
  ChronoElapsedTodaySchema,
  ChronoStateSchema,
  NO_ELAPSED_TODAY,
  chronoDisplay,
  elapsedTodayDisplay,
  msUntilNextChronoTick,
  pressChrono,
  recordChronoRun,
  type ChronoState,
} from "./sidebarChrono.logic";

const CHRONO_STORAGE_KEY = "t3code:sidebar-chrono:v1";
const CHRONO_ELAPSED_TODAY_STORAGE_KEY = "t3code:sidebar-chrono-elapsed-today:v1";

const CHRONO_ACTION_LABEL = {
  reset: "Start chronograph",
  running: "Stop chronograph",
  stopped: "Reset chronograph",
} satisfies Record<ChronoState["phase"], string>;

// Rendered invisibly so the blank display keeps the lit display's line box.
const CHRONO_NO_SEGMENTS = "00:00:00";
// "START?" as a 7-segment display spells it, one letter per digit cell of HH:MM:SS.
const CHRONO_NUDGE_CELLS = ["St", "Ar", "t?"] as const;

function useChronoNow(startedAt: number | null): number {
  const [now, setNow] = useState(Date.now);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- ticks once a second while the chrono runs
  useEffect(() => {
    if (startedAt === null) return;
    let timeout: number | undefined;
    const scheduleFrom = (from: number) => {
      const delay = msUntilNextChronoTick(startedAt, from);
      if (delay === null) return;
      timeout = window.setTimeout(() => {
        const tickedAt = Date.now();
        setNow(tickedAt);
        scheduleFrom(tickedAt);
      }, delay);
    };
    scheduleFrom(Date.now());
    return () => window.clearTimeout(timeout);
  }, [startedAt]);
  return now;
}

export const SidebarChrono = memo(function SidebarChrono() {
  const [state, setState] = useLocalStorage(CHRONO_STORAGE_KEY, CHRONO_RESET, ChronoStateSchema);
  const [elapsedToday, setElapsedToday] = useLocalStorage(
    CHRONO_ELAPSED_TODAY_STORAGE_KEY,
    NO_ELAPSED_TODAY,
    ChronoElapsedTodaySchema,
  );
  // A stopped chrono stops ticking, so the tooltip reads today's total from when it opened.
  const [tooltipOpenedAt, setTooltipOpenedAt] = useState(0);
  const now = useChronoNow(state.phase === "running" ? state.startedAt : null);
  const display = chronoDisplay(state, now);
  // Each send restarts the flash, so its key changes; null shows the time again.
  const [nudgeKey, setNudgeKey] = useState<number | null>(null);
  const running = state.phase === "running";
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- subscribes to composer sends, which happen outside this component
  useEffect(() => {
    if (running) return;
    return onChronoSendNudge(() => setNudgeKey((current) => (current ?? 0) + 1));
  }, [running]);
  const press = () => {
    setNudgeKey(null);
    const pressedAt = Date.now();
    setElapsedToday((current) => recordChronoRun(current, state, pressedAt));
    setState((current) => pressChrono(current, pressedAt));
  };
  const actionLabel = CHRONO_ACTION_LABEL[state.phase];

  return (
    <div className="sidebar-chrono -mx-(--sidebar-content-inset) flex flex-col gap-1.5 border-y border-sidebar-foreground/15 py-2">
      <div className="flex items-stretch gap-1">
        <Tooltip
          onOpenChange={(open) => {
            if (open) setTooltipOpenedAt(Date.now());
          }}
        >
          <TooltipTrigger
            render={
              <button
                type="button"
                aria-label={actionLabel}
                onClick={press}
                className="sidebar-chrono-button flex w-8.5 min-w-7 items-center justify-center rounded-sm focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
              >
                <span aria-hidden className="sidebar-chrono-legend font-semibold text-4xs">
                  CHR
                </span>
              </button>
            }
          />
          <TooltipPopup side="top">
            <div>{actionLabel}</div>
            <div className="text-muted-foreground tabular-nums">
              ET {elapsedTodayDisplay(elapsedToday, state, Math.max(now, tooltipOpenedAt))}
            </div>
          </TooltipPopup>
        </Tooltip>
        <div className="sidebar-chrono-display flex shrink-0 grow items-center justify-center rounded-sm">
          {nudgeKey !== null ? (
            <span
              key={nudgeKey}
              aria-hidden
              data-nudge=""
              className="sidebar-chrono-digits"
              onAnimationEnd={() => setNudgeKey(null)}
            >
              {/* Unlit colons keep each letter on its digit cell. */}
              {CHRONO_NUDGE_CELLS[0]}
              <span className="text-transparent">:</span>
              {CHRONO_NUDGE_CELLS[1]}
              <span className="text-transparent">:</span>
              {CHRONO_NUDGE_CELLS[2]}
            </span>
          ) : (
            <span
              role="timer"
              aria-hidden={display === null}
              data-blank={display === null || undefined}
              className="sidebar-chrono-digits"
            >
              {display ?? CHRONO_NO_SEGMENTS}
            </span>
          )}
        </div>
      </div>
      <MtgInhibitButton />
    </div>
  );
});

/** Fork: a wide key under the chrono that silences alert sounds, lit purple while it does. */
function MtgInhibitButton() {
  const [inhibited, setInhibited] = useLocalStorage(
    MTG_INHIBIT_STORAGE_KEY,
    false,
    MtgInhibitSchema,
  );
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label="MTG INHIBIT"
            aria-pressed={inhibited}
            onClick={() => setInhibited((current) => !current)}
            className="sidebar-chrono-button sidebar-mtg-inhibit flex h-5.5 items-center justify-center rounded-sm focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
          >
            <span aria-hidden className="sidebar-chrono-legend font-semibold text-4xs">
              MTG INHIBIT
            </span>
          </button>
        }
      />
      <TooltipPopup side="top">
        {inhibited ? "Alert sounds muted. Press to unmute" : "Mute alert sounds"}
      </TooltipPopup>
    </Tooltip>
  );
}
