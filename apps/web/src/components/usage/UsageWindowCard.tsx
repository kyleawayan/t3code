import type { ReactNode } from "react";

import { cn } from "../../lib/utils";

export function UsageWindowCard({
  label,
  remainingPercent,
  remainingPrefix = "",
  detail,
  status,
  compact = false,
  children,
}: {
  label: string;
  remainingPercent: number;
  remainingPrefix?: string;
  detail?: ReactNode;
  status?: ReactNode;
  compact?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "grid items-center rounded-lg border border-border/60",
        compact ? "gap-1.5 p-2" : "gap-x-6 gap-y-3 p-4 md:grid-cols-[11rem_minmax(0,1fr)]",
      )}
    >
      <div
        className={cn("flex gap-1", compact ? "flex-row items-center justify-between" : "flex-col")}
      >
        <span
          className={cn(
            "font-medium text-foreground",
            compact ? "min-w-0 truncate text-xs" : "text-sm",
          )}
        >
          {label}
        </span>
        <span className={cn("flex shrink-0 items-baseline", compact ? "gap-1" : "gap-2")}>
          <span
            className={cn(
              "font-semibold text-foreground tabular-nums",
              compact ? "text-xs" : "text-3xl",
            )}
          >{`${remainingPrefix}${remainingPercent}%`}</span>
          <span className={cn("text-muted-foreground", compact ? "text-xs" : "text-sm")}>left</span>
          {!compact ? status : null}
        </span>
        {!compact && detail ? (
          <span className="w-full text-xs text-muted-foreground tabular-nums">{detail}</span>
        ) : null}
      </div>
      {compact && (detail || status) ? (
        <div className="flex items-center justify-between gap-1 text-[11px] text-muted-foreground tabular-nums">
          <span>{detail}</span>
          {status}
        </div>
      ) : null}
      {children}
    </div>
  );
}
