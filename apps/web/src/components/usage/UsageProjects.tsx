import type { UsageProviderKind, UsageSummaryInput } from "@t3tools/contracts";
import { useState } from "react";
import { formatCount, formatPercent, formatTokens, formatUsd } from "@t3tools/shared/usageFormat";
import type { MergedUsage } from "@t3tools/shared/usageMerge";

import { cn } from "../../lib/utils";
import { useProjects, useThreadShells } from "../../state/entities";
import type { EnvironmentUsageStatus } from "../../state/usage";
import { UsageProjectChart, UsageProjectSparkline } from "./UsageProjectChart";
import { PROVIDER_ORDER, PROVIDER_PRESENTATION } from "./usageProviders";
import { buildUsageProjectSeries, buildUsageProjectTable } from "./usageProjectRows";

const PROJECT_SERIES_COLORS = [1, 2, 3, 4, 5, 6, 7, 8].map(
  (slot) => `var(--usage-project-${slot})`,
);
// A focused project past the palette draws in ink, apart from every palette hue and Other's gray.
const FOCUSED_SERIES_COLOR = "var(--foreground)";
const OTHER_SERIES_COLOR = "color-mix(in oklab, var(--muted-foreground) 70%, transparent)";
const UNCHARTED_SPARKLINE_COLOR = "var(--muted-foreground)";

function figureClass(loading: boolean) {
  return cn("transition-opacity", loading && "opacity-40 delay-150");
}

