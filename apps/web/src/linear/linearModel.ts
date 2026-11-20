// oxlint-disable t3code/no-untranslated-copy -- Fork-only English copy, kept out of upstream's translation catalogs.
import type {
  LinearAncestor,
  LinearComment,
  LinearCycle,
  LinearHistoryEntry,
  LinearIssue,
  LinearIssueRef,
  LinearMilestoneAncestor,
  LinearMilestoneIssue,
  LinearRelatedIssue,
  LinearState,
  LinearSubIssue,
  LinearUser,
} from "./linearTypes";

const DONE_STATE_TYPES = new Set(["completed", "canceled", "duplicate"]);

const isDoneStateType = (type: string) => DONE_STATE_TYPES.has(type);

/**
 * How full each started state's pie is, by its order in the team's workflow: the first started
 * state is half full and later ones fill toward a whole circle, as Linear draws them.
 */
export function startedStateFractions(
  states: readonly { readonly name: string; readonly type: string; readonly position: number }[],
): ReadonlyMap<string, number> {
  const started = states
    .filter((state) => state.type === "started")
    .toSorted((left, right) => left.position - right.position);
  return new Map(started.map((state, index) => [state.name, 0.5 + (0.5 * index) / started.length]));
}

/**
 * Linear's state colors are picked for light backgrounds; on dark ones the darker ones (such as
 * In Review's #0f783c) disappear. Raise their lightness to `minLightness`, keeping the hue and
 * capping saturation so a lifted color doesn't glow.
 */
export function brightenForDark(hex: string, minLightness = 0.55, maxSaturation = 0.65): string {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match?.[1]) return hex;
  const value = Number.parseInt(match[1], 16);
  const [r, g, b] = [(value >> 16) & 255, (value >> 8) & 255, value & 255].map((c) => c / 255) as [
    number,
    number,
    number,
  ];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  if (lightness >= minLightness) return hex;
  const delta = max - min;
  const saturation = Math.min(
    delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1)),
    maxSaturation,
  );
  const rawHue =
    delta === 0
      ? 0
      : max === r
        ? (g - b) / delta
        : max === g
          ? (b - r) / delta + 2
          : (r - g) / delta + 4;
  const hue = ((rawHue % 6) + 6) % 6;
  const chroma = (1 - Math.abs(2 * minLightness - 1)) * saturation;
  const x = chroma * (1 - Math.abs((hue % 2) - 1));
  const sector = Math.floor(hue);
  const [r1, g1, b1] = [
    [chroma, x, 0],
    [x, chroma, 0],
    [0, chroma, x],
    [0, x, chroma],
    [x, 0, chroma],
    [chroma, 0, x],
  ][sector]!;
  const m = minLightness - chroma / 2;
  return `#${[r1, g1, b1]
    .map((channel) =>
      Math.round((channel! + m) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

const T_SHIRT_SIZES: Readonly<Record<number, string>> = {
  0: "XS",
  1: "XS",
  2: "S",
  3: "M",
  5: "L",
  8: "XL",
  13: "XXL",
  21: "XXXL",
};

/**
 * Linear stores every estimate as a number; t-shirt teams see sizes. `short` is the sub-issue
 * row chip ("5", "M"), the full form the property chip ("5 Points", "Size M").
 */
export function estimateLabel(
  estimate: number | null,
  estimationType: string,
  short = false,
): string | null {
  if (estimate === null || estimationType === "notUsed") return null;
  if (estimationType === "tShirt") {
    const size = T_SHIRT_SIZES[estimate] ?? String(estimate);
    return short ? size : `Size ${size}`;
  }
  if (short) return String(estimate);
  return `${estimate} ${estimate === 1 ? "Point" : "Points"}`;
}

const PRIORITY_LABELS = ["No priority", "Urgent", "High", "Medium", "Low"] as const;

const priorityLabel = (priority: number) => PRIORITY_LABELS[priority] ?? "No priority";

const localDay = (date: Date) => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());

/** Whole calendar days from `from` to `to` in local time; negative when `to` is earlier. */
function calendarDaysBetween(from: Date, to: Date): number {
  return Math.round((localDay(to) - localDay(from)) / 86_400_000);
}

function cycleName(cycle: Pick<LinearCycle, "number" | "name">): string {
  return cycle.name?.trim() || `Cycle ${cycle.number}`;
}

/** "Cycle 10 (2 days left)" while it runs, "(starts tomorrow)" before, plain once it ends. */
/** Linear's API gives a cycle no URL, so this builds its page under the team, in the issue's workspace. */
export function linearCycleUrl(
  issueUrl: string,
  teamKey: string,
  cycleNumber: number,
): string | null {
  const workspace = /^https:\/\/linear\.app\/([^/?#]+)\//.exec(issueUrl)?.[1];
  if (!workspace || !/^[A-Za-z0-9_]+$/.test(teamKey)) return null;
  return `https://linear.app/${workspace}/team/${teamKey}/cycle/${cycleNumber}`;
}

