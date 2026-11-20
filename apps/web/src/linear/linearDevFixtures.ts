// oxlint-disable t3code/no-untranslated-copy -- Fork-only English copy, kept out of upstream's translation catalogs.
import type {
  LinearAncestor,
  LinearComment,
  LinearHistoryEntry,
  LinearIssue,
  LinearLabel,
  LinearRelatedIssue,
  LinearState,
  LinearSubIssue,
  LinearUser,
} from "./linearTypes";

/**
 * Dev-only issues behind `FIX-` keys, loaded instead of Linear in dev builds (see
 * `fetchLinearIssue`). FIX-2901 packs every part the tab draws; each sub-issue opens as its own page.
 */

const STATES = {
  triage: { name: "Triage", type: "triage", color: "#fc7840" },
  backlog: { name: "Backlog", type: "backlog", color: "#bec2c8" },
  todo: { name: "Todo", type: "unstarted", color: "#e2e2e2" },
  inProgress: { name: "In Progress", type: "started", color: "#f2c94c" },
  inReview: { name: "In Review", type: "started", color: "#0f783c" },
  qa: { name: "QA", type: "started", color: "#26b5ce" },
  done: { name: "Done", type: "completed", color: "#5e6ad2" },
  canceled: { name: "Canceled", type: "canceled", color: "#95a2b3" },
  duplicate: { name: "Duplicate", type: "duplicate", color: "#95a2b3" },
} satisfies Record<string, LinearState>;

const TEAM = {
  key: "FIX",
  issueEstimationType: "fibonacci",
  states: {
    nodes: Object.values(STATES).map((state, position) => ({
      name: state.name,
      type: state.type,
      position,
    })),
  },
};

const AVATAR =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#7c5cff"/><circle cx="32" cy="26" r="12" fill="#fff"/><rect x="14" y="42" width="36" height="18" rx="9" fill="#fff"/></svg>',
  );

const USERS = {
  alex: { displayName: "Alex Kim", avatarUrl: AVATAR, avatarBackgroundColor: "#7c5cff" },
  sam: { displayName: "Sam Rivera", avatarUrl: null, avatarBackgroundColor: "#4cb782" },
  jo: { displayName: "Jo Park", avatarUrl: null, avatarBackgroundColor: "#eb5757" },
  noColor: { displayName: "Morgan Lee", avatarUrl: null },
} satisfies Record<string, LinearUser>;

const LABELS = {
  bug: { name: "Bug", color: "#eb5757" },
  feature: { name: "Feature", color: "#bb87fc" },
  perf: { name: "Performance", color: "#f2994a" },
  a11y: { name: "Accessibility", color: "#26b5ce" },
  desktop: { name: "Desktop only", color: "#4ea7fc" },
  long: { name: "Needs a decision from the design review", color: "#95a2b3" },
  regression: { name: "Regression", color: "#f7c8c1" },
  followUp: { name: "Follow-up", color: "#4cb782" },
} satisfies Record<string, LinearLabel>;

const DAY = 86_400_000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const dateOnly = (offsetDays: number) =>
  new Date(Date.now() + offsetDays * DAY).toISOString().slice(0, 10);

const CYCLE = {
  number: 21,
  name: null,
  startsAt: new Date(Date.now() - 5 * DAY).toISOString(),
  endsAt: new Date(Date.now() + 9 * DAY).toISOString(),
};

const ref = (identifier: string, title: string, state: LinearState): LinearRelatedIssue => ({
  identifier,
  title,
  state,
  priority: 0,
  assignee: null,
});

interface Node {
  readonly id: string;
  readonly title: string;
  readonly state: LinearState;
  readonly extra?: Partial<Omit<LinearSubIssue, "children">>;
  readonly children?: readonly Node[];
}

