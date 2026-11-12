import {
  formatDayShort,
  formatHourShort,
  formatRelativeHourShort,
  formatUsd,
} from "@t3tools/shared/usageFormat";
import { useLayoutEffect, useRef, useState } from "react";

import { observeResize } from "~/lib/observeResize";
import {
  areaPath,
  curvePath,
  niceScale,
  PLOT_TOP,
  smoothCurve,
  TICK_COUNT,
  valueToY,
  VIEW_HEIGHT,
  VIEW_WIDTH,
} from "./UsageProviderChart";

export interface UsageProjectChartSeries {
  readonly key: string;
  readonly label: string;
  readonly color: string;
  /** One value per period, in period order. */
  readonly values: readonly number[];
}

/** Fork: the Projects tab's cost over time, one layered series per project, styled like the provider chart. */
export function UsageProjectChart({
  series,
  periods,
  resolution,
  timeZone,
  hour12,
  referenceTime,
  focusedKey,
}: {
  readonly series: readonly UsageProjectChartSeries[];
  readonly periods: readonly string[];
  readonly resolution: "day" | "hour";
  readonly timeZone: string;
  readonly hour12: boolean;
  readonly referenceTime: string | undefined;
  /** Emphasized over the other series, which dim. */
  readonly focusedKey: string | null;
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const plotRef = useRef<HTMLDivElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const hoverPositionRef = useRef<{ x: number; y: number } | null>(null);

  // Layered series each start at zero, so the scale follows the tallest single value.
  const peak = series.reduce((max, entry) => Math.max(max, ...entry.values), 0);
  const scale = niceScale(peak, TICK_COUNT);
  const stepX = periods.length < 2 ? 0 : VIEW_WIDTH / (periods.length - 1);
  const toY = (value: number) => valueToY(value, scale.max);
  const paths = series.map((entry) => {
    const line = curvePath(
      smoothCurve(entry.values.map((value, index) => ({ x: index * stepX, y: toY(value) }))),
    );
    return { ...entry, line, area: areaPath(line) };
  });
  const focused = focusedKey !== null && series.some((entry) => entry.key === focusedKey);
  // The focused series paints last, so it sits on top of the dimmed ones.
  const painted = focused
    ? [
        ...paths.filter((path) => path.key !== focusedKey),
        ...paths.filter((path) => path.key === focusedKey),
      ]
    : paths;
  const emphasis = (key: string) =>
    !focused ? "normal" : key === focusedKey ? "focused" : "dimmed";
  const formatPeriod = (period: string) =>
    resolution === "hour" ? formatHourShort(period, timeZone, hour12) : formatDayShort(period);
  const formatTooltipPeriod = (period: string) =>
    resolution === "hour" && referenceTime !== undefined
      ? formatRelativeHourShort(period, referenceTime, timeZone, hour12)
      : formatPeriod(period);

  const positionTooltip = () => {
    const plot = plotRef.current;
    const tooltip = tooltipRef.current;
    const hover = hoverPositionRef.current;
    if (plot === null || tooltip === null || hover === null) return;
    const gap = 12;
    const width = tooltip.offsetWidth;
    const height = tooltip.offsetHeight;
    const left = hover.x + gap + width <= plot.clientWidth ? hover.x + gap : hover.x - gap - width;
    const top =
      hover.y + gap + height <= plot.clientHeight ? hover.y + gap : hover.y - gap - height;
    plot.style.setProperty(
      "--usage-tooltip-left",
      `${Math.min(Math.max(0, left), Math.max(0, plot.clientWidth - width))}px`,
    );
    plot.style.setProperty(
      "--usage-tooltip-top",
      `${Math.min(Math.max(0, top), Math.max(0, plot.clientHeight - height))}px`,
    );
  };

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- positions the hover tooltip through plot CSS variables before paint and on ResizeObserver
  useLayoutEffect(() => {
    if (hoverIndex === null) return;
    positionTooltip();
    const plot = plotRef.current;
    const tooltip = tooltipRef.current;
    if (plot === null || tooltip === null) return;
    return observeResize([plot, tooltip], positionTooltip);
  }, [hoverIndex, positionTooltip]);

  const hoveredPeriod = hoverIndex === null ? undefined : periods[hoverIndex];
  const hovered =
    hoverIndex === null
      ? []
      : series
          .map((entry) => ({ ...entry, value: entry.values[hoverIndex] ?? 0 }))
          .toSorted((a, b) => b.value - a.value);
  const middle = periods[Math.floor(periods.length / 2)];

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-2">
        <div className="relative h-56 w-14 shrink-0">
          {scale.ticks.map((tick) => (
            <span
              key={tick}
              className="absolute right-0 -translate-y-1/2 text-3xs text-muted-foreground tabular-nums"
              style={{ top: `${(toY(tick) / VIEW_HEIGHT) * 100}%` }}
            >
              {tick === 0 ? "0" : formatUsd(tick)}
            </span>
          ))}
        </div>
        <div
          ref={plotRef}
          className="relative h-56 flex-1"
          onMouseMove={(event) => {
            const plot = plotRef.current;
            if (plot === null || periods.length === 0) return;
            const bounds = plot.getBoundingClientRect();
            if (bounds.width === 0) return;
            const x = Math.min(bounds.width, Math.max(0, event.clientX - bounds.left));
            const y = Math.min(bounds.height, Math.max(0, event.clientY - bounds.top));
            hoverPositionRef.current = { x, y };
            positionTooltip();
            setHoverIndex(Math.round((x / bounds.width) * (periods.length - 1)));
          }}
          onMouseLeave={() => {
            hoverPositionRef.current = null;
            setHoverIndex(null);
          }}
        >
          <svg
            className="h-full w-full"
            viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
            preserveAspectRatio="none"
            role="img"
            aria-label={`${resolution === "hour" ? "Hourly" : "Daily"} cost by project`}
          >
            {scale.ticks.map((tick) => (
              <line
                key={tick}
                x1={0}
                x2={VIEW_WIDTH}
                y1={toY(tick)}
                y2={toY(tick)}
                stroke="currentColor"
                strokeWidth={1}
                className="text-border"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {painted.map(({ key, area, color }) => (
              <path
                key={key}
                d={area}
                fill={color}
                fillOpacity={{ normal: 0.12, focused: 0.2, dimmed: 0.03 }[emphasis(key)]}
              />
            ))}
            {painted.map(({ key, line, color }) => (
              <path
                key={key}
                d={line}
                fill="none"
                stroke={color}
                strokeOpacity={emphasis(key) === "dimmed" ? 0.25 : 1}
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {hoverIndex === null ? null : (
              <line
                x1={hoverIndex * stepX}
                x2={hoverIndex * stepX}
                y1={PLOT_TOP}
                y2={VIEW_HEIGHT}
                stroke="currentColor"
                strokeWidth={1}
                className="text-muted-foreground"
                vectorEffect="non-scaling-stroke"
              />
            )}
          </svg>
          {hoveredPeriod === undefined ? null : (
            <div
              ref={tooltipRef}
              className="surface-glass pointer-events-none absolute z-10 min-w-36 max-w-full rounded-xl border border-border/50 px-2.5 py-2 text-xs shadow-lg"
              style={{
                left: "var(--usage-tooltip-left, 0px)",
                top: "var(--usage-tooltip-top, 0px)",
              }}
            >
              <div className="mb-1 text-muted-foreground">{formatTooltipPeriod(hoveredPeriod)}</div>
              {hovered.map((entry) => (
                <div key={entry.key} className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
                    <span
                      aria-hidden
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: entry.color }}
                    />
                    <span className="truncate">{entry.label}</span>
                  </span>
                  <span className="text-foreground tabular-nums">{formatUsd(entry.value)}</span>
                </div>
              ))}
              <div className="mt-1 flex items-center justify-between gap-3 border-t border-border pt-1">
                <span className="text-muted-foreground">Total</span>
                <span className="text-foreground tabular-nums">
                  {formatUsd(hovered.reduce((sum, entry) => sum + entry.value, 0))}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="flex justify-between pl-16 text-3xs text-muted-foreground uppercase">
        <span>{periods[0] === undefined ? "" : formatPeriod(periods[0])}</span>
        <span>{middle === undefined ? "" : formatPeriod(middle)}</span>
        <span>{periods.at(-1) === undefined ? "" : formatPeriod(periods.at(-1) ?? "")}</span>
      </div>
    </div>
  );
}

/** Fork: a row's own cost trend, scaled to its own peak so small projects still show their shape. */
export function UsageProjectSparkline({
  values,
  color,
}: {
  readonly values: readonly number[];
  readonly color: string;
}) {
  const peak = Math.max(0, ...values);
  const stepX = values.length < 2 ? 0 : VIEW_WIDTH / (values.length - 1);
  const line = curvePath(
    smoothCurve(values.map((value, index) => ({ x: index * stepX, y: valueToY(value, peak) }))),
  );
  return (
    <svg
      aria-hidden
      className="h-6 w-24"
      viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
      preserveAspectRatio="none"
    >
      <path d={areaPath(line)} fill={color} fillOpacity={0.15} />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
