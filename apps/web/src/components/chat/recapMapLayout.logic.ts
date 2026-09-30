import type { ThreadRecapStep } from "@t3tools/contracts";

/**
 * Single-column resume map, drawn like a git-log graph: one row per step in
 * dependency order so every line points down, with dependency lines in a
 * narrow gutter of at most `RECAP_MAX_LANES` lanes. Small graphs (about a
 * dozen steps) only, so every pass is a plain loop over all steps.
 */

export const RECAP_MAX_LANES = 3;

export type RecapRowMarker = Exclude<ThreadRecapStep["status"], "done">;

export interface RecapPathRow {
  readonly step: ThreadRecapStep;
  /** 1-based across every step, done steps first; what "after N" refers to. */
  readonly number: number;
  readonly marker: RecapRowMarker;
  /** A next step whose blockers are all done. */
  readonly canStartNow: boolean;
  /** Numbers of the unfinished steps this one waits on, ascending. */
  readonly after: ReadonlyArray<number>;
  readonly lane: number;
}

export interface RecapGutterCell {
  /** Lanes whose line crosses this row without touching its marker. */
  readonly through: ReadonlyArray<number>;
  /**
   * Lines from dependencies arriving at this row's marker. `continues` means
   * the line also runs on below (it is one of `through`), so it branches here.
   */
  readonly arrivals: ReadonlyArray<{ readonly lane: number; readonly continues: boolean }>;
  /** The marker starts a line down to its dependents. */
  readonly down: boolean;
  /** An unknown step with no known dependency: a dashed connector from above. */
  readonly dashedArrival: boolean;
}

export interface RecapPathLayout {
  readonly done: ReadonlyArray<{ readonly step: ThreadRecapStep; readonly number: number }>;
  readonly rows: ReadonlyArray<RecapPathRow>;
  /** Parallel to `rows`; null when the lines would need more than `RECAP_MAX_LANES` lanes. */
  readonly cells: ReadonlyArray<RecapGutterCell> | null;
  readonly laneCount: number;
  readonly totalCount: number;
  readonly now: RecapPathRow | null;
  readonly canStart: RecapPathRow | null;
  /** The unfinished step the most other steps wait on, directly or through others. */
  readonly wait: { readonly count: number; readonly cause: RecapPathRow } | null;
}

const MARKER_RANK: Record<RecapRowMarker, number> = { now: 0, next: 1, blocked: 2, unknown: 3 };

/** Kahn's algorithm; among ready steps the lowest `rank` goes first, then input order. */
function topologicalOrder(
  ids: ReadonlyArray<string>,
  depsOf: (id: string) => ReadonlyArray<string>,
  rank: (id: string) => number,
): string[] {
  const inSet = new Set(ids);
  const indexOf = new Map(ids.map((id, index) => [id, index]));
  const remaining = new Map(ids.map((id) => [id, depsOf(id).filter((dep) => inSet.has(dep))]));
  const order: string[] = [];
  const placed = new Set<string>();
  while (order.length < ids.length) {
    let next: string | null = null;
    for (const id of ids) {
      if (placed.has(id) || remaining.get(id)!.some((dep) => !placed.has(dep))) continue;
      if (
        next === null ||
        rank(id) < rank(next) ||
        (rank(id) === rank(next) && indexOf.get(id)! < indexOf.get(next)!)
      ) {
        next = id;
      }
    }
    // Back-edges are dropped before this runs, so a ready step always exists.
    if (next === null) break;
    placed.add(next);
    order.push(next);
  }
  return order;
}