export function cycleLabel(cycle: LinearCycle, now: Date): string {
  const name = cycleName(cycle);
  const startsAt = new Date(cycle.startsAt);
  const endsAt = new Date(cycle.endsAt);
  if (now < startsAt) {
    const days = calendarDaysBetween(now, startsAt);
    if (days <= 0) return `${name} (starts today)`;
    return `${name} (starts ${days === 1 ? "tomorrow" : `in ${days} days`})`;
  }
  if (now >= endsAt) return name;
  const days = calendarDaysBetween(now, endsAt);
  if (days <= 1) return `${name} (last day)`;
  return `${name} (${days} days left)`;
}

/**
 * "Nov 20 (4 days left)", like a cycle's countdown, then "(tomorrow)", "(today)", and
 * "(2 days overdue)". Due dates have no time, so they compare by local day.
 */
export function dueDateLabel(dueDate: string, now: Date): { label: string; overdue: boolean } {
  const [year, month, day] = dueDate.split("-").map(Number);
  const due = new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);
  const date = due.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const days = calendarDaysBetween(now, due);
  const countdown =
    days > 1
      ? `${days} days left`
      : days === 1
        ? "tomorrow"
        : days === 0
          ? "today"
          : `${-days} ${days === -1 ? "day" : "days"} overdue`;
  return { label: `${date} (${countdown})`, overdue: days < 0 };
}

const MINUTE_MS = 60_000;

/**
 * Linear's relative dates: minutes, hours, and days for the first week, then weeks up to 9, then
 * months, then years ("9w ago", "4mo ago").
 */
