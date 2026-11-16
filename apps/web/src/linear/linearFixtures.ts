import type {
  LinearIssue,
  LinearRelatedIssue,
  LinearState,
  LinearSubIssue,
  LinearUser,
} from "./linearTypes";

/** Placeholder data shaped like real `LINEAR_ISSUE_QUERY` responses, for tests and visual checks. */

const STATES = {
  backlog: { name: "Backlog", type: "backlog", color: "#bec2c8" },
  todo: { name: "Todo", type: "unstarted", color: "#e2e2e2" },
  inProgress: { name: "In Progress", type: "started", color: "#f2c94c" },
  inReview: { name: "In Review", type: "started", color: "#0f783c" },
  done: { name: "Done", type: "completed", color: "#5e6ad2" },
  canceled: { name: "Canceled", type: "canceled", color: "#95a2b3" },
} satisfies Record<string, LinearState>;

const TEAM = {
  issueEstimationType: "fibonacci",
  states: {
    nodes: Object.values(STATES).map((state, position) => ({
      name: state.name,
      type: state.type,
      position,
    })),
  },
};

const EXAMPLE_USER: LinearUser = {
  displayName: "Example User",
  avatarUrl: null,
  avatarBackgroundColor: "#4cb782",
};
// No avatar color, as some API responses send.
const OTHER_USER: LinearUser = { displayName: "Sam Rivera", avatarUrl: null };
const BUG = { name: "Bug", color: "#EB5757" };
const FOLLOW_UP = { name: "Follow-up", color: "#4cb782" };
const SAMPLE_IMAGE =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="200"><defs><linearGradient id="g" x2="1" y2="1"><stop offset="0" stop-color="#2b4fd8"/><stop offset="1" stop-color="#d84fd8"/></linearGradient></defs><rect width="640" height="200" fill="url(#g)"/></svg>',
  );

const related = (identifier: string, title: string, state: LinearState): LinearRelatedIssue => ({
  identifier,
  title,
  state,
  priority: 0,
  assignee: null,
});

const subIssue = (
  identifier: string,
  title: string,
  state: LinearState,
  sortOrder: number,
  extra: Partial<LinearSubIssue> = {},
): LinearSubIssue => ({
  identifier,
  title,
  state,
  subIssueSortOrder: sortOrder,
  estimate: null,
  assignee: EXAMPLE_USER,
  labels: { nodes: [] },
  cycle: null,
  relations: { nodes: [] },
  inverseRelations: { nodes: [] },
  children: { nodes: [] },
  ...extra,
});

const NESTED = subIssue("ENG-7", "Nested sub-issue one level deeper", STATES.inProgress, 10, {
  cycle: { number: 10 },
});

const IN_REVIEW = subIssue("ENG-3", "Sub-issue waiting on review", STATES.inReview, 20, {
  labels: { nodes: [BUG] },
  cycle: { number: 10 },
  relations: {
    nodes: [{ type: "blocks", relatedIssue: related("ENG-4", "Blocked next step", STATES.todo) }],
  },
  children: { nodes: [NESTED] },
});

const ROOT_REF = {
  identifier: "ENG-1",
  title: "Sample issue for the Linear tab",
  state: STATES.inProgress,
};

const EMPTY = {
  attachments: { nodes: [] },
  relations: { nodes: [] },
  inverseRelations: { nodes: [] },
  comments: { nodes: [] },
  history: { nodes: [] },
  children: { nodes: [] },
} as const;

