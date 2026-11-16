/**
 * A Linear tab. A thread can hold several, each with its own back/forward history of issue
 * identifiers, where `LINEAR_SEARCH_ENTRY` is the search page.
 */
export interface LinearSurface {
  readonly id: `linear:${string}`;
  readonly kind: "linear";
  readonly history: readonly string[];
  readonly index: number;
}

export const LINEAR_SEARCH_ENTRY = "";
const MAX_HISTORY = 50;
const ENTRY = /^(?:[A-Z][A-Z0-9_]*-\d+)?$/;

export function linearSurfaceIssue(surface: LinearSurface): string {
  return surface.history[surface.index] ?? surface.history[0] ?? LINEAR_SEARCH_ENTRY;
}

export function newLinearSurface(id: string, identifier: string): LinearSurface {
  return { id: `linear:${id}`, kind: "linear", history: [identifier], index: 0 };
}

/** Opens `identifier` in this tab, dropping any forward entries like a browser does. */
export function pushLinearIssue(surface: LinearSurface, identifier: string): LinearSurface {
  if (linearSurfaceIssue(surface) === identifier) return surface;
  const history = [...surface.history.slice(0, surface.index + 1), identifier].slice(-MAX_HISTORY);
  return { ...surface, history, index: history.length - 1 };
}

export function stepLinearHistory(surface: LinearSurface, delta: -1 | 1): LinearSurface | null {
  const index = surface.index + delta;
  if (index < 0 || index >= surface.history.length) return null;
  return { ...surface, index };
}

/** Restores a persisted or reopened surface, or rejects it. The single-tab `linear` id upgrades. */
export function sanitizeLinearSurface(raw: unknown): LinearSurface | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { id, kind, history, index } = raw as Record<string, unknown>;
  if (kind !== "linear" || typeof id !== "string" || !Array.isArray(history)) return null;
  if (id !== "linear" && !/^linear:.+$/.test(id)) return null;
  const valid = history
    .filter((entry): entry is string => typeof entry === "string" && ENTRY.test(entry))
    .slice(-MAX_HISTORY);
  if (valid.length === 0) return null;
  const safeIndex =
    typeof index === "number" && Number.isSafeInteger(index)
      ? Math.min(Math.max(index, 0), valid.length - 1)
      : valid.length - 1;
  return {
    id: id === "linear" ? "linear:main" : (id as `linear:${string}`),
    kind: "linear",
    history: valid,
    index: safeIndex,
  };
}