export function linearRelativeTime(iso: string, now: Date): string {
  const elapsed = now.getTime() - new Date(iso).getTime();
  if (Number.isNaN(elapsed)) return "";
  if (elapsed < MINUTE_MS) return "just now";
  const minutes = Math.floor(elapsed / MINUTE_MS);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.round(days / 7);
  if (weeks < 10) return `${weeks}w ago`;
  if (days < 365) return `${Math.floor(days / 30.44)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

export type LinearRelationKind =
  | "blocked-by"
  | "blocking"
  | "related"
  | "duplicate-of"
  | "duplicated-by";

export interface LinearRelationGroup {
  readonly kind: LinearRelationKind;
  readonly label: string;
  readonly heading: string;
  readonly issues: readonly LinearRelatedIssue[];
}

const RELATION_ORDER: readonly LinearRelationKind[] = [
  "blocked-by",
  "blocking",
  "related",
  "duplicate-of",
  "duplicated-by",
];

const RELATION_TEXT: Record<LinearRelationKind, { heading: string; chip: (n: number) => string }> =
  {
    "blocked-by": { heading: "Blocked by", chip: (n) => `${n} blocked by` },
    blocking: { heading: "Blocks", chip: (n) => `${n} blocking` },
    related: { heading: "Related", chip: (n) => `${n} related` },
    "duplicate-of": { heading: "Duplicate of", chip: () => "Duplicate" },
    "duplicated-by": { heading: "Duplicates", chip: (n) => `${n} duplicate${n === 1 ? "" : "s"}` },
  };

/**
 * `relations` are stored on this issue; `inverseRelations` on the other one, so they read backward.
 * Like Linear, a block whose blocker is done reads as related on both issues.
 */
export function relationGroups(
  issue: Pick<LinearIssue, "relations" | "inverseRelations"> & {
    readonly state: { readonly type: string };
  },
): LinearRelationGroup[] {
  const byKind = new Map<LinearRelationKind, LinearRelatedIssue[]>();
  const add = (kind: LinearRelationKind | null, ref: LinearRelatedIssue) => {
    if (kind === null) return;
    const list = byKind.get(kind) ?? [];
    if (!list.some((entry) => entry.identifier === ref.identifier)) list.push(ref);
    byKind.set(kind, list);
  };
  for (const relation of issue.relations.nodes) {
    add(
      relation.type === "blocks"
        ? isDoneStateType(issue.state.type)
          ? "related"
          : "blocking"
        : relation.type === "related"
          ? "related"
          : relation.type === "duplicate"
            ? "duplicate-of"
            : null,
      relation.relatedIssue,
    );
  }
  for (const relation of issue.inverseRelations.nodes) {
    add(
      relation.type === "blocks"
        ? isDoneStateType(relation.issue.state.type)
          ? "related"
          : "blocked-by"
        : relation.type === "related"
          ? "related"
          : relation.type === "duplicate"
            ? "duplicated-by"
            : null,
      relation.issue,
    );
  }
  return RELATION_ORDER.flatMap((kind) => {
    const issues = byKind.get(kind);
    if (!issues || issues.length === 0) return [];
    const text = RELATION_TEXT[kind];
    return [{ kind, label: text.chip(issues.length), heading: text.heading, issues }];
  });
}

/** Counts done or canceled descendants over all descendants, as Linear's "2/6" does. */
export function subIssueProgress(
  nodes: readonly {
    readonly state: { readonly type: string };
    readonly children?: { readonly nodes: readonly unknown[] };
  }[],
): { done: number; total: number } {
  let done = 0;
  let total = 0;
  const visit = (list: typeof nodes) => {
    for (const node of list) {
      total += 1;
      if (isDoneStateType(node.state.type)) done += 1;
      if (node.children) visit(node.children.nodes as typeof nodes);
    }
  };
  visit(nodes);
  return { done, total };
}

const isSubIssue = (node: unknown): node is LinearSubIssue =>
  typeof node === "object" && node !== null && "identifier" in node;

const bySortOrder = (left: LinearSubIssue, right: LinearSubIssue) =>
  (left.subIssueSortOrder ?? Number.MAX_SAFE_INTEGER) -
  (right.subIssueSortOrder ?? Number.MAX_SAFE_INTEGER);

export interface LinearSubIssueRow {
  readonly issue: LinearSubIssue;
  readonly depth: number;
  /** A milestone page's ancestor row: outside the milestone, shown for where its issues sit. */
  readonly context?: boolean;
  /** The last of its parent's sub-issues, where the parent's guide line ends. */
  readonly isLast: boolean;
  /** For each ancestor guide column (depth 1 up to this row's), whether it runs past this row. */
  readonly guides: readonly boolean[];
  readonly progress: { done: number; total: number } | null;
  /** Blocked-by and blocking groups, as the row's chips show them. */
  readonly blocks: readonly LinearRelationGroup[];
}

/** Linear's manual order, with each row's own sub-issues nested right under it. */
export function subIssueRows(
  children: readonly LinearSubIssue[],
  depth = 0,
  guides: readonly boolean[] = [],
): LinearSubIssueRow[] {
  const sorted = children.toSorted(bySortOrder);
  return sorted.flatMap((issue, index) => {
    const isLast = index === sorted.length - 1;
    const nested = issue.children.nodes.filter(isSubIssue);
    const progress =
      issue.children.nodes.length > 0 ? subIssueProgress(issue.children.nodes) : null;
    return [
      {
        issue,
        depth,
        isLast,
        guides,
        progress,
        blocks: relationGroups(issue).filter(
          (group) => group.kind === "blocked-by" || group.kind === "blocking",
        ),
      },
      ...subIssueRows(nested, depth + 1, depth === 0 ? [] : [...guides, !isLast]),
    ];
  });
}

/** The parent chain, root first. */
export function ancestorChain(issue: Pick<LinearIssue, "parent">): LinearIssueRef[] {
  const chain: LinearIssueRef[] = [];
  let current: LinearAncestor | null | undefined = issue.parent;
  while (current) {
    chain.unshift({ identifier: current.identifier, title: current.title, state: current.state });
    current = current.parent;
  }
  return chain;
}

export interface LinearCommentThread {
  readonly root: LinearComment;
  readonly replies: readonly LinearComment[];
}

const byCreatedAt = <T extends { readonly createdAt: string }>(left: T, right: T) =>
  left.createdAt.localeCompare(right.createdAt);

function commentThreads(comments: readonly LinearComment[]): LinearCommentThread[] {
  const ids = new Set(comments.map((comment) => comment.id));
  const replies = new Map<string, LinearComment[]>();
  const roots: LinearComment[] = [];
  for (const comment of comments) {
    // A reply whose root fell outside the fetched page still shows, as its own thread.
    if (comment.parent && ids.has(comment.parent.id)) {
      replies.set(comment.parent.id, [...(replies.get(comment.parent.id) ?? []), comment]);
    } else {
      roots.push(comment);
    }
  }
  return roots.toSorted(byCreatedAt).map((root) => ({
    root,
    replies: (replies.get(root.id) ?? []).toSorted(byCreatedAt),
  }));
}

export function commentAuthor(comment: LinearComment): { name: string; via: string | null } {
  const name = comment.user?.displayName ?? comment.externalUser?.name ?? comment.botActor?.name;
  return {
    name: name ?? "Unknown",
    via: comment.user && comment.botActor?.name ? comment.botActor.name : null,
  };
}

/** The glyph a history line shows in place of an avatar, as Linear's activity does. */
export type LinearActivityIcon =
  | { readonly kind: "created" }
  | { readonly kind: "status"; readonly state: LinearState }
  | { readonly kind: "assignee" }
  | { readonly kind: "label" }
  | { readonly kind: "priority"; readonly priority: number }
  | { readonly kind: "cycle" }
  | { readonly kind: "parent" }
  | { readonly kind: "relation"; readonly relation: LinearRelationKind };

export type LinearActivityItem =
  | {
      readonly kind: "event";
      readonly id: string;
      readonly at: string;
      readonly actor: LinearUser | null;
      readonly actorName: string;
      /** No person or integration: Linear itself. The created line shows its logo for this. */
      readonly byLinear: boolean;
      readonly text: string;
      readonly icon: LinearActivityIcon;
    }
  | {
      readonly kind: "thread";
      readonly id: string;
      readonly at: string;
      readonly thread: LinearCommentThread;
    };

const RELATION_CHANGE_KIND: Record<string, LinearRelationKind> = {
  b: "blocked-by",
  x: "blocking",
  r: "related",
  d: "duplicate-of",
};

const RELATION_CHANGE_TEXT: Record<string, (identifier: string) => string> = {
  ab: (id) => `marked this issue as blocked by ${id}`,
  ax: (id) => `marked this issue as blocking ${id}`,
  ar: (id) => `added related issue ${id}`,
  ad: (id) => `marked this issue as a duplicate of ${id}`,
  rb: (id) => `removed the blocked-by relation with ${id}`,
  rx: (id) => `removed the blocking relation with ${id}`,
  rr: (id) => `removed related issue ${id}`,
  rd: (id) => `removed the duplicate relation with ${id}`,
};

const join = (names: readonly string[]) => names.join(", ");

function historyTexts(entry: LinearHistoryEntry): { text: string; icon: LinearActivityIcon }[] {
  const texts: { text: string; icon: LinearActivityIcon }[] = [];
  if (entry.toState && entry.fromState?.name !== entry.toState.name) {
    texts.push({
      icon: { kind: "status", state: entry.toState },
      text: entry.fromState
        ? `changed status from ${entry.fromState.name} to ${entry.toState.name}`
        : `set status to ${entry.toState.name}`,
    });
  }
  if (entry.toAssignee || entry.fromAssignee) {
    texts.push({
      icon: { kind: "assignee" },
      text: entry.toAssignee
        ? entry.fromAssignee
          ? `reassigned from ${entry.fromAssignee.displayName} to ${entry.toAssignee.displayName}`
          : `assigned to ${entry.toAssignee.displayName}`
        : `removed assignee ${entry.fromAssignee?.displayName ?? ""}`.trim(),
    });
  }
  const added = entry.addedLabels ?? [];
  const removed = entry.removedLabels ?? [];
  if (added.length > 0) {
    texts.push({
      icon: { kind: "label" },
      text: `added label${added.length === 1 ? "" : "s"} ${join(added.map((label) => label.name))}`,
    });
  }
  if (removed.length > 0) {
    texts.push({
      icon: { kind: "label" },
      text: `removed label${removed.length === 1 ? "" : "s"} ${join(removed.map((label) => label.name))}`,
    });
  }
  if (
    entry.toPriority !== null &&
    entry.fromPriority !== null &&
    entry.toPriority !== entry.fromPriority
  ) {
    texts.push({
      icon: { kind: "priority", priority: entry.toPriority },
      text:
        entry.toPriority === 0
          ? "removed priority"
          : entry.fromPriority === 0
            ? `set priority to ${priorityLabel(entry.toPriority)}`
            : `changed priority from ${priorityLabel(entry.fromPriority)} to ${priorityLabel(entry.toPriority)}`,
    });
  }
  if (entry.toCycle || entry.fromCycle) {
    texts.push({
      icon: { kind: "cycle" },
      text: entry.toCycle
        ? entry.fromCycle
          ? `moved from Cycle ${entry.fromCycle.number} to Cycle ${entry.toCycle.number}`
          : `added to Cycle ${entry.toCycle.number}`
        : `removed from Cycle ${entry.fromCycle?.number ?? ""}`.trim(),
    });
  }
  if (entry.toParent || entry.fromParent) {
    texts.push({
      icon: { kind: "parent" },
      text: entry.toParent
        ? entry.fromParent
          ? `changed parent from ${entry.fromParent.identifier} to ${entry.toParent.identifier}`
          : `set parent issue to ${entry.toParent.identifier}`
        : `removed parent issue ${entry.fromParent?.identifier ?? ""}`.trim(),
    });
  }
  for (const change of entry.relationChanges ?? []) {
    const text = RELATION_CHANGE_TEXT[change.type]?.(change.identifier);
    const relation = RELATION_CHANGE_KIND[change.type.slice(1)];
    if (text && relation) texts.push({ icon: { kind: "relation", relation }, text });
  }
  return texts;
}

/** History lines and comment threads in time order. Edits Linear doesn't show are skipped. */
export function activityItems(
  issue: Pick<LinearIssue, "createdAt" | "creator" | "history" | "comments">,
): LinearActivityItem[] {
  const items: LinearActivityItem[] = [
    {
      kind: "event",
      id: "created",
      at: issue.createdAt,
      actor: issue.creator,
      actorName: issue.creator?.displayName ?? "Linear",
      byLinear: issue.creator === null,
      text: "created the issue",
      icon: { kind: "created" },
    },
  ];
  for (const entry of issue.history.nodes) {
    historyTexts(entry).forEach(({ text, icon }, index) => {
      items.push({
        kind: "event",
        id: `${entry.id}:${index}`,
        at: entry.createdAt,
        actor: entry.botActor ? null : entry.actor,
        actorName: entry.botActor?.name ?? entry.actor?.displayName ?? "Linear",
        byLinear: !entry.botActor?.name && !entry.actor,
        text,
        icon,
      });
    });
  }
  for (const thread of commentThreads(issue.comments.nodes)) {
    items.push({ kind: "thread", id: thread.root.id, at: thread.root.createdAt, thread });
  }
  return items.toSorted((left, right) => left.at.localeCompare(right.at));
}

export type LinearMarkdownSegment =
  | { readonly kind: "markdown"; readonly line: number; readonly text: string }
  | {
      readonly kind: "collapsible";
      readonly line: number;
      readonly title: string;
      readonly text: string;
    };

const FENCE = /^\s{0,3}(`{3,}|~{3,})/;
const COLLAPSIBLE_START = /^\+\+\+[ \t]*(.*)$/;