// The sub-issue tree under FIX-2901: four levels, every state, and each relation kind.
const TREE: readonly Node[] = [
  {
    id: "FIX-2902",
    title: "Done step with three labels and a five-point estimate",
    state: STATES.done,
    extra: { estimate: 5, labels: { nodes: [LABELS.bug, LABELS.perf, LABELS.desktop] } },
  },
  {
    // Over the top on purpose: with this many chips its title squishes away entirely in a
    // narrow panel. Funny, and the test the squish needs.
    id: "FIX-2903",
    title:
      "In review: a deliberately long sub-issue title that has to squish and then truncate in a narrow panel",
    state: STATES.inReview,
    extra: {
      estimate: 3,
      assignee: USERS.alex,
      labels: { nodes: [LABELS.feature, LABELS.long] },
      cycle: { number: 21 },
      relations: {
        nodes: [
          { type: "blocks", relatedIssue: ref("FIX-2909", "Blocked by FIX-2903", STATES.todo) },
        ],
      },
    },
    children: [
      {
        id: "FIX-2904",
        title: "Nested in progress",
        state: STATES.inProgress,
        extra: { estimate: 2, assignee: USERS.sam },
        children: [
          {
            id: "FIX-2905",
            title: "Third level QA",
            state: STATES.qa,
            extra: { assignee: USERS.noColor },
            children: [
              { id: "FIX-2906", title: "Fourth level todo", state: STATES.todo },
              { id: "FIX-2907", title: "Fourth level done", state: STATES.done },
            ],
          },
          { id: "FIX-2908", title: "Third level canceled", state: STATES.canceled },
        ],
      },
    ],
  },
  {
    id: "FIX-2909",
    title: "Todo, blocked by FIX-2903",
    state: STATES.todo,
    extra: {
      estimate: 8,
      assignee: USERS.jo,
      inverseRelations: {
        nodes: [{ type: "blocks", issue: ref("FIX-2903", "In review", STATES.inReview) }],
      },
    },
  },
  {
    id: "FIX-2910",
    title: "Blocked only by a finished issue, so it reads as related",
    state: STATES.todo,
    extra: {
      inverseRelations: {
        nodes: [{ type: "blocks", issue: ref("FIX-2902", "Done step", STATES.done) }],
      },
    },
  },
  {
    id: "FIX-2911",
    title: "Blocks two issues at once",
    state: STATES.inProgress,
    extra: {
      assignee: USERS.alex,
      relations: {
        nodes: [
          { type: "blocks", relatedIssue: ref("FIX-2912", "Backlog idea", STATES.backlog) },
          { type: "blocks", relatedIssue: ref("FIX-2913", "Triage report", STATES.triage) },
        ],
      },
    },
  },
  { id: "FIX-2912", title: "Backlog idea with no assignee", state: STATES.backlog },
  {
    id: "FIX-2913",
    title: "Triage report from a customer",
    state: STATES.triage,
    extra: { labels: { nodes: [LABELS.regression] } },
  },
  { id: "FIX-2914", title: "Duplicate of FIX-2913", state: STATES.duplicate },
  {
    id: "FIX-2915",
    title: "Accessibility pass",
    state: STATES.inReview,
    extra: { estimate: 13, labels: { nodes: [LABELS.a11y] }, assignee: USERS.sam },
    children: [
      { id: "FIX-2916", title: "Screen reader labels", state: STATES.done },
      { id: "FIX-2917", title: "Contrast fixes", state: STATES.inProgress },
      { id: "FIX-2918", title: "Keyboard order", state: STATES.todo },
    ],
  },
];

function subIssue(node: Node, order: number): LinearSubIssue {
  return {
    identifier: node.id,
    title: node.title,
    state: node.state,
    subIssueSortOrder: order,
    estimate: null,
    assignee: null,
    labels: { nodes: [] },
    cycle: null,
    relations: { nodes: [] },
    inverseRelations: { nodes: [] },
    ...node.extra,
    children: { nodes: (node.children ?? []).map((child, index) => subIssue(child, index)) },
  };
}

interface Progress {
  readonly state: { readonly type: string };
  readonly children: { readonly nodes: readonly Progress[] };
}

const progress = (nodes: readonly Node[]): Progress[] =>
  nodes.map((node) => ({
    state: { type: node.state.type },
    children: { nodes: progress(node.children ?? []) },
  }));

