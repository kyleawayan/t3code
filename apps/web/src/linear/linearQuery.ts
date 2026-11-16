// GraphQL can't recurse, so nesting is spelled out: six ancestors for the breadcrumb, four
// levels of sub-issue rows, and one more level counted toward progress.
export const LINEAR_ISSUE_QUERY = `
fragment LinearState on WorkflowState { name type color }
fragment LinearIssueRef on Issue { identifier title state { ...LinearState } }
fragment LinearRelatedIssue on Issue {
  ...LinearIssueRef
  priority
  assignee { displayName avatarUrl }
}
fragment LinearSubIssue on Issue {
  ...LinearIssueRef
  subIssueSortOrder
  estimate
  assignee { displayName avatarUrl }
  labels(first: 10) { nodes { name color } }
  cycle { number }
  relations(first: 10) { nodes { type relatedIssue { ...LinearRelatedIssue } } }
  inverseRelations(first: 10) { nodes { type issue { ...LinearRelatedIssue } } }
}
fragment LinearProgress on Issue {
  state { type }
  children(first: 25) {
    nodes {
      state { type }
      children(first: 10) {
        nodes { state { type } children(first: 10) { nodes { state { type } } } }
      }
    }
  }
}
query LinearIssue($id: String!) {
  issue(id: $id) {
    identifier title description url branchName priority priorityLabel estimate dueDate createdAt
    state { ...LinearState }
    team { issueEstimationType states(first: 50) { nodes { name type position } } }
    creator { displayName avatarUrl }
    assignee { displayName avatarUrl }
    labels(first: 25) { nodes { name color } }
    cycle { number name startsAt endsAt }
    project { name color }
    parent {
      ...LinearIssueRef
      parent {
        ...LinearIssueRef
        parent {
          ...LinearIssueRef
          parent { ...LinearIssueRef parent { ...LinearIssueRef parent { ...LinearIssueRef } } }
        }
      }
      children(first: 50) { nodes { ...LinearProgress } }
    }
    children(first: 50) {
      nodes {
        ...LinearSubIssue
        children(first: 25) {
          nodes {
            ...LinearSubIssue
            children(first: 10) {
              nodes {
                ...LinearSubIssue
                children(first: 10) {
                  nodes { ...LinearSubIssue children(first: 10) { nodes { state { type } } } }
                }
              }
            }
          }
        }
      }
    }
    attachments(first: 25) { nodes { id title subtitle url createdAt } }
    relations(first: 25) { nodes { type relatedIssue { ...LinearRelatedIssue } } }
    inverseRelations(first: 25) { nodes { type issue { ...LinearRelatedIssue } } }
    comments(first: 50) {
      nodes {
        id body createdAt parent { id }
        user { displayName avatarUrl } botActor { name } externalUser { name }
      }
    }
    history(first: 50) {
      nodes {
        id createdAt
        actor { displayName avatarUrl } botActor { name }
        fromState { ...LinearState } toState { ...LinearState }
        addedLabels { name color } removedLabels { name color }
        fromAssignee { displayName } toAssignee { displayName }
        fromPriority toPriority fromCycle { number } toCycle { number }
        fromParent { identifier } toParent { identifier }
        relationChanges { identifier type }
      }
    }
  }
}
`;

export const LINEAR_SEARCH_QUERY = `
query LinearSearch($term: String!) {
  searchIssues(term: $term, first: 20) { nodes { identifier title state { name type color } } }
}
`;

export const LINEAR_MY_ISSUES_QUERY = `
query LinearMyIssues {
  viewer {
    assignedIssues(
      first: 25
      orderBy: updatedAt
      filter: { state: { type: { nin: ["completed", "canceled"] } } }
    ) { nodes { identifier title state { name type color } } }
  }
}
`;
