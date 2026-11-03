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

// DSEG draws "!" as a digit with no segments lit, and a space as an unlit colon.
const CHRONO_NO_SEGMENTS = "!! !! !!";

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
      <div className="flex flex-col items-center justify-between gap-1 px-1.5">
        <span
          aria-hidden
          className="sidebar-chrono-label mt-0.5 font-semibold text-3xs text-sidebar-muted-foreground tracking-wider"
        >
          {state.phase === "stopped" ? "RST" : "CHR"}
        </span>
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                aria-label={actionLabel}
                onClick={press}
                className="sidebar-chrono-button size-6 shrink-0 rounded-full focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
              />
            }
          />
          <TooltipPopup side="top">{actionLabel}</TooltipPopup>
        </Tooltip>
      </div>
      <div className="sidebar-chrono-display flex min-w-0 flex-1 items-center justify-center rounded-sm">
        <span role="timer" aria-hidden={display === null} className="sidebar-chrono-digits">
          {display ?? CHRONO_NO_SEGMENTS}
        </span>
      </div>
    </div>
  );
});