/** Fork: the Usage page's Projects tab, cost and tokens per project for the window. */
export function UsageProjectsOverview({
  merged,
  selectedEnvironments,
  hiddenProviders,
  loading,
  shownWindow,
  days,
  hours,
  hour12,
}: {
  readonly merged: MergedUsage;
  readonly shownWindow: UsageSummaryInput;
  readonly days: readonly string[];
  readonly hours: readonly string[];
  readonly hour12: boolean;
  readonly selectedEnvironments: readonly EnvironmentUsageStatus[];
  readonly hiddenProviders: ReadonlySet<UsageProviderKind>;
  readonly loading: boolean;
}) {
  const projects = useProjects();
  // Clicking a project or legend entry emphasizes its series; clicking it again clears that.
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const toggleFocus = (key: string) => setFocusedKey((current) => (current === key ? null : key));
  const threadShells = useThreadShells();
  // A period change keeps the old total on screen while the new summaries load.
  const summariesLoading = selectedEnvironments.some(
    (environment) => environment.summary === null && environment.isPending,
  );
  // The page total skips environments with an incompatible contract or only duplicate sources.
  const contributing = new Set(merged.contributingEnvironments);
  const { rows, unfiledCostUsd, unfiledTokens } = buildUsageProjectTable({
    sources: selectedEnvironments.flatMap((environment) =>
      environment.summary === null || !contributing.has(environment.environmentId)
        ? []
        : [
            {
              environmentId: environment.environmentId,
              environmentLabel: environment.label,
              totals: environment.summary.projects ?? [],
              periods: environment.summary.projectPeriods ?? [],
              buckets: environment.summary.buckets,
            },
          ],
    ),
    projects,
    worktrees: threadShells.flatMap((thread) =>
      thread.worktreePath === null
        ? []
        : [
            {
              environmentId: thread.environmentId,
              projectId: thread.projectId,
              path: thread.worktreePath,
            },
          ],
    ),
    hiddenProviders,
  });
  const showUnfiled = unfiledCostUsd >= 0.005 || unfiledTokens > 0;
  // The total and shares come from the table's own rows, so the shares add up to 100%.
  const tableCostUsd = rows.reduce((sum, row) => sum + row.costUsd, 0) + unfiledCostUsd;
  const peakCostUsd = rows.reduce((peak, row) => Math.max(peak, row.costUsd), 0);
  const showEnvironment = selectedEnvironments.length > 1;
  const dimmed = loading || summariesLoading;
  const shownHourly = shownWindow.resolution === "hour";
  const periods = shownHourly ? hours : days;
  const series = (
    summariesLoading
      ? []
      : buildUsageProjectSeries(rows, periods, PROJECT_SERIES_COLORS.length, focusedKey)
  ).map((entry) => ({
    ...entry,
    color: entry.other
      ? OTHER_SERIES_COLOR
      : entry.slot === null
        ? FOCUSED_SERIES_COLOR
        : (PROJECT_SERIES_COLORS[entry.slot] ?? OTHER_SERIES_COLOR),
  }));
  const seriesColor = new Map(series.map((entry) => [entry.key, entry.color]));
  const showTrend = series.length > 0;

  return (
    <div aria-busy={dimmed} className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <span
          className={cn("text-4xl font-semibold text-foreground tabular-nums", figureClass(dimmed))}
        >
          {formatUsd(summariesLoading ? merged.costUsd : tableCostUsd)}
        </span>
        <span className={cn("text-xs text-muted-foreground", figureClass(dimmed))}>
          {summariesLoading
            ? "Loading projects"
            : `${formatCount(rows.length)} ${rows.length === 1 ? "project" : "projects"}`}
          {" · API estimate"}
        </span>
      </div>

      {series.length === 0 ? null : (
        <section className={cn("flex min-w-0 flex-col gap-3", figureClass(loading))}>
          <h2 className="text-sm font-medium text-foreground">
            {shownHourly ? "Hourly" : "Daily"} cost by project
          </h2>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {series.map((entry) => (
              <li key={entry.key} className="flex min-w-0">
                <button
                  type="button"
                  aria-pressed={focusedKey === entry.key}
                  onClick={() => toggleFocus(entry.key)}
                  className={cn(
                    "flex min-w-0 cursor-pointer items-center gap-1.5 rounded-sm hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring",
                    focusedKey === entry.key && "text-foreground",
                  )}
                >
                  <span
                    aria-hidden
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: entry.color }}
                  />
                  <span className="truncate">{entry.label}</span>
                </button>
              </li>
            ))}
          </ul>
          <UsageProjectChart
            series={series}
            periods={periods}
            resolution={shownHourly ? "hour" : "day"}
            timeZone={shownWindow.timeZone}
            hour12={hour12}
            referenceTime={shownWindow.untilTime}
            focusedKey={focusedKey}
          />
        </section>
      )}

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-right text-xs text-muted-foreground">
            <th className="py-2 pr-3 pl-2 text-left font-normal">#</th>
            <th className="w-full py-2 text-left font-normal">Project</th>
            {showTrend ? (
              <th className="hidden py-2 pl-6 text-left font-normal sm:table-cell">Trend</th>
            ) : null}
            <th className="py-2 pl-6 font-normal">Cost</th>
            <th className="hidden py-2 pl-6 font-normal sm:table-cell">Share</th>
            <th className="py-2 pr-2 pl-6 font-normal">Tokens</th>
          </tr>
        </thead>
        <tbody className={figureClass(loading)}>
          {summariesLoading || (rows.length === 0 && !showUnfiled) ? (
            <tr>
              <td colSpan={showTrend ? 6 : 5} className="py-6 text-center text-muted-foreground">
                {summariesLoading ? "Loading projects…" : "No activity in this window."}
              </td>
            </tr>
          ) : null}
          {(summariesLoading ? [] : rows).map((row, index) => (
            <tr
              key={row.key}
              className={cn(
                "border-b border-border/50 text-right whitespace-nowrap text-muted-foreground tabular-nums",
                focusedKey === row.key && "bg-accent/60",
              )}
            >
              <td className="py-2.5 pr-3 pl-2 text-left align-top text-xs">{index + 1}</td>
              <td className="max-w-0 py-2.5 text-left">
                <button
                  type="button"
                  aria-pressed={focusedKey === row.key}
                  aria-label={`Show ${row.label} on the chart`}
                  disabled={!showTrend || row.costByPeriod.size === 0}
                  onClick={() => toggleFocus(row.key)}
                  className="block w-full min-w-0 cursor-pointer text-left focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-default"
                >
                  <div className="flex items-center gap-1.5">
                    {seriesColor.has(row.key) ? (
                      <span
                        aria-hidden
                        className="size-2 shrink-0 rounded-full"
                        style={{ backgroundColor: seriesColor.get(row.key) }}
                      />
                    ) : null}
                    <span className="truncate text-foreground">{row.label}</span>
                  </div>
                  <div className="truncate text-xs">
                    {showEnvironment ? `${row.environmentLabel} · ${row.path}` : row.path}
                  </div>
                  {row.costUsd > 0 && peakCostUsd > 0 ? (
                    <div aria-hidden className="mt-1.5 h-0.5 max-w-48">
                      <div
                        className="flex h-full gap-px"
                        style={{ width: `max(0.5rem, ${(row.costUsd / peakCostUsd) * 100}%)` }}
                      >
                        {PROVIDER_ORDER.map((provider) => {
                          const costUsd = row.costByProvider.get(provider) ?? 0;
                          return costUsd > 0 ? (
                            <div
                              key={provider}
                              className="h-full rounded-full"
                              style={{
                                flexGrow: costUsd,
                                backgroundColor: PROVIDER_PRESENTATION[provider].color,
                              }}
                            />
                          ) : null;
                        })}
                      </div>
                    </div>
                  ) : null}
                </button>
              </td>
              {showTrend ? (
                <td className="hidden py-2.5 pl-6 align-top sm:table-cell">
                  {row.costByPeriod.size > 0 ? (
                    <UsageProjectSparkline
                      values={periods.map((period) => row.costByPeriod.get(period) ?? 0)}
                      color={seriesColor.get(row.key) ?? UNCHARTED_SPARKLINE_COLOR}
                    />
                  ) : null}
                </td>
              ) : null}
              <td className="py-2.5 pl-6 align-top text-foreground">{formatUsd(row.costUsd)}</td>
              <td className="hidden py-2.5 pl-6 align-top sm:table-cell">
                {tableCostUsd > 0 ? formatPercent(row.costUsd / tableCostUsd) : ""}
              </td>
              <td className="py-2.5 pr-2 pl-6 align-top">{formatTokens(row.totalTokens)}</td>
            </tr>
          ))}
          {showUnfiled && !summariesLoading ? (
            <tr className="border-b border-border/50 text-right whitespace-nowrap text-muted-foreground tabular-nums">
              <td className="py-2.5 pr-3 pl-2 text-left align-top text-xs" />
              <td className="max-w-0 py-2.5 text-left">
                <div className="truncate text-foreground">No folder</div>
                <div className="truncate text-xs">Providers that don't record one</div>
              </td>
              {showTrend ? <td className="hidden sm:table-cell" /> : null}
              <td className="py-2.5 pl-6 align-top text-foreground">{formatUsd(unfiledCostUsd)}</td>
              <td className="hidden py-2.5 pl-6 align-top sm:table-cell">
                {tableCostUsd > 0 ? formatPercent(unfiledCostUsd / tableCostUsd) : ""}
              </td>
              <td className="py-2.5 pr-2 pl-6 align-top">{formatTokens(unfiledTokens)}</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