const DESCRIPTION = [
  "A local fixture that shows every part of the Linear tab at once. Nothing here comes from Linear.",
  "",
  "## Text",
  "",
  "**Bold**, *italic*, `inline code`, ~~strikethrough~~, a [link](<https://linear.app/docs>), and a very long unbroken URL: https://example.com/a/very/long/path/that/keeps/going/and/going/so/the/panel/has/to/wrap/it/somewhere",
  "",
  "> A quote.",
  ">",
  "> > A nested quote.",
  "",
  "### Lists",
  "",
  "1. First",
  "2. Second",
  "   * Nested bullet",
  "     * Third level",
  "3. Third",
  "",
  "- [x] Done task",
  "- [ ] Open task",
  "  - [ ] Open sub-task under it",
  "  - [x] Done sub-task",
  "",
  "### Code",
  "",
  "```ts",
  "export function clamp(value: number, min: number, max: number): number {",
  "  return Math.min(Math.max(value, min), max); // a long trailing comment that runs past the panel edge",
  "}",
  "```",
  "",
  "```json",
  '{ "fixture": true, "levels": 4, "relations": ["blocks", "related", "duplicate"] }',
  "```",
  "",
  "### Table",
  "",
  "| Area | Owner | State | Estimate | Cycle | Labels | Notes |",
  "| -- | -- | -- | --: | -- | -- | -- |",
  "| Sub-issues | Alex | In Review | 3 | 21 | Feature | Four levels deep |",
  "| Relations | Jo | Todo | 8 | none | none | Every kind, including a finished blocker |",
  "| Activity | Sam | Done | 5 | 20 | Bug, Performance | Icons, dates, threads |",
  "",
  "```mermaid",
  "flowchart LR",
  "  subgraph Tab[Linear tab]",
  "    direction TB",
  "    Header --> Title --> Properties --> Description",
  "    Description --> SubIssues[Sub-issues] --> Resources --> Activity",
  "  end",
  "  Fixture[(Local fixture)] --> Tab",
  "```",
  "",
  "+++ Agent notes",
  "",
  "A collapsible section with a list and code:",
  "",
  "* Opens from the search panel in dev builds",
  "* Every sub-issue opens as its own page",
  "",
  "```sh",
  "vp run dev",
  "```",
  "",
  "+++",
  "",
  "+++ Second collapsible",
  "",
  "Collapsed sections can repeat.",
  "",
  "+++",
].join("\n");

const comment = (
  id: string,
  body: string,
  at: number,
  author: Partial<Pick<LinearComment, "user" | "botActor" | "externalUser">>,
  parent: string | null = null,
): LinearComment => ({
  id,
  body,
  createdAt: ago(at),
  parent: parent ? { id: parent } : null,
  user: null,
  botActor: null,
  externalUser: null,
  ...author,
});

const EMPTY_HISTORY: Omit<LinearHistoryEntry, "id" | "createdAt"> = {
  actor: null,
  botActor: null,
  fromState: null,
  toState: null,
  addedLabels: null,
  removedLabels: null,
  fromAssignee: null,
  toAssignee: null,
  fromPriority: null,
  toPriority: null,
  fromCycle: null,
  toCycle: null,
  fromParent: null,
  toParent: null,
  relationChanges: null,
};

const history = (
  id: string,
  at: number,
  change: Partial<Omit<LinearHistoryEntry, "id" | "createdAt">>,
): LinearHistoryEntry => ({ ...EMPTY_HISTORY, ...change, id, createdAt: ago(at) });

const ANCESTORS: LinearAncestor = {
  identifier: "FIX-3001",
  title: "Fixture project milestone with its own long title",
  state: STATES.inProgress,
  parent: { identifier: "FIX-3000", title: "Fixture initiative", state: STATES.todo },
};