/** Splits Linear's `+++ Title` … `+++` collapsible sections out of otherwise plain markdown. */
export function segmentMarkdown(markdown: string): LinearMarkdownSegment[] {
  const segments: LinearMarkdownSegment[] = [];
  let buffer: string[] = [];
  let bufferStart = 0;
  let open: { title: string; line: number } | null = null;
  let fence: string | null = null;
  const flush = (nextStart: number) => {
    const text = buffer.join("\n");
    if (open) {
      segments.push({ kind: "collapsible", line: open.line, title: open.title, text: text.trim() });
    } else if (text.trim().length > 0) {
      segments.push({ kind: "markdown", line: bufferStart, text });
    }
    buffer = [];
    bufferStart = nextStart;
  };
  markdown.split("\n").forEach((line, index) => {
    const fenceMatch = FENCE.exec(line);
    if (fenceMatch?.[1]) {
      const marker = fenceMatch[1];
      if (fence === null) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = null;
      buffer.push(line);
      return;
    }
    const collapsible = fence === null ? COLLAPSIBLE_START.exec(line.trimEnd()) : null;
    if (collapsible && open === null) {
      flush(index + 1);
      open = { title: collapsible[1]?.trim() || "Details", line: index };
      return;
    }
    if (collapsible && open !== null && line.trim() === "+++") {
      flush(index + 1);
      open = null;
      return;
    }
    buffer.push(line);
  });
  flush(0);
  return segments;
}

