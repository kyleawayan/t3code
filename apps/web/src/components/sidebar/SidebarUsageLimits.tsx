import { useAtomValue } from "@effect/atom-react";
import { Link } from "@tanstack/react-router";
import { collectLimitAccounts } from "@t3tools/shared/usageLimits";
import { useMemo } from "react";

import { useNowMinute } from "../../hooks/useNowMinute";
import { environmentPresentations } from "../../state/presentation";
import { useSidebar } from "../ui/sidebar";
import { UsageLimitsPooled } from "../usage/UsageLimitsPooled";
import { UsageBudgetProgress } from "../usage/UsageBudget";
import { useUsageBudget } from "../usage/useUsageBudget";
import { useDevSubscriptionPreview } from "../usage/subscriptionPreview";
import { readUsagePagePreferences, saveUsagePagePreferences } from "../usage/usagePagePreferences";

export function SidebarUsageLimits() {
  const presentations = useAtomValue(environmentPresentations.presentationsAtom);
  const { isMobile, setOpenMobile } = useSidebar();
  const [dailyBudgetUsd] = useUsageBudget("day");
  const [monthlyBudgetUsd] = useUsageBudget("month");
  const [previewSubscriptions] = useDevSubscriptionPreview();
  const eligible = useMemo(
    () =>
      new Map(
        [...presentations].map(([id, presentation]) => [
          id,
          {
            ...presentation,
            serverConfig: presentation.serverConfig
              ? {
                  ...presentation.serverConfig,
                  providers: presentation.serverConfig.providers.filter(
                    (provider) => provider.auth.type !== "apiKey",
                  ),
                }
              : null,
          },
        ]),
      ),
    [presentations],
  );
  const nowMinute = useNowMinute();
  const now = Date.parse(`${nowMinute}:00Z`);
  const hasLimits = previewSubscriptions || collectLimitAccounts(eligible).length > 0;
  const hasBudget = dailyBudgetUsd !== null || monthlyBudgetUsd !== null;
  if (!hasLimits && !hasBudget) return null;

  return (
    <section
      aria-label="Usage"
      className="min-h-0 overflow-y-auto px-[var(--sidebar-row-content-inset)] pb-2"
    >
      {hasLimits ? (
        <>
          <Link
            to="/usage"
            onClick={() => {
              saveUsagePagePreferences({ ...readUsagePagePreferences(), metric: "limits" });
              if (isMobile) setOpenMobile(false);
            }}
            className="mb-2 flex rounded-sm text-xs font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            Usage limits
          </Link>
          <UsageLimitsPooled presentations={eligible} now={now} compact />
        </>
      ) : null}
      {hasBudget ? (
        <div className={hasLimits ? "mt-3" : undefined}>
          <Link
            to="/usage"
            onClick={() => {
              saveUsagePagePreferences({ ...readUsagePagePreferences(), metric: "cost" });
              if (isMobile) setOpenMobile(false);
            }}
            className="mb-2 flex rounded-sm text-xs font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            API budgets
          </Link>
          <div className="flex flex-col gap-1.5">
            {dailyBudgetUsd !== null ? (
              <UsageBudgetProgress budgetUsd={dailyBudgetUsd} period="day" compact />
            ) : null}
            {monthlyBudgetUsd !== null ? (
              <UsageBudgetProgress budgetUsd={monthlyBudgetUsd} period="month" compact />
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
