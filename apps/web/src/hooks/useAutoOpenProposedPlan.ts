import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { useEffect, useEffectEvent, useRef } from "react";

import { useRightPanelStore } from "../rightPanelStore";

/**
 * A plan opens on its own only when it came from a run seen working in this visit, so opening a
 * thread doesn't reopen an old plan, and each plan opens once. Run ids avoid comparing the
 * server's timestamps with the client's clock.
 */
export function shouldAutoOpenProposedPlan(input: {
  readonly planId: string;
  readonly planRunId: string | null;
  readonly watchedRunIds: ReadonlySet<string>;
  readonly openedPlanIds: ReadonlySet<string>;
}): boolean {
  return (
    input.planRunId !== null &&
    input.watchedRunIds.has(input.planRunId) &&
    !input.openedPlanIds.has(input.planId)
  );
}

/** Fork: a plan the agent proposes while its thread is open shows in the right pane. */
export function useAutoOpenProposedPlan(input: {
  readonly threadRef: ScopedThreadRef | null;
  readonly latestRunId: string | null;
  readonly latestRunSettled: boolean;
  readonly plan: { readonly id: string; readonly runId: string | null } | null;
}): void {
  const { threadRef, latestRunId, latestRunSettled } = input;
  const threadKey = threadRef ? scopedThreadKey(threadRef) : null;
  const sessionRef = useRef({
    threadKey: null as string | null,
    watchedRunIds: new Set<string>(),
    openedPlanIds: new Set<string>(),
  });
  const open = useEffectEvent((planId: string) => {
    if (threadRef) useRightPanelStore.getState().autoOpenProposedPlan(threadRef, planId);
  });
  const planId = input.plan?.id ?? null;
  const planRunId = input.plan?.runId ?? null;

  // oxlint-disable-next-line t3code/react-effect-budget -- opens a panel tab when a watched run settles.
  useEffect(() => {
    if (sessionRef.current.threadKey !== threadKey) {
      sessionRef.current = { threadKey, watchedRunIds: new Set(), openedPlanIds: new Set() };
    }
    const session = sessionRef.current;
    if (latestRunId !== null && !latestRunSettled) session.watchedRunIds.add(latestRunId);
    if (threadKey === null || planId === null) return;
    if (
      !shouldAutoOpenProposedPlan({
        planId,
        planRunId,
        watchedRunIds: session.watchedRunIds,
        openedPlanIds: session.openedPlanIds,
      })
    ) {
      return;
    }
    session.openedPlanIds.add(planId);
    open(planId);
  }, [threadKey, latestRunId, latestRunSettled, planId, planRunId]);
}