/** Compares two fetches while ignoring the per-request upload signatures. */
export function issueFingerprint(issue: LinearIssue | null): string {
  return JSON.stringify(issue).replace(/([?&])signature=[^"&)\s\\]+/g, "$1signature=");
}

interface MilestoneTreeNode {
  readonly issue: LinearSubIssue;
  readonly context: boolean;
  readonly children: MilestoneTreeNode[];
}

const ancestorAsSubIssue = (ancestor: LinearMilestoneAncestor): LinearSubIssue => ({
  identifier: ancestor.identifier,
  title: ancestor.title,
  state: ancestor.state,
  subIssueSortOrder: ancestor.subIssueSortOrder,
  estimate: ancestor.estimate,
  assignee: ancestor.assignee,
  labels: ancestor.labels,
  cycle: null,
  relations: { nodes: [] },
  inverseRelations: { nodes: [] },
  children: ancestor.children,
});

/**
 * A milestone's issues nested under their parents, like Linear's project view. Parents outside the
 * milestone come back as `context` rows; roots keep the milestone's order, siblings their sub-issue order.
 */
export function milestoneTreeRows(issues: readonly LinearMilestoneIssue[]): LinearSubIssueRow[] {
  const nodes = new Map<string, MilestoneTreeNode>();
  const parentOf = new Map<string, string>();
  const add = (issue: LinearSubIssue, context: boolean) => {
    if (!nodes.has(issue.identifier)) nodes.set(issue.identifier, { issue, context, children: [] });
  };
  // Pages load one after another, so an issue moved mid-load can report a parent that is already
  // its descendant; that link is dropped so the tree stays a tree.
  const isAncestorOf = (candidate: string, id: string) => {
    for (let at: string | undefined = candidate; at; at = parentOf.get(at))
      if (at === id) return true;
    return false;
  };
  for (const issue of issues) add(issue, false);
  for (const issue of issues) {
    let child = issue.identifier;
    for (let ancestor = issue.parent; ancestor; ancestor = ancestor.parent) {
      add(ancestorAsSubIssue(ancestor), true);
      if (!parentOf.has(child) && !isAncestorOf(ancestor.identifier, child)) {
        parentOf.set(child, ancestor.identifier);
      }
      child = ancestor.identifier;
    }
  }
  for (const [id, node] of nodes) {
    const parent = parentOf.get(id);
    if (parent) nodes.get(parent)?.children.push(node);
  }
  const flatten = (
    list: readonly MilestoneTreeNode[],
    depth: number,
    guides: readonly boolean[],
  ): LinearSubIssueRow[] => {
    const sorted =
      depth === 0 ? list : list.toSorted((left, right) => bySortOrder(left.issue, right.issue));
    return sorted.flatMap((node, index) => {
      const isLast = index === sorted.length - 1;
      const progressNodes = node.issue.children.nodes;
      return [
        {
          issue: node.issue,
          depth,
          isLast,
          guides,
          context: node.context,
          progress: progressNodes.length > 0 ? subIssueProgress(progressNodes) : null,
          blocks: relationGroups(node.issue).filter(
            (group) => group.kind === "blocked-by" || group.kind === "blocking",
          ),
        },
        ...flatten(node.children, depth + 1, depth === 0 ? [] : [...guides, !isLast]),
      ];
    });
  };
  const roots = new Set<MilestoneTreeNode>();
  for (const issue of issues) {
    let id = issue.identifier;
    for (let parent = parentOf.get(id); parent && nodes.has(parent); parent = parentOf.get(id))
      id = parent;
    roots.add(nodes.get(id)!);
  }
  return flatten([...roots], 0, []);
}

/** Each row's estimation type: milestone issues and their ancestors can come from different teams. */
export function milestoneEstimationTypes(
  issues: readonly LinearMilestoneIssue[],
): Map<string, string> {
  const types = new Map<string, string>();
  for (const issue of issues) {
    types.set(issue.identifier, issue.team.issueEstimationType);
    for (let ancestor = issue.parent; ancestor; ancestor = ancestor.parent) {
      types.set(ancestor.identifier, ancestor.team.issueEstimationType);
    }
  }
  return types;
}