const ROOT: LinearIssue = {
  identifier: "FIX-2901",
  title:
    "Complex sample: everything the Linear tab draws at once, with a title long enough to wrap",
  state: STATES.inProgress,
  description: DESCRIPTION,
  url: "https://linear.app/my-workspace/issue/FIX-2901/complex-sample",
  branchName: "example/fix-2901-complex-sample",
  priority: 1,
  priorityLabel: "Urgent",
  estimate: 8,
  dueDate: dateOnly(-2),
  createdAt: ago(400 * DAY),
  team: TEAM,
  creator: null,
  assignee: USERS.alex,
  labels: { nodes: [LABELS.bug, LABELS.feature, LABELS.perf, LABELS.desktop, LABELS.long] },
  cycle: CYCLE,
  project: {
    name: "Fixture project",
    color: "#bb87fc",
    url: "https://linear.app/fixture/project/fixture-project-0123456789ab",
  },
  parent: {
    ...ANCESTORS,
    children: { nodes: [{ state: { type: "started" } }, { state: { type: "completed" } }] },
  },
  children: { nodes: TREE.map((node, index) => subIssue(node, index)) },
  attachments: {
    nodes: [
      {
        id: "fix-pr",
        title: "Pull request: show every part of the Linear tab in one fixture",
        subtitle: "Open · 12 checks passing",
        url: "https://github.com/example/repo/pull/1",
        createdAt: ago(3 * DAY),
      },
      {
        id: "fix-docs",
        title: "Linear GraphQL API",
        subtitle: "Developer docs",
        url: "https://linear.app/developers/graphql",
        createdAt: ago(40 * DAY),
      },
      {
        id: "fix-design",
        title: "Design file",
        subtitle: null,
        url: "https://example.com/design/linear-tab",
        createdAt: ago(5 * 60_000),
      },
    ],
  },
  relations: {
    nodes: [
      { type: "blocks", relatedIssue: ref("FIX-2930", "Downstream release", STATES.todo) },
      { type: "related", relatedIssue: ref("FIX-2931", "Related research", STATES.backlog) },
      { type: "related", relatedIssue: ref("FIX-2932", "Related bug", STATES.inProgress) },
    ],
  },
  inverseRelations: {
    nodes: [
      { type: "blocks", issue: ref("FIX-2933", "Open blocker", STATES.inReview) },
      { type: "blocks", issue: ref("FIX-2934", "Finished blocker", STATES.done) },
      { type: "duplicate", issue: ref("FIX-2935", "Duplicate report", STATES.duplicate) },
    ],
  },
  comments: {
    nodes: [
      comment("c-1", "First comment with **bold** and `code`.", 30 * DAY, { user: USERS.sam }),
      comment("c-1a", "A reply in the thread.", 29 * DAY, { user: USERS.alex }, "c-1"),
      comment(
        "c-1b",
        "A second reply from someone without a picture.",
        28 * DAY,
        {
          user: USERS.noColor,
        },
        "c-1",
      ),
      comment(
        "c-2",
        "A long comment:\n\n| Check | Result |\n| -- | -- |\n| Tests | pass |\n| Lint | pass |\n\n```sh\nvp test run src/linear\n```\n\n- [x] Reviewed\n- [ ] Merged",
        9 * DAY,
        { user: USERS.jo },
      ),
      comment("c-3", "Posted by an integration.", 2 * DAY, {
        botActor: { name: "GitHub" },
      }),
      comment("c-4", "Synced from a customer conversation.", 3 * 3_600_000, {
        externalUser: { name: "Customer via Slack" },
      }),
      comment("c-5", "Posted through MCP on a person's behalf.", 20 * 60_000, {
        user: USERS.alex,
        botActor: { name: "MCP" },
      }),
    ],
  },
  history: {
    nodes: [
      history("h-1", 399 * DAY, { actor: USERS.alex, toState: STATES.backlog }),
      history("h-2", 300 * DAY, {
        actor: USERS.sam,
        addedLabels: [LABELS.bug, LABELS.perf],
      }),
      history("h-3", 200 * DAY, { actor: USERS.sam, removedLabels: [LABELS.followUp] }),
      history("h-4", 120 * DAY, { actor: USERS.alex, fromPriority: 0, toPriority: 3 }),
      history("h-5", 90 * DAY, { actor: USERS.jo, toCycle: { number: 18 } }),
      history("h-6", 74 * DAY, { fromCycle: { number: 18 }, toCycle: { number: 19 } }),
      history("h-7", 62 * DAY, {
        actor: USERS.alex,
        fromState: STATES.backlog,
        toState: STATES.inProgress,
      }),
      history("h-8", 44 * DAY, { actor: USERS.alex, toAssignee: { displayName: "Alex Kim" } }),
      history("h-9", 30 * DAY, {
        actor: USERS.jo,
        relationChanges: [
          { identifier: "FIX-2933", type: "ab" },
          { identifier: "FIX-2930", type: "ax" },
        ],
      }),
      history("h-10", 21 * DAY, {
        actor: USERS.jo,
        relationChanges: [{ identifier: "FIX-2931", type: "ar" }],
      }),
      history("h-11", 14 * DAY, {
        botActor: { name: "GitHub" },
        toState: STATES.inReview,
        fromState: STATES.inProgress,
      }),
      history("h-12", 10 * DAY, {
        actor: USERS.alex,
        fromState: STATES.inReview,
        toState: STATES.inProgress,
      }),
      history("h-13", 6 * DAY, { actor: USERS.sam, toParent: { identifier: "FIX-3001" } }),
      history("h-14", 5 * DAY, { fromCycle: { number: 20 }, toCycle: { number: 21 } }),
      history("h-15", 2 * DAY, { actor: USERS.alex, fromPriority: 3, toPriority: 1 }),
      history("h-16", 5 * 3_600_000, {
        actor: USERS.jo,
        relationChanges: [{ identifier: "FIX-2935", type: "rd" }],
      }),
      history("h-17", 12 * 60_000, {
        actor: USERS.noColor,
        fromAssignee: { displayName: "Sam Rivera" },
        toAssignee: { displayName: "Alex Kim" },
      }),
      history("h-18", 20_000, { actor: USERS.alex, addedLabels: [LABELS.desktop] }),
    ],
  },
};

