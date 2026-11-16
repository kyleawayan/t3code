import * as Schema from "effect/Schema";

import { useLocalStorage } from "~/hooks/useLocalStorage";

export type LinearSection = "description" | "sub-issues" | "resources";

const IssueView = Schema.Struct({
  collapsed: Schema.optional(Schema.Array(Schema.String)),
  newestFirst: Schema.optional(Schema.Boolean),
});
type IssueView = typeof IssueView.Type;
const IssueViews = Schema.Record(Schema.String, IssueView);
type IssueViews = typeof IssueViews.Type;

const STORAGE_KEY = "t3code.linearIssueView";
const MAX_ENTRIES = 200;
const EMPTY: IssueViews = {};

/** Insertion order is recency; an issue back at the defaults is dropped. */
export function rememberIssueView(
  views: IssueViews,
  identifier: string,
  update: (view: IssueView) => IssueView,
  limit = MAX_ENTRIES,
): IssueViews {
  const next = update(views[identifier] ?? {});
  const entries = Object.entries(views).filter(([key]) => key !== identifier);
  const collapsed = next.collapsed?.length ? next.collapsed : undefined;
  if (collapsed || next.newestFirst) {
    entries.push([
      identifier,
      { ...(collapsed ? { collapsed } : {}), ...(next.newestFirst ? { newestFirst: true } : {}) },
    ]);
  }
  return Object.fromEntries(entries.slice(-limit));
}

/** Each issue's collapsed sections and activity order, kept across reloads. */
export function useLinearIssueView(identifier: string) {
  const [views, setViews] = useLocalStorage(STORAGE_KEY, EMPTY, IssueViews);
  const view = views[identifier] ?? {};
  return {
    isOpen: (section: LinearSection) => !view.collapsed?.includes(section),
    toggle: (section: LinearSection) =>
      setViews((current) =>
        rememberIssueView(current, identifier, (previous) => ({
          ...previous,
          collapsed: previous.collapsed?.includes(section)
            ? previous.collapsed.filter((entry) => entry !== section)
            : [...(previous.collapsed ?? []), section],
        })),
      ),
    newestFirst: view.newestFirst === true,
    toggleOrder: () =>
      setViews((current) =>
        rememberIssueView(current, identifier, (previous) => ({
          ...previous,
          newestFirst: !previous.newestFirst,
        })),
      ),
  };
}
