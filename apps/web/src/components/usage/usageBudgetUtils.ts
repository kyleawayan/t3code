import { UsageDay, type UsageProviderKind } from "@t3tools/contracts";
import { makeWindow } from "@t3tools/shared/usageFormat";
import * as Schema from "effect/Schema";

export const USAGE_BUDGET_STORAGE_KEY = "t3code:usage-budget:v1";
export const DAILY_USAGE_BUDGET_STORAGE_KEY = "t3code:usage-budget:day:v1";
export type UsageBudgetPeriod = "day" | "month";
export const UsageBudgetSchema = Schema.NullOr(
  Schema.Number.check(Schema.isFinite(), Schema.isGreaterThanOrEqualTo(0.01)),
);
const isUsageBudget = Schema.is(UsageBudgetSchema);

export function parseUsageBudget(value: string): number | null {
  const trimmed = value.trim();
  if (!/^(?:\d+(?:\.\d{0,2})?|\.\d{1,2})$/.test(trimmed)) return null;
  const amount = Number(trimmed);
  return isUsageBudget(amount) ? amount : null;
}

export function makeUsageBudgetWindow(period: UsageBudgetPeriod, now = new Date()) {
  const window = makeWindow(1, now);
  return period === "day"
    ? window
    : { ...window, sinceDay: UsageDay.make(`${window.untilDay.slice(0, 7)}-01`) };
}

export function nextUsageBudgetReset(period: UsageBudgetPeriod, now = new Date()) {
  const reset = new Date(now);
  reset.setHours(0, 0, 0, 0);
  if (period === "day") reset.setDate(reset.getDate() + 1);
  else {
    reset.setDate(1);
    reset.setMonth(reset.getMonth() + 1);
  }
  return reset.getTime();
}

export function usageBudgetProgress(costUsd: number, budgetUsd: number) {
  const usedPercent = Math.max(0, (costUsd / budgetUsd) * 100);
  return {
    usedPercent,
    fillPercent: Math.min(100, usedPercent),
    overBudget: costUsd > budgetUsd,
    reachedBudget: costUsd >= budgetUsd,
  };
}

export const USAGE_BUDGET_PROVIDERS = {
  claude: { label: "Claude", color: "#d97757" },
  codex: { label: "Codex", color: "#3b82f6" },
  grok: { label: "Grok", color: "#94a3b8" },
} satisfies Record<UsageProviderKind, { label: string; color: string }>;

export function usageBudgetSegments(
  providers: readonly { provider: UsageProviderKind; costUsd: number }[],
  budgetUsd: number,
) {
  const total = providers.reduce((sum, provider) => sum + provider.costUsd, 0);
  const scale = Math.max(budgetUsd, total);
  return (Object.keys(USAGE_BUDGET_PROVIDERS) as UsageProviderKind[]).flatMap((provider) => {
    const cost = providers.find((entry) => entry.provider === provider)?.costUsd ?? 0;
    return cost > 0
      ? [
          {
            provider,
            ...USAGE_BUDGET_PROVIDERS[provider],
            widthPercent: (cost / scale) * 100,
            costSharePercent: (cost / total) * 100,
          },
        ]
      : [];
  });
}
