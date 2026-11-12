// @effect-diagnostics globalDate:off
import type {
  UsageBucket,
  UsageCategoryCost,
  UsageDay,
  UsageModelFilter,
  UsageModelSelector,
  UsageProjectPeriod,
  UsageProjectTotal,
  UsageResolution,
  UsageTokenTotals,
} from "@t3tools/contracts";

import { EMPTY_TOTALS, type UsageRecord } from "@t3tools/provider-core/server/usage";
import { cacheSavingsUsd, priceUsage, type RateTable } from "./usagePricing.ts";

// en-CA gives ISO-ordered parts in the requested zone; Date getters are host-local.
function makeDayFormatter(timeZone: string): (timestampMs: number) => string {
  let format: Intl.DateTimeFormat;
  try {
    format = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    format = new Intl.DateTimeFormat("en-CA", {
      timeZone: "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  }
  // Cache quarter-hour slots to avoid per-record Intl calls; fixed-offset midnight can split slots and needs exact formatting.
  const days = new Map<number, string | null>();
  return (timestampMs) => {
    const slot = Math.floor(timestampMs / QUARTER_HOUR_MS);
    let day = days.get(slot);
    if (day === undefined) {
      const first = format.format(new Date(slot * QUARTER_HOUR_MS));
      const last = format.format(new Date((slot + 1) * QUARTER_HOUR_MS - 1));
      day = first === last ? first : null;
      days.set(slot, day);
    }
    return day ?? format.format(new Date(timestampMs));
  };
}

const QUARTER_HOUR_MS = 15 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

interface MutableBucket {
  totals: { -readonly [K in keyof UsageTokenTotals]: number };
  costUsd: number;
  cacheSavingsUsd: number;
  categoryCostUsd: UsageCategoryCost | null;
  fastCostUsd: number;
  ultrafastCostUsd: number;
  speedPremiumUsd: number;
  records: number;
  unpricedRecords: number;
  providerReportedRecords: number;
  sessions: Set<string>;
}

interface MutableProjectTotal {
  readonly cwd: string;
  readonly provider: UsageProjectTotal["provider"];
  totals: { -readonly [K in keyof UsageTokenTotals]: number };
  costUsd: number;
  records: number;
  sessions: Set<string>;
}

interface MutableProjectPeriod extends Omit<UsageProjectPeriod, "costUsd" | "totalTokens"> {
  costUsd: number;
  totalTokens: number;
}

export interface AggregateOptions {
  readonly timeZone: string;
  readonly sinceDay: string;
  readonly untilDay: string;
  readonly rates: RateTable;
  readonly priceOverrides?: RateTable;
  readonly modelAliases?: ReadonlyMap<string, string>;
  readonly modelFilter?: UsageModelFilter;
  readonly resolution?: UsageResolution;
  readonly sinceTimeMs?: number;
  readonly untilTimeMs?: number;
}

export function resolveModelAliases(
  aliases: Readonly<Record<string, string>>,
): ReadonlyMap<string, string> {
  const resolved = new Map<string, string>();
  for (const model of Object.keys(aliases)) {
    const seen = new Set([model]);
    let target = aliases[model]!;
    while (Object.hasOwn(aliases, target) && !seen.has(target)) {
      seen.add(target);
      target = aliases[target]!;
    }
    if (!Object.hasOwn(aliases, target)) resolved.set(model, target);
  }
  return resolved;
}

/** Matches original IDs, so an alias cannot pull excluded usage into a kept model. */
function keepsUsageRecord(filter: UsageModelFilter | undefined, record: UsageRecord): boolean {
  if (filter === undefined) return true;
  const model = record.model.trim();
  const matches = (selector: UsageModelSelector) =>
    selector.model === model &&
    (selector.provider === undefined || selector.provider === record.provider);
  return (filter.include?.some(matches) ?? true) && !(filter.exclude?.some(matches) ?? false);
}

const selectorKey = (selector: UsageModelSelector) =>
  JSON.stringify([selector.provider ?? null, selector.model]);

const canonicalSelectors = (selectors: readonly UsageModelSelector[]) =>
  [...new Map(selectors.map((selector) => [selectorKey(selector), selector]))]
    // Code-unit order, so servers in different locales echo the same form.
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([, selector]) => selector);

/** Equal filters get one form, so they share scans and clients can compare echoed filters. */
export function canonicalModelFilter(
  filter: UsageModelFilter | undefined,
): UsageModelFilter | undefined {
  if (filter === undefined) return undefined;
  const exclude = filter.exclude?.length ? canonicalSelectors(filter.exclude) : undefined;
  if (filter.include === undefined && exclude === undefined) return undefined;
  return {
    ...(filter.include === undefined ? {} : { include: canonicalSelectors(filter.include) }),
    ...(exclude === undefined ? {} : { exclude }),
  };
}

export interface AggregateResult {
  readonly buckets: readonly UsageBucket[];
  readonly projects: readonly UsageProjectTotal[];
  readonly projectPeriods: readonly UsageProjectPeriod[];
  readonly duplicatesDropped: number;
  readonly outOfWindow: number;
}

/** Deduplicates across the whole scan; Claude copies records into resumed/forked transcripts. */
export class UsageAggregator {
  readonly #buckets = new Map<string, MutableBucket>();
  readonly #projects = new Map<string, MutableProjectTotal>();
  readonly #projectPeriods = new Map<string, MutableProjectPeriod>();
  // Like #lastBucket: time-ordered records usually repeat the previous folder and period.
  #lastProject: { readonly key: string; readonly project: MutableProjectTotal } | null = null;
  #lastPeriod: {
    readonly cwd: string;
    readonly provider: string;
    readonly day: string;
    readonly hourIndex: number;
    readonly period: MutableProjectPeriod;
  } | null = null;
  readonly #seen = new Set<string>();
  readonly #toDay: (timestampMs: number) => string;
  readonly #hourlyWindow: { readonly sinceTimeMs: number; readonly untilTimeMs: number } | null;
  readonly #options: AggregateOptions;
  #lastBucket: {
    readonly day: string;
    readonly hourIndex: number;
    readonly provider: string;
    readonly model: string;
    readonly source: string;
    readonly bucket: MutableBucket;
  } | null = null;
  #duplicatesDropped = 0;
  #outOfWindow = 0;

  constructor(options: AggregateOptions) {
    this.#options = options;
    this.#toDay = makeDayFormatter(options.timeZone);
    if (options.resolution === "hour") {
      if (options.sinceTimeMs === undefined || options.untilTimeMs === undefined) {
        throw new Error("Hourly usage aggregation requires exact time bounds");
      }
      this.#hourlyWindow = {
        sinceTimeMs: options.sinceTimeMs,
        untilTimeMs: options.untilTimeMs,
      };
    } else {
      this.#hourlyWindow = null;
    }
  }

  add(input: UsageRecord, sourcePath?: string): boolean {
    if (!keepsUsageRecord(this.#options.modelFilter, input)) return false;
    const record = this.#mapModel(input);
    if (record.dedupeKey !== null) {
      if (this.#seen.has(record.dedupeKey)) {
        this.#duplicatesDropped += 1;
        return false;
      }
      this.#seen.add(record.dedupeKey);
    }

    if (
      this.#hourlyWindow !== null &&
      (record.timestampMs < this.#hourlyWindow.sinceTimeMs ||
        record.timestampMs >= this.#hourlyWindow.untilTimeMs)
    ) {
      this.#outOfWindow += 1;
      return false;
    }

    const day = this.#toDay(record.timestampMs);
    if (
      this.#hourlyWindow === null &&
      (day < this.#options.sinceDay || day > this.#options.untilDay)
    ) {
      this.#outOfWindow += 1;
      return false;
    }

    const hourIndex =
      this.#hourlyWindow === null
        ? -1
        : Math.floor((record.timestampMs - this.#hourlyWindow.sinceTimeMs) / HOUR_MS);
    const bucket = this.#bucketFor(day, hourIndex, record.provider, record.model, sourcePath ?? "");

    const priced = priceUsage(this.#options.rates, record, this.#options.priceOverrides);

    const totals = bucket.totals;
    totals.uncachedInputTokens += record.totals.uncachedInputTokens;
    totals.cachedInputTokens += record.totals.cachedInputTokens;
    totals.cacheCreationTokens += record.totals.cacheCreationTokens;
    totals.outputTokens += record.totals.outputTokens;
    totals.reasoningTokens += record.totals.reasoningTokens;
    bucket.costUsd += priced.costUsd;
    if (priced.categoryCostUsd !== null) {
      const sum = bucket.categoryCostUsd;
      const add = priced.categoryCostUsd;
      bucket.categoryCostUsd =
        sum === null
          ? add
          : {
              input: sum.input + add.input,
              cacheRead: sum.cacheRead + add.cacheRead,
              cacheWrite: sum.cacheWrite + add.cacheWrite,
              output: sum.output + add.output,
            };
    }
    if (record.speed === "fast") bucket.fastCostUsd += priced.costUsd;
    if (record.speed === "ultrafast") bucket.ultrafastCostUsd += priced.costUsd;
    bucket.speedPremiumUsd += priced.speedPremiumUsd;
    bucket.cacheSavingsUsd += cacheSavingsUsd(
      this.#options.rates,
      record,
      this.#options.priceOverrides,
    );
    bucket.records += 1;
    if (priced.costSource === "unpriced") bucket.unpricedRecords += 1;
    if (priced.costSource === "providerReported") bucket.providerReportedRecords += 1;
    if (record.sessionId.length > 0) bucket.sessions.add(record.sessionId);
    if (record.cwd !== undefined) {
      this.#addProject(record, record.cwd, priced.costUsd);
      this.#addProjectPeriod(record, record.cwd, day, hourIndex, priced.costUsd);
    }
    return true;
  }

  #addProjectPeriod(
    record: UsageRecord,
    cwd: string,
    day: string,
    hourIndex: number,
    costUsd: number,
  ): void {
    const last = this.#lastPeriod;
    let period =
      last !== null &&
      last.cwd === cwd &&
      last.provider === record.provider &&
      last.day === day &&
      last.hourIndex === hourIndex
        ? last.period
        : undefined;
    if (period === undefined) {
      const key = `${cwd}\u0000${record.provider}\u0000${day}\u0000${hourIndex}`;
      period = this.#projectPeriods.get(key);
      if (period === undefined) {
        const window = this.#hourlyWindow;
        period = {
          cwd,
          provider: record.provider,
          day: day as UsageDay,
          ...(window === null
            ? {}
            : { hourStart: new Date(window.sinceTimeMs + hourIndex * HOUR_MS).toISOString() }),
          costUsd: 0,
          totalTokens: 0,
        };
        this.#projectPeriods.set(key, period);
      }
      this.#lastPeriod = { cwd, provider: record.provider, day, hourIndex, period };
    }
    period.costUsd += costUsd;
    // Reasoning tokens are already part of output.
    period.totalTokens +=
      record.totals.uncachedInputTokens +
      record.totals.cachedInputTokens +
      record.totals.cacheCreationTokens +
      record.totals.outputTokens;
  }

  #addProject(record: UsageRecord, cwd: string, costUsd: number): void {
    const last = this.#lastProject;
    let project =
      last !== null && last.project.cwd === cwd && last.project.provider === record.provider
        ? last.project
        : undefined;
    if (project === undefined) {
      const key = `${cwd}\u0000${record.provider}`;
      project = this.#projects.get(key);
      if (project === undefined) {
        project = {
          cwd,
          provider: record.provider,
          totals: { ...EMPTY_TOTALS },
          costUsd: 0,
          records: 0,
          sessions: new Set<string>(),
        };
        this.#projects.set(key, project);
      }
      this.#lastProject = { key, project };
    }
    project.totals.uncachedInputTokens += record.totals.uncachedInputTokens;
    project.totals.cachedInputTokens += record.totals.cachedInputTokens;
    project.totals.cacheCreationTokens += record.totals.cacheCreationTokens;
    project.totals.outputTokens += record.totals.outputTokens;
    project.totals.reasoningTokens += record.totals.reasoningTokens;
    project.costUsd += costUsd;
    project.records += 1;
    if (record.sessionId.length > 0) project.sessions.add(record.sessionId);
  }

  // Aliases use the target's rate, replacing provider-specific rateModel.
  #mapModel(record: UsageRecord): UsageRecord {
    const model = this.#options.modelAliases?.get(record.model);
    if (model === undefined) return record;
    const { rateModel: _rateModel, ...rest } = record;
    return { ...rest, model };
  }

  // Time-ordered records usually reuse the previous bucket; avoid rebuilding its key.
  #bucketFor(
    day: string,
    hourIndex: number,
    provider: string,
    model: string,
    source: string,
  ): MutableBucket {
    const last = this.#lastBucket;
    if (
      last !== null &&
      last.day === day &&
      last.hourIndex === hourIndex &&
      last.provider === provider &&
      last.model === model &&
      last.source === source
    ) {
      return last.bucket;
    }
    const window = this.#hourlyWindow;
    const hourStart =
      window === null ? "" : new Date(window.sinceTimeMs + hourIndex * HOUR_MS).toISOString();
    const key = `${day}\u0000${hourStart}\u0000${provider}\u0000${model}\u0000${source}`;
    let bucket = this.#buckets.get(key);
    if (bucket === undefined) {
      bucket = {
        totals: { ...EMPTY_TOTALS },
        costUsd: 0,
        cacheSavingsUsd: 0,
        categoryCostUsd: null,
        fastCostUsd: 0,
        ultrafastCostUsd: 0,
        speedPremiumUsd: 0,
        records: 0,
        unpricedRecords: 0,
        providerReportedRecords: 0,
        sessions: new Set<string>(),
      };
      this.#buckets.set(key, bucket);
    }
    this.#lastBucket = { day, hourIndex, provider, model, source, bucket };
    return bucket;
  }

  finish(): AggregateResult {
    const buckets: UsageBucket[] = [];
    for (const [key, bucket] of this.#buckets) {
      const [day = "", hourStart = "", provider = "", model = "", sourcePath = ""] =
        key.split("\u0000");
      const category = bucket.categoryCostUsd;
      const fastCostUsd = roundUsd(bucket.fastCostUsd);
      const ultrafastCostUsd = roundUsd(bucket.ultrafastCostUsd);
      const speedPremiumUsd = roundUsd(bucket.speedPremiumUsd);
      buckets.push({
        day: day as UsageDay,
        ...(hourStart === "" ? {} : { hourStart }),
        provider: provider as UsageBucket["provider"],
        model,
        ...(sourcePath === "" ? {} : { sourcePath }),
        totals: { ...bucket.totals },
        costUsd: bucket.costUsd,
        cacheSavingsUsd: bucket.cacheSavingsUsd,
        ...(category === null
          ? {}
          : {
              categoryCostUsd: {
                input: roundUsd(category.input),
                cacheRead: roundUsd(category.cacheRead),
                cacheWrite: roundUsd(category.cacheWrite),
                output: roundUsd(category.output),
              },
            }),
        ...(fastCostUsd === 0 ? {} : { fastCostUsd }),
        ...(ultrafastCostUsd === 0 ? {} : { ultrafastCostUsd }),
        ...(speedPremiumUsd === 0 ? {} : { speedPremiumUsd }),
        costSource: resolveCostSource(bucket),
        records: bucket.records,
        unpricedRecords: bucket.unpricedRecords,
        sessions: bucket.sessions.size,
      });
    }
    buckets.sort(
      (a, b) =>
        a.day.localeCompare(b.day) ||
        (a.hourStart ?? "").localeCompare(b.hourStart ?? "") ||
        a.provider.localeCompare(b.provider) ||
        a.model.localeCompare(b.model),
    );

    const projects = [...this.#projects.values()]
      .map((project): UsageProjectTotal => ({
        cwd: project.cwd,
        provider: project.provider,
        totals: { ...project.totals },
        costUsd: project.costUsd,
        records: project.records,
        sessions: project.sessions.size,
      }))
      .sort(
        (a, b) =>
          b.costUsd - a.costUsd ||
          a.cwd.localeCompare(b.cwd) ||
          a.provider.localeCompare(b.provider),
      );

    const projectPeriods = [...this.#projectPeriods.values()]
      .map((period): UsageProjectPeriod => ({ ...period, costUsd: roundUsd(period.costUsd) }))
      .sort(
        (a, b) =>
          a.day.localeCompare(b.day) ||
          (a.hourStart ?? "").localeCompare(b.hourStart ?? "") ||
          a.cwd.localeCompare(b.cwd) ||
          a.provider.localeCompare(b.provider),
      );

    return {
      buckets,
      projects,
      projectPeriods,
      duplicatesDropped: this.#duplicatesDropped,
      outOfWindow: this.#outOfWindow,
    };
  }
}

function roundUsd(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

function resolveCostSource(bucket: MutableBucket): UsageBucket["costSource"] {
  if (bucket.unpricedRecords === bucket.records) return "unpriced";
  if (bucket.providerReportedRecords === bucket.records) return "providerReported";
  return "modelPriced";
}
