/** The shapes `LINEAR_ISSUE_QUERY` returns, kept close to Linear's GraphQL schema. */

interface Nodes<T> {
  readonly nodes: readonly T[];
}

export interface LinearState {
  readonly name: string;
  readonly type: string;
  readonly color: string;
}

export interface LinearUser {
  readonly displayName: string;
  readonly avatarUrl: string | null;
  /** The color Linear gives the initial when the user has no picture. */
  readonly avatarBackgroundColor?: string | null;
}

export interface LinearLabel {
  readonly name: string;
  readonly color: string;
}

export interface LinearIssueRef {
  readonly identifier: string;
  readonly title: string;
  readonly state: LinearState;
}

export interface LinearRelatedIssue extends LinearIssueRef {
  readonly priority: number;
  readonly assignee: LinearUser | null;
}

export interface LinearAncestor extends LinearIssueRef {
  readonly parent?: LinearAncestor | null;
}

interface LinearProgressNode {
  readonly state: { readonly type: string };
  readonly children?: Nodes<LinearProgressNode>;
}

export interface LinearSubIssue extends LinearIssueRef {
  readonly subIssueSortOrder: number | null;
  readonly estimate: number | null;
  readonly assignee: LinearUser | null;
  readonly labels: Nodes<LinearLabel>;
  readonly cycle: { readonly number: number } | null;
  readonly projectMilestone?: LinearMilestoneRef | null;
  readonly relations: Nodes<{ readonly type: string; readonly relatedIssue: LinearRelatedIssue }>;
  readonly inverseRelations: Nodes<{ readonly type: string; readonly issue: LinearRelatedIssue }>;
  readonly children: Nodes<LinearSubIssue | LinearProgressNode>;
}

export interface LinearMilestoneRef {
  readonly id: string;
  readonly name: string;
}
export interface LinearCycle {
  readonly number: number;
  readonly name: string | null;
  readonly startsAt: string;
  readonly endsAt: string;
}

export interface LinearComment {
  readonly id: string;
  readonly body: string;
  readonly createdAt: string;
  readonly parent: { readonly id: string } | null;
  readonly user: LinearUser | null;
  readonly botActor: { readonly name: string | null } | null;
  readonly externalUser: { readonly name: string } | null;
}

export interface LinearHistoryEntry {
  readonly id: string;
  readonly createdAt: string;
  readonly actor: LinearUser | null;
  readonly botActor: { readonly name: string | null } | null;
  readonly fromState: LinearState | null;
  readonly toState: LinearState | null;
  readonly addedLabels: readonly LinearLabel[] | null;
  readonly removedLabels: readonly LinearLabel[] | null;
  readonly fromAssignee: { readonly displayName: string } | null;
  readonly toAssignee: { readonly displayName: string } | null;
  readonly fromPriority: number | null;
  readonly toPriority: number | null;
  readonly fromCycle: { readonly number: number } | null;
  readonly toCycle: { readonly number: number } | null;
  readonly fromParent: { readonly identifier: string } | null;
  readonly toParent: { readonly identifier: string } | null;
  readonly relationChanges:
    | readonly { readonly identifier: string; readonly type: string }[]
    | null;
}

export interface LinearAttachment {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string | null;
  readonly url: string;
  readonly createdAt: string;
}

export interface LinearIssue extends LinearIssueRef {
  readonly description: string | null;
  readonly url: string;
  readonly branchName: string;
  readonly priority: number;
  readonly priorityLabel: string;
  readonly estimate: number | null;
  readonly dueDate: string | null;
  readonly createdAt: string;
  readonly team: {
    readonly key: string;
    readonly issueEstimationType: string;
    readonly states: Nodes<{
      readonly name: string;
      readonly type: string;
      readonly position: number;
    }>;
  };
  readonly creator: LinearUser | null;
  readonly assignee: LinearUser | null;
  readonly labels: Nodes<LinearLabel>;
  readonly cycle: LinearCycle | null;
  readonly project: { readonly name: string; readonly color: string; readonly url: string } | null;
  readonly projectMilestone?: LinearMilestoneRef | null;
  readonly parent: (LinearAncestor & { readonly children: Nodes<LinearProgressNode> }) | null;
  readonly children: Nodes<LinearSubIssue>;
  readonly attachments: Nodes<LinearAttachment>;
  readonly relations: Nodes<{ readonly type: string; readonly relatedIssue: LinearRelatedIssue }>;
  readonly inverseRelations: Nodes<{ readonly type: string; readonly issue: LinearRelatedIssue }>;
  readonly comments: Nodes<LinearComment>;
  readonly history: Nodes<LinearHistoryEntry>;
}

/** A milestone's issues carry their team, since one milestone can hold several teams' issues. */
export interface LinearMilestoneIssue extends LinearSubIssue {
  readonly team: { readonly issueEstimationType: string };
}
/** The shape `LINEAR_MILESTONE_QUERY` returns. */
export interface LinearMilestone {
  readonly id: string;
  readonly name: string;
  readonly targetDate: string | null;
  readonly project: { readonly name: string; readonly color: string; readonly url: string };
  readonly issues: Nodes<LinearMilestoneIssue>;
}
