import type { UsageProviderKind } from "@t3tools/contracts";
import { formatCount, formatPercent, formatTokens, formatUsd } from "@t3tools/shared/usageFormat";
import type { MergedUsage } from "@t3tools/shared/usageMerge";

import { cn } from "../../lib/utils";
import { useProjects, useThreadShells } from "../../state/entities";
import type { EnvironmentUsageStatus } from "../../state/usage";
import { PROVIDER_ORDER, PROVIDER_PRESENTATION } from "./usageProviders";
import { buildUsageProjectTable } from "./usageProjectRows";

function figureClass(loading: boolean) {
  return cn("transition-opacity", loading && "opacity-40 delay-150");
}

/** Fork: the Usage page's Projects tab, cost and tokens per project for the window. */
export function UsageProjectsOverview({
  merged,
  selectedEnvironments,
  hiddenProviders,
  loading,
}: {
  readonly merged: MergedUsage;
  readonly selectedEnvironments: readonly EnvironmentUsageStatus[];
  readonly hiddenProviders: ReadonlySet<UsageProviderKind>;
  readonly loading: boolean;
}) {
  const projects = useProjects();
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

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-right text-xs text-muted-foreground">
            <th className="py-2 pr-3 pl-2 text-left font-normal">#</th>
            <th className="w-full py-2 text-left font-normal">Project</th>
            <th className="py-2 pl-6 font-normal">Cost</th>
            <th className="hidden py-2 pl-6 font-normal sm:table-cell">Share</th>
            <th className="py-2 pr-2 pl-6 font-normal">Tokens</th>
          </tr>
        </thead>
        <tbody className={figureClass(loading)}>
          {summariesLoading || (rows.length === 0 && !showUnfiled) ? (
            <tr>
              <td colSpan={5} className="py-6 text-center text-muted-foreground">
                {summariesLoading ? "Loading projects…" : "No activity in this window."}
              </td>
            </tr>
          ) : null}
          {(summariesLoading ? [] : rows).map((row, index) => (
            <tr
              key={row.key}
              className="border-b border-border/50 text-right whitespace-nowrap text-muted-foreground tabular-nums"
            >
              <td className="py-2.5 pr-3 pl-2 text-left align-top text-xs">{index + 1}</td>
              <td className="max-w-0 py-2.5 text-left">
                <div className="truncate text-foreground">{row.label}</div>
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
              </td>
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