/** A plain page for each sub-issue, so every row in the tree opens something. */
function pageFor(
  node: Node,
  parent: { identifier: string; title: string; state: LinearState; parent: LinearAncestor | null },
  siblings: readonly Node[],
  order: number,
): LinearIssue[] {
  const row = subIssue(node, order);
  const self: LinearIssue = {
    identifier: node.id,
    title: node.title,
    state: node.state,
    description: `A sub-issue page for ${node.id}, generated from the FIX-2901 tree.`,
    url: `https://linear.app/my-workspace/issue/${node.id}`,
    branchName: `example/${node.id.toLowerCase()}`,
    priority: 0,
    priorityLabel: "No priority",
    estimate: row.estimate,
    dueDate: null,
    createdAt: ago(20 * DAY),
    team: TEAM,
    creator: USERS.sam,
    assignee: row.assignee,
    labels: row.labels,
    cycle: row.cycle ? CYCLE : null,
    project: null,
    parent: { ...parent, children: { nodes: progress(siblings) } },
    children: { nodes: (node.children ?? []).map((child, index) => subIssue(child, index)) },
    attachments: { nodes: [] },
    relations: row.relations,
    inverseRelations: row.inverseRelations,
    comments: { nodes: [] },
    history: {
      nodes: [history(`${node.id}-h`, 19 * DAY, { actor: USERS.sam, toState: node.state })],
    },
  };
  const ancestor: LinearAncestor = {
    identifier: node.id,
    title: node.title,
    state: node.state,
    parent,
  };
  return [
    self,
    ...(node.children ?? []).flatMap((child, index) =>
      pageFor(child, { ...ancestor, parent: ancestor.parent ?? null }, node.children ?? [], index),
    ),
  ];
}

const ROOT_AS_PARENT = {
  identifier: ROOT.identifier,
  title: ROOT.title,
  state: ROOT.state,
  parent: ANCESTORS,
};

/** A bare page for an issue that only appears as a relation or an ancestor. */
const stubPage = (issue: Pick<LinearIssue, "identifier" | "title" | "state">): LinearIssue => ({
  ...issue,
  description: `A stub for ${issue.identifier}, which FIX-2901 links to.`,
  url: `https://linear.app/my-workspace/issue/${issue.identifier}`,
  branchName: `example/${issue.identifier.toLowerCase()}`,
  priority: 0,
  priorityLabel: "No priority",
  estimate: null,
  dueDate: null,
  createdAt: ago(60 * DAY),
  team: TEAM,
  creator: USERS.jo,
  assignee: null,
  labels: { nodes: [] },
  cycle: null,
  project: null,
  parent: null,
  children: { nodes: [] },
  attachments: { nodes: [] },
  relations: { nodes: [] },
  inverseRelations: { nodes: [] },
  comments: { nodes: [] },
  history: { nodes: [] },
});

const pages = [ROOT, ...TREE.flatMap((node, index) => pageFor(node, ROOT_AS_PARENT, TREE, index))];
const linked = [
  ANCESTORS,
  ANCESTORS.parent!,
  ...pages.flatMap((page) => [
    ...page.relations.nodes.map((relation) => relation.relatedIssue),
    ...page.inverseRelations.nodes.map((relation) => relation.issue),
  ]),
];

export const DEV_LINEAR_FIXTURES: Readonly<Record<string, LinearIssue>> = Object.fromEntries([
  ...linked.map((issue) => [issue.identifier, stubPage(issue)] as const),
  ...pages.map((issue) => [issue.identifier, issue] as const),
]);

/** What the dev search panel lists. */
export const DEV_LINEAR_FIXTURE_LIST = [
  ROOT,
  DEV_LINEAR_FIXTURES["FIX-2903"]!,
  DEV_LINEAR_FIXTURES["FIX-2905"]!,
];