export const LINEAR_FIXTURE_ROOT: LinearIssue = {
  ...ROOT_REF,
  description: [
    "This issue shows every part of a Linear issue page.",
    "",
    "## What the tab must show",
    "",
    "It covers **bold**, *italic*, `inline code`, ~~strikethrough~~, and a [link to the docs](<https://linear.app/docs>).",
    "",
    "* Bullet one",
    "* Bullet two",
    "  * Nested bullet",
    "",
    "- [X] Create the sample issue",
    "- [ ] Take a screenshot",
    "",
    "> A quote block.",
    "",
    "```ts",
    'const issue = await linear.issue("ENG-1");',
    "```",
    "",
    "| Field | Example |",
    "| -- | -- |",
    "| Status | In Progress |",
    "",
    `![Sample diagram](${SAMPLE_IMAGE})`,
    "",
    "```mermaid",
    "flowchart LR",
    "  Chat[Chat link] --> Tab[Linear tab]",
    "  Tab --> Sub[Sub-issue]",
    "```",
    "",
    "+++ Agent notes",
    "",
    "A collapsible section.",
    "",
    "+++",
  ].join("\n"),
  url: "https://linear.app/my-workspace/issue/ENG-1/sample-issue-for-the-linear-tab",
  branchName: "example/eng-1-sample-issue-for-the-linear-tab",
  priority: 2,
  priorityLabel: "High",
  estimate: 3,
  dueDate: "2026-11-20",
  createdAt: "2026-11-16T06:24:45.016Z",
  team: TEAM,
  creator: EXAMPLE_USER,
  assignee: EXAMPLE_USER,
  labels: { nodes: [BUG, FOLLOW_UP] },
  cycle: {
    number: 10,
    name: null,
    startsAt: "2026-11-16T08:00:00.000Z",
    endsAt: "2026-11-30T08:00:00.000Z",
  },
  project: null,
  parent: null,
  children: {
    nodes: [
      subIssue("ENG-6", "Dropped approach", STATES.canceled, 50),
      subIssue("ENG-5", "Someday idea", STATES.backlog, 40, {
        assignee: null,
        inverseRelations: {
          nodes: [
            {
              type: "related",
              issue: related("ENG-1", "Sample issue for the Linear tab", STATES.inProgress),
            },
          ],
        },
      }),
      subIssue("ENG-4", "Blocked next step", STATES.todo, 30, {
        assignee: null,
        cycle: { number: 10 },
        inverseRelations: {
          nodes: [
            {
              type: "blocks",
              issue: related("ENG-3", "Sub-issue waiting on review", STATES.inReview),
            },
          ],
        },
      }),
      IN_REVIEW,
      subIssue("ENG-2", "Finished step", STATES.done, 10, { assignee: OTHER_USER }),
    ],
  },
  attachments: {
    nodes: [
      {
        id: "attachment-docs",
        title: "Linear GraphQL API docs",
        subtitle: "Linear's public API is built using GraphQL.",
        url: "https://linear.app/developers/graphql",
        createdAt: "2026-11-16T06:24:45.771Z",
      },
      {
        id: "attachment-repo",
        title: "Example repository",
        subtitle: "",
        url: "https://github.com/example/repo",
        createdAt: "2026-11-16T06:24:45.728Z",
      },
    ],
  },
  relations: {
    nodes: [
      {
        type: "related",
        relatedIssue: related("ENG-5", "Someday idea", STATES.backlog),
      },
    ],
  },
  inverseRelations: { nodes: [] },
  comments: {
    nodes: [
      {
        id: "comment-reply",
        body: "A threaded reply to the first comment.",
        createdAt: "2026-11-16T06:25:28.994Z",
        parent: { id: "comment-first" },
        user: EXAMPLE_USER,
        botActor: null,
        externalUser: null,
      },
      {
        id: "comment-second",
        body: "Second comment, with a checklist and code:\n\n- [x] Sub-issues created\n- [ ] Screenshot taken\n\n```sh\nvp run dev\n```",
        createdAt: "2026-11-16T06:25:24.786Z",
        parent: null,
        user: EXAMPLE_USER,
        botActor: null,
        externalUser: null,
      },
      {
        id: "comment-first",
        body: "First comment. It has **bold** text and `inline code`.",
        createdAt: "2026-11-16T06:25:24.359Z",
        parent: null,
        user: EXAMPLE_USER,
        botActor: { name: "MCP" },
        externalUser: null,
      },
    ],
  },
  history: {
    nodes: [
      {
        id: "history-related",
        createdAt: "2026-11-16T06:25:23.808Z",
        actor: EXAMPLE_USER,
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
        relationChanges: [{ identifier: "ENG-5", type: "ar" }],
      },
      {
        id: "history-cycle",
        createdAt: "2026-11-16T06:25:30.000Z",
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
        fromCycle: { number: 9 },
        toCycle: { number: 10 },
        fromParent: null,
        toParent: null,
        relationChanges: null,
      },
    ],
  },
};

const ROOT_PROGRESS_CHILDREN = LINEAR_FIXTURE_ROOT.children.nodes.map((node) => ({
  state: { type: node.state.type },
  children: { nodes: node.children.nodes.map((child) => ({ state: { type: child.state.type } })) },
}));

export const LINEAR_FIXTURE_IN_REVIEW: LinearIssue = {
  ...EMPTY,
  identifier: IN_REVIEW.identifier,
  title: IN_REVIEW.title,
  state: IN_REVIEW.state,
  description: "A sub-issue in review. It has its own sub-issue, to test a deeper breadcrumb.",
  url: "https://linear.app/my-workspace/issue/ENG-3/sub-issue-waiting-on-review",
  branchName: "example/eng-3-sub-issue-waiting-on-review",
  priority: 1,
  priorityLabel: "Urgent",
  estimate: null,
  dueDate: null,
  createdAt: "2026-11-16T06:25:01.806Z",
  team: TEAM,
  creator: EXAMPLE_USER,
  assignee: EXAMPLE_USER,
  labels: { nodes: [BUG] },
  cycle: LINEAR_FIXTURE_ROOT.cycle,
  project: null,
  parent: { ...ROOT_REF, parent: null, children: { nodes: ROOT_PROGRESS_CHILDREN } },
  children: { nodes: [NESTED] },
  relations: {
    nodes: [
      {
        type: "blocks",
        relatedIssue: related("ENG-4", "Blocked next step", STATES.todo),
      },
    ],
  },
};

export const LINEAR_FIXTURE_NESTED: LinearIssue = {
  ...EMPTY,
  identifier: NESTED.identifier,
  title: NESTED.title,
  state: NESTED.state,
  description: "A sub-issue of a sub-issue. Its breadcrumb shows both parents.",
  url: "https://linear.app/my-workspace/issue/ENG-7/nested-sub-issue-one-level-deeper",
  branchName: "example/eng-7-nested-sub-issue-one-level-deeper",
  priority: 2,
  priorityLabel: "High",
  estimate: 3,
  dueDate: null,
  createdAt: "2026-11-16T06:25:20.305Z",
  team: TEAM,
  creator: EXAMPLE_USER,
  assignee: EXAMPLE_USER,
  labels: { nodes: [] },
  cycle: LINEAR_FIXTURE_ROOT.cycle,
  project: null,
  parent: {
    identifier: IN_REVIEW.identifier,
    title: IN_REVIEW.title,
    state: IN_REVIEW.state,
    parent: ROOT_REF,
    children: { nodes: [{ state: { type: NESTED.state.type } }] },
  },
};

export const LINEAR_FIXTURE_ISSUES: Readonly<Record<string, LinearIssue>> = {
  [LINEAR_FIXTURE_ROOT.identifier]: LINEAR_FIXTURE_ROOT,
  [LINEAR_FIXTURE_IN_REVIEW.identifier]: LINEAR_FIXTURE_IN_REVIEW,
  [LINEAR_FIXTURE_NESTED.identifier]: LINEAR_FIXTURE_NESTED,
};
