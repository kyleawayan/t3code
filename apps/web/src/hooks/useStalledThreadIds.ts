import { useEffect, useMemo, useState } from "react";
import type { EnvironmentId } from "@t3tools/contracts";

import { useEnvironmentQuery } from "../state/query";
import { threadEnvironment } from "../state/threads";
import {
  resolveTurnPulse,
  TURN_PULSE_QUIET_WARN_AFTER_MS,
  TURN_PULSE_WARN_AFTER_MS,
} from "../components/chat/turnPulse.logic";

const EMPTY: ReadonlySet<string> = new Set();
const TICK_MS = 1_000;

/**
 * Threads in one environment whose running turn has gone quiet.
 *
 * The same verdict the open thread's pulse uses, for the threads you are not
 * looking at — which is where it matters most if you keep several running. The
 * subscription is environment-wide and shared with the pulse, so this costs one
 * derived set rather than a second stream, and the timer only runs while some
 * turn is actually live.
 */
export function useStalledThreadIds(environmentId: EnvironmentId | null): ReadonlySet<string> {
  const activityQuery = useEnvironmentQuery(
    environmentId === null ? null : threadEnvironment.turnActivity({ environmentId, input: {} }),
  );
  const activityByThreadId = activityQuery.data ?? null;

  const [nowMs, setNowMs] = useState(() => Date.now());
  const live = activityByThreadId !== null && Object.keys(activityByThreadId).length > 0;
  useEffect(() => {
    if (!live) return;
    const id = window.setInterval(() => setNowMs(Date.now()), TICK_MS);
    return () => window.clearInterval(id);
  }, [live]);

  return useMemo(() => {
    if (!activityByThreadId) return EMPTY;
    const stalled = new Set<string>();
    for (const [threadId, activity] of Object.entries(activityByThreadId)) {
      const verdict = resolveTurnPulse({
        activity,
        nowMs,
        warnAfterMs: TURN_PULSE_WARN_AFTER_MS,
        quietWarnAfterMs: TURN_PULSE_QUIET_WARN_AFTER_MS,
      });
      if (verdict.kind === "stalled") stalled.add(threadId);
    }
    return stalled;
  }, [activityByThreadId, nowMs]);
}
