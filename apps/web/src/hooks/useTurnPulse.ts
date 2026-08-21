import { useEffect, useMemo, useState } from "react";
import type { ScopedThreadRef, ThreadTurnActivity } from "@t3tools/contracts";

import { useEnvironmentQuery } from "../state/query";
import { threadEnvironment } from "../state/threads";
import {
  resolveTurnPulse,
  TURN_PULSE_WARN_AFTER_MS,
  type TurnPulseVerdict,
} from "../components/chat/turnPulse.logic";

const HIDDEN: TurnPulseVerdict = { kind: "hidden" };
/**
 * Re-evaluation cadence while a turn is live. Only fast enough to notice the
 * warning threshold passing — the pulse itself moves on server updates, not on
 * this timer, so nothing here animates anything.
 */
const TICK_MS = 1_000;

/**
 * Live liveness for one thread's running turn.
 *
 * The subscription is environment-wide and shared, so opening a second thread
 * costs nothing; this hook just selects one thread out of it and re-checks the
 * quiet window on a slow timer. When no turn is running the timer does not run
 * at all.
 */
export function useTurnPulse(threadRef: ScopedThreadRef | null): TurnPulseVerdict {
  const activityQuery = useEnvironmentQuery(
    threadRef === null
      ? null
      : threadEnvironment.turnActivity({ environmentId: threadRef.environmentId, input: {} }),
  );
  const activity: ThreadTurnActivity | undefined =
    threadRef === null ? undefined : (activityQuery.data?.[threadRef.threadId] ?? undefined);

  const [nowMs, setNowMs] = useState(() => Date.now());
  const live = activity !== undefined && activity.state !== "idle";
  useEffect(() => {
    if (!live) return;
    const id = window.setInterval(() => setNowMs(Date.now()), TICK_MS);
    return () => window.clearInterval(id);
  }, [live]);

  return useMemo(
    () =>
      activity === undefined
        ? HIDDEN
        : resolveTurnPulse({ activity, nowMs, warnAfterMs: TURN_PULSE_WARN_AFTER_MS }),
    [activity, nowMs],
  );
}
