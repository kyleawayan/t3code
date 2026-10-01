import { USAGE_CONTRACT_VERSION } from "@t3tools/contracts";
import { isCompatibleUsageContractVersion } from "@t3tools/shared/usageMerge";
import { formatUsd } from "@t3tools/shared/usageFormat";
import { formatDuration } from "@t3tools/shared/usageLimits";
import { useId, useState } from "react";

import { useNowMinute } from "../../hooks/useNowMinute";
import { cn } from "../../lib/utils";
import { useUsage } from "../../state/usage";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
  makeUsageBudgetWindow,
  nextUsageBudgetReset,
  parseUsageBudget,
  usageBudgetProgress,
  usageBudgetSegments,
  type UsageBudgetPeriod,
} from "./usageBudgetUtils";
import { useUsageBudget } from "./useUsageBudget";
import { UsageWindowCard } from "./UsageWindowCard";

export function UsageBudgetProgress({
  budgetUsd,
  period = "month",
  compact = false,
}: {
  budgetUsd: number;
  period?: UsageBudgetPeriod;
  compact?: boolean;
}) {
  const nowMinute = useNowMinute();
  const now = new Date(`${nowMinute}:00Z`);
  const window = makeUsageBudgetWindow(period, now);
  const { merged, environments, isPending, isPartial } = useUsage(window);
  const available = environments.some(
    ({ summary }) =>
      summary !== null &&
      isCompatibleUsageContractVersion(summary.contractVersion, USAGE_CONTRACT_VERSION),
  );
  if (isPending || !available) {
    return (
      <p className="text-xs text-muted-foreground" role="status">
        {isPending ? "Loading budget usage…" : "Budget usage unavailable"}
      </p>
    );
  }
  const incomplete =
    isPartial ||
    environments.some(({ error }) => error !== null) ||
    merged.staleEnvironments.length > 0 ||
    merged.costQuality.unpricedShare > 0 ||
    environments.some(
      ({ summary }) =>
        summary !== null &&
        !isCompatibleUsageContractVersion(summary.contractVersion, USAGE_CONTRACT_VERSION),
    );
  const progress = usageBudgetProgress(merged.costUsd, budgetUsd);
  const segments = usageBudgetSegments(merged.providers, budgetUsd);
  const providerShares = segments
    .map(
      (segment) => `${segment.label}: ${Math.round(segment.costSharePercent)}% of estimated cost`,
    )
    .join(", ");
  const label = progress.overBudget
    ? "Over budget"
    : progress.reachedBudget
      ? "Budget reached"
      : `${incomplete ? "Up to " : ""}${progress.remainingPercent}% left`;
  const resetCountdown = formatDuration(nextUsageBudgetReset(period, now) - now.getTime());
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <UsageWindowCard
        label={period === "day" ? "Today" : "This month"}
        remainingPercent={progress.remainingPercent}
        remainingPrefix={incomplete ? "≤" : ""}
        compact={compact}
        detail={`↻ ${compact ? "" : "in "}${resetCountdown}`}
        status={
          progress.reachedBudget ? <span className="text-xs text-warning">{label}</span> : null
        }
      >
        <div className="@container/pool min-w-0">
          <div
            role="progressbar"
            aria-label={`${period === "day" ? "Daily" : "Monthly"} API budget used`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress.usedPercent}
            aria-valuetext={[label, providerShares].filter(Boolean).join(". ")}
            className={cn(
              "relative flex overflow-hidden rounded-md bg-muted",
              compact ? "h-2" : "h-5 @2xl/pool:h-8",
            )}
          >
            <div className="relative h-full w-full opacity-35">
              {segments.map((segment, index) => (
                <div
                  key={segment.provider}
                  className="absolute inset-y-0 left-0 rounded-md"
                  style={{
                    width: `${segments.slice(0, index + 1).reduce((sum, entry) => sum + entry.widthPercent, 0)}%`,
                    backgroundColor: segment.color,
                    zIndex: segments.length - index,
                  }}
                />
              ))}
            </div>
            {progress.usedPercent < 100 ? (
              <div
                aria-hidden
                className="absolute inset-y-0 right-0 opacity-20"
                style={{
                  width: `${100 - progress.usedPercent}%`,
                  backgroundImage:
                    "repeating-linear-gradient(135deg, var(--foreground) 0 1px, transparent 1px 5px)",
                }}
              />
            ) : null}
          </div>
        </div>
      </UsageWindowCard>
      {!compact ? (
        <>
          <p className="text-xs text-muted-foreground tabular-nums">
            {incomplete ? "At least " : ""}
            {formatUsd(merged.costUsd)} of {formatUsd(budgetUsd)} estimated
          </p>
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            {segments.map((segment) => (
              <span key={segment.provider} className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="size-2 rounded-sm"
                  style={{ backgroundColor: segment.color }}
                />
                {segment.label} {Math.round(segment.costSharePercent)}%
              </span>
            ))}
          </div>
        </>
      ) : null}
      {incomplete ? <p className="text-[11px] text-muted-foreground">Partial estimate</p> : null}
    </div>
  );
}

export function UsageBudget({ period = "month" }: { period?: UsageBudgetPeriod }) {
  const [budgetUsd, setBudgetUsd] = useUsageBudget(period);
  const [draft, setDraft] = useState<string | null>(null);
  const inputId = useId();
  const descriptionId = useId();
  const amount = draft ?? budgetUsd?.toString() ?? "";
  const parsed = parseUsageBudget(amount);
  const periodLabel = period === "day" ? "Daily" : "Monthly";

  return (
    <section aria-label={`${periodLabel} API budget`} className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-medium text-foreground">{periodLabel} API budget</h2>
        <p id={descriptionId} className="text-xs text-muted-foreground">
          Track API-equivalent estimates across all environments, including subscriptions. Saved on
          this device.{" "}
          {period === "day" ? "Resets at local midnight." : "Resets on the first of each month."}
        </p>
      </div>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (parsed === null) return;
          setBudgetUsd(parsed);
          setDraft(null);
        }}
      >
        <div className="flex w-40 flex-col gap-1.5">
          <Label htmlFor={inputId} className="text-xs">
            {periodLabel} budget (USD)
          </Label>
          <Input
            id={inputId}
            aria-describedby={descriptionId}
            type="number"
            inputMode="decimal"
            min="0.01"
            step="0.01"
            placeholder="100.00"
            value={amount}
            onChange={(event) => setDraft(event.target.value)}
          />
        </div>
        <Button type="submit" size="sm" disabled={parsed === null || parsed === budgetUsd}>
          {budgetUsd === null ? "Set budget" : "Save budget"}
        </Button>
        {budgetUsd !== null ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setBudgetUsd(null);
              setDraft(null);
            }}
          >
            Remove budget
          </Button>
        ) : null}
      </form>
      {budgetUsd !== null ? <UsageBudgetProgress budgetUsd={budgetUsd} period={period} /> : null}
    </section>
  );
}