export function layoutRecapPath(steps: ReadonlyArray<ThreadRecapStep>): RecapPathLayout {
  const stepsById = new Map<string, ThreadRecapStep>();
  for (const step of steps) {
    if (!stepsById.has(step.id)) stepsById.set(step.id, step);
  }
  const ids = [...stepsById.keys()];
  const depsById = new Map<string, string[]>();
  for (const step of stepsById.values()) {
    depsById.set(
      step.id,
      [...new Set(step.blockedBy)].filter((id) => id !== step.id && stepsById.has(id)),
    );
  }

  // Drop back-edges found by a depth-first walk in step order, so a cycle
  // keeps whichever dependencies the summary listed first.
  const visitState = new Map<string, "active" | "done">();
  const visit = (id: string) => {
    visitState.set(id, "active");
    const kept: string[] = [];
    for (const dep of depsById.get(id)!) {
      const state = visitState.get(dep);
      if (state === "active") continue;
      if (state === undefined) visit(dep);
      kept.push(dep);
    }
    depsById.set(id, kept);
    visitState.set(id, "done");
  };
  for (const id of ids) {
    if (!visitState.has(id)) visit(id);
  }

  const isDone = (id: string) => stepsById.get(id)!.status === "done";
  const depsOf = (id: string) => depsById.get(id)!;
  const doneOrder = topologicalOrder(ids.filter(isDone), depsOf, () => 0);
  const rowOrder = topologicalOrder(
    ids.filter((id) => !isDone(id)),
    depsOf,
    (id) => MARKER_RANK[stepsById.get(id)!.status as RecapRowMarker],
  );
  const numberById = new Map([...doneOrder, ...rowOrder].map((id, index) => [id, index + 1]));
  const rowIndexById = new Map(rowOrder.map((id, index) => [id, index]));

  const unfinishedDeps = (id: string) => depsOf(id).filter((dep) => !isDone(dep));
  const childrenById = new Map<string, string[]>(rowOrder.map((id) => [id, []]));
  for (const id of rowOrder) {
    for (const dep of unfinishedDeps(id)) childrenById.get(dep)!.push(id);
  }
  const lastChildRow = (id: string) =>
    Math.max(-1, ...childrenById.get(id)!.map((child) => rowIndexById.get(child)!));
  const hasNow = rowOrder.some((id) => stepsById.get(id)!.status === "now");

  // Greedy lanes: a step with dependents owns its lane from its row to its
  // last dependent's row. Each row takes the lowest lane no line is crossing.
  const laneById = new Map<string, number>();
  const owners: Array<{ id: string; lane: number; from: number; until: number }> = [];
  const busyAt = (rowIndex: number) =>
    owners.filter((owner) => owner.from < rowIndex && rowIndex < owner.until);
  const rowsBase = rowOrder.map((id, rowIndex) => {
    const step = stepsById.get(id)!;
    const after = unfinishedDeps(id)
      .map((dep) => numberById.get(dep)!)
      .toSorted((a, b) => a - b);
    const canStartNow = step.status === "next" && after.length === 0;
    const busy = new Set(busyAt(rowIndex).map((owner) => owner.lane));
    // Parallel work gets its own lane beside the current step's line.
    let lane = canStartNow && hasNow ? 1 : 0;
    while (busy.has(lane)) lane += 1;
    laneById.set(id, lane);
    const until = lastChildRow(id);
    if (until > rowIndex) owners.push({ id, lane, from: rowIndex, until });
    return {
      step,
      number: numberById.get(id)!,
      marker: step.status as RecapRowMarker,
      canStartNow,
      after,
      lane,
    };
  });
  const laneCount = Math.max(1, ...rowsBase.map((row) => row.lane + 1));
  const drawLines = laneCount <= RECAP_MAX_LANES;

  const rows: RecapPathRow[] = drawLines ? rowsBase : rowsBase.map((row) => ({ ...row, lane: 0 }));
  const cells: RecapGutterCell[] | null = drawLines
    ? rowOrder.map((id, rowIndex) => {
        const parents = unfinishedDeps(id);
        return {
          through: busyAt(rowIndex).map((owner) => owner.lane),
          arrivals: parents.map((parent) => ({
            lane: laneById.get(parent)!,
            continues: lastChildRow(parent) > rowIndex,
          })),
          down: childrenById.get(id)!.length > 0,
          dashedArrival:
            stepsById.get(id)!.status === "unknown" && parents.length === 0 && rowIndex > 0,
        };
      })
    : null;

  const descendantCount = (id: string) => {
    const seen = new Set<string>();
    const stack = [...childrenById.get(id)!];
    while (stack.length > 0) {
      const next = stack.pop()!;
      if (seen.has(next)) continue;
      seen.add(next);
      stack.push(...childrenById.get(next)!);
    }
    return seen.size;
  };
  let wait: { count: number; cause: RecapPathRow } | null = null;
  for (const [rowIndex, row] of rows.entries()) {
    const count = descendantCount(rowOrder[rowIndex]!);
    if (count > 0 && (wait === null || count > wait.count)) wait = { count, cause: row };
  }

  return {
    done: doneOrder.map((id) => ({ step: stepsById.get(id)!, number: numberById.get(id)! })),
    rows,
    cells,
    laneCount: drawLines ? laneCount : 1,
    totalCount: ids.length,
    now: rows.find((row) => row.marker === "now") ?? null,
    canStart: rows.find((row) => row.canStartNow) ?? null,
    wait,
  };
}
