import { memo, useEffect, useState } from "react";

import { useLocalStorage } from "../../hooks/useLocalStorage";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import {
  CHRONO_RESET,
  ChronoStateSchema,
  chronoDisplay,
  msUntilNextChronoTick,
  pressChrono,
  type ChronoState,
} from "./sidebarChrono.logic";

const CHRONO_STORAGE_KEY = "t3code:sidebar-chrono:v1";

const CHRONO_ACTION_LABEL = {
  reset: "Start chronograph",
  running: "Stop chronograph",
  stopped: "Reset chronograph",
} satisfies Record<ChronoState["phase"], string>;

// Rendered invisibly so the blank display keeps the lit display's line box.
const CHRONO_NO_SEGMENTS = "00:00:00";

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
  const now = useChronoNow(state.phase === "running" ? state.startedAt : null);
  const display = chronoDisplay(state, now);
  const press = () => setState((current) => pressChrono(current, Date.now()));
  const actionLabel = CHRONO_ACTION_LABEL[state.phase];

  return (
    <div className="sidebar-chrono-panel mx-(--sidebar-row-content-inset) flex items-stretch gap-1 rounded-lg border border-border/60 p-1">
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              aria-label={actionLabel}
              onClick={press}
              className="sidebar-chrono-button flex size-8.5 shrink-0 items-center justify-center rounded-sm focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
            >
              <span aria-hidden className="sidebar-chrono-legend font-semibold tracking-wider">
                CHR
              </span>
            </button>
          }
        />
        <TooltipPopup side="top">{actionLabel}</TooltipPopup>
      </Tooltip>
      <div className="sidebar-chrono-display flex min-w-0 flex-1 items-center justify-center rounded-sm">
        <span
          role="timer"
          aria-hidden={display === null}
          data-blank={display === null || undefined}
          className="sidebar-chrono-digits"
        >
          {display ?? CHRONO_NO_SEGMENTS}
        </span>
      </div>
    </div>
  );
});
