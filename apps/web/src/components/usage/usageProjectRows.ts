import type {
  EnvironmentId,
  UsageBucket,
  UsageProjectPeriod,
  UsageProjectTotal,
  UsageProviderKind,
  UsageTokenTotals,
} from "@t3tools/contracts";

export interface UsageProjectSource {
  readonly environmentId: EnvironmentId;
  readonly environmentLabel: string;
  readonly totals: readonly UsageProjectTotal[];
  /** The same usage by bucket period; servers before this field send none. */
  readonly periods?: readonly UsageProjectPeriod[];
  /** The environment's own usage, so what no folder covers comes from the same data. */
  readonly buckets: readonly Pick<UsageBucket, "provider" | "costUsd" | "totals">[];
}

export interface UsageKnownProject {
  readonly environmentId: EnvironmentId;
  readonly id: string;
  readonly title: string;
  readonly workspaceRoot: string;
}

export interface UsageKnownWorktree {
  readonly environmentId: EnvironmentId;
  readonly projectId: string;
  readonly path: string;
}

export interface UsageProjectRow {
  readonly key: string;
  readonly label: string;
  /** A matched project's root, or the folder itself when no project owns it. */
  readonly path: string;
  readonly environmentLabel: string;
  readonly costUsd: number;
  readonly totalTokens: number;
  readonly sessions: number;
  readonly costByProvider: ReadonlyMap<UsageProviderKind, number>;
  /** Cost by day, or by hour start in an hourly window. */
  readonly costByPeriod: ReadonlyMap<string, number>;
}

// Worktrees whose path names the repository folder: T3 Code's <T3 home>/worktrees/<repo>/<id>, and
// Codex's ~/.codex/worktrees/<id>/<repo>.
const WORKTREE_REPO_PATTERNS = [
  /\/\.t3\/worktrees\/([^/]+)\/[^/]+(?:\/|$)/,
  /\/\.codex\/worktrees\/[^/]+\/([^/]+)(?:\/|$)/,
];
// T3 Code generates titles and commit messages in fresh temporary folders named t3code-*.
const T3_TEMP_FOLDER_PREFIX = "t3code-";
// macOS's per-user temp folder ends in /T; elsewhere it is /tmp or /var/tmp.
const TEMP_PARENT_PATTERN = /(?:\/T|^(?:\/private)?(?:\/var)?\/tmp(?:\/.*)?)$/;

interface RowOwner {
  readonly key: string;
  readonly label: string;
  readonly path: string;
}

function trimTrailingSlash(path: string): string {
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}

function isWithin(path: string, root: string): boolean {
  return path === root || path.startsWith(`${root}/`);
}

function baseName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1) || path;
}

function isT3TempFolder(path: string): boolean {
  return (
    baseName(path).startsWith(T3_TEMP_FOLDER_PREFIX) &&
    TEMP_PARENT_PATTERN.test(path.slice(0, path.lastIndexOf("/")))
  );
}

function tokenTotal(totals: UsageTokenTotals): number {
  // Reasoning tokens are already part of output.
  return (
    totals.uncachedInputTokens +
    totals.cachedInputTokens +
    totals.cacheCreationTokens +
    totals.outputTokens
  );
}

function worktreeRepoName(path: string): string | null {
  for (const pattern of WORKTREE_REPO_PATTERNS) {
    const repo = pattern.exec(path)?.[1];
    if (repo !== undefined) return repo;
  }
  return null;
}

function projectOwner(project: UsageKnownProject): RowOwner {
  return {
    key: `project\u0000${project.id}`,
    label: project.title,
    path: trimTrailingSlash(project.workspaceRoot),
  };
}

function folderOwner(folder: string): RowOwner {
  return { key: `folder\u0000${folder}`, label: baseName(folder), path: folder };
}

/** The deepest project root or thread worktree that contains the folder. */
function projectContaining(
  path: string,
  roots: readonly (readonly [UsageKnownProject, string])[],
): UsageKnownProject | null {
  let owner: UsageKnownProject | null = null;
  let ownerRootLength = -1;
  for (const [project, root] of roots) {
    // The deepest root wins, so a project nested in another keeps its own usage.
    if (isWithin(path, root) && root.length > ownerRootLength) {
      owner = project;
      ownerRootLength = root.length;
    }
  }
  return owner;
}

/** Each folder's row, so worktrees and helper folders join the project they belong to. */
function rowOwners(
  folders: readonly string[],
  projects: readonly UsageKnownProject[],
  worktrees: readonly UsageKnownWorktree[],
): Map<string, RowOwner> {
  const owners = new Map<string, RowOwner>();
  const worktreeFolders: [string, string][] = [];
  const plainFolders: string[] = [];
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const roots: (readonly [UsageKnownProject, string])[] = [
    ...projects.map((project) => [project, trimTrailingSlash(project.workspaceRoot)] as const),
    ...worktrees.flatMap((worktree) => {
      const project = projectById.get(worktree.projectId);
      return project === undefined ? [] : [[project, trimTrailingSlash(worktree.path)] as const];
    }),
  ];
  for (const folder of folders) {
    const project = projectContaining(folder, roots);
    if (project !== null) owners.set(folder, projectOwner(project));
    else if (isT3TempFolder(folder)) {
      owners.set(folder, {
        key: "t3code-text-generation",
        label: "T3 Code text generation",
        path: "Thread titles and commit messages",
      });
    } else {
      const repo = worktreeRepoName(folder);
      if (repo === null) plainFolders.push(folder);
      else worktreeFolders.push([folder, repo]);
    }
  }
  for (const folder of plainFolders) owners.set(folder, folderOwner(folder));
  // A deleted worktree leaves no thread behind; its path still names the repository's folder.
  for (const [folder, repo] of worktreeFolders) {
    const namedProjects = projects.filter(
      (project) => baseName(trimTrailingSlash(project.workspaceRoot)) === repo,
    );
    const namedFolders = plainFolders.filter((candidate) => baseName(candidate) === repo);
    owners.set(
      folder,
      namedProjects.length === 1 && namedProjects[0] !== undefined
        ? projectOwner(namedProjects[0])
        : namedFolders.length === 1 && namedFolders[0] !== undefined
          ? folderOwner(namedFolders[0])
          : { key: `worktrees\u0000${repo}`, label: repo, path: "Worktrees" },
    );
  }
  return owners;
}

export interface UsageProjectTable {
  readonly rows: readonly UsageProjectRow[];
  /** Usage from transcripts that record no folder, such as Cursor's. */
  readonly unfiledCostUsd: number;
  readonly unfiledTokens: number;
}

/** One row per project or unowned folder, most expensive first, and what no folder covers. */
export function buildUsageProjectTable({
  sources,
  projects,
  worktrees,
  hiddenProviders,
}: {
  readonly sources: readonly UsageProjectSource[];
  readonly projects: readonly UsageKnownProject[];
  readonly worktrees: readonly UsageKnownWorktree[];
  readonly hiddenProviders: ReadonlySet<UsageProviderKind>;
}): UsageProjectTable {
  const rows = new Map<
    string,
    {
      label: string;
      path: string;
      environmentLabel: string;
      costUsd: number;
      totalTokens: number;
      sessions: number;
      costByProvider: Map<UsageProviderKind, number>;
      costByPeriod: Map<string, number>;
    }
  >();
  let unfiledCostUsd = 0;
  let unfiledTokens = 0;
  for (const source of sources) {
    const totals = source.totals.filter((total) => !hiddenProviders.has(total.provider));
    const buckets = source.buckets.filter((bucket) => !hiddenProviders.has(bucket.provider));
    const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);
    unfiledCostUsd += Math.max(
      0,
      sum(buckets.map((bucket) => bucket.costUsd)) - sum(totals.map((total) => total.costUsd)),
    );
    unfiledTokens += Math.max(
      0,
      sum(buckets.map((bucket) => tokenTotal(bucket.totals))) -
        sum(totals.map((total) => tokenTotal(total.totals))),
    );
    const owners = rowOwners(
      [...new Set(totals.map((total) => trimTrailingSlash(total.cwd)))],
      projects.filter((project) => project.environmentId === source.environmentId),
      worktrees.filter((worktree) => worktree.environmentId === source.environmentId),
    );
    const rowFor = (cwd: string) => {
      const folder = trimTrailingSlash(cwd);
      const owner = owners.get(folder) ?? folderOwner(folder);
      const key = `${source.environmentId}\u0000${owner.key}`;
      let row = rows.get(key);
      if (row === undefined) {
        row = {
          label: owner.label,
          path: owner.path,
          environmentLabel: source.environmentLabel,
          costUsd: 0,
          totalTokens: 0,
          sessions: 0,
          costByProvider: new Map(),
          costByPeriod: new Map(),
        };
        rows.set(key, row);
      }
      return row;
    };
    for (const total of totals) {
      const row = rowFor(total.cwd);
      row.costUsd += total.costUsd;
      row.totalTokens += tokenTotal(total.totals);
      row.sessions += total.sessions;
      row.costByProvider.set(
        total.provider,
        (row.costByProvider.get(total.provider) ?? 0) + total.costUsd,
      );
    }
    for (const period of source.periods ?? []) {
      if (hiddenProviders.has(period.provider)) continue;
      const row = rowFor(period.cwd);
      const at = period.hourStart ?? period.day;
      row.costByPeriod.set(at, (row.costByPeriod.get(at) ?? 0) + period.costUsd);
    }
  }
  return {
    rows: [...rows]
      .map(([key, row]) => ({ key, ...row }))
      .sort(
        (a, b) =>
          b.costUsd - a.costUsd || b.totalTokens - a.totalTokens || a.label.localeCompare(b.label),
      ),
    unfiledCostUsd,
    unfiledTokens,
  };
}

export interface UsageProjectSeries {
  readonly key: string;
  readonly label: string;
  /** A palette slot for the most expensive projects; null for a focused row past them, or Other. */
  readonly slot: number | null;
  readonly other: boolean;
  /** One value per period, in period order. */
  readonly values: readonly number[];
}

/**
 * The most expensive projects each get a series and the rest fold into Other. A focused
 * project past them gets its own series too, and leaves Other so nothing counts twice.
 */
export function buildUsageProjectSeries(
  rows: readonly UsageProjectRow[],
  periods: readonly string[],
  slots: number,
  focusedKey: string | null,
): readonly UsageProjectSeries[] {
  const charted = rows.filter((row) => row.costByPeriod.size > 0);
  const valuesOf = (members: readonly UsageProjectRow[]) =>
    periods.map((period) =>
      members.reduce((sum, row) => sum + (row.costByPeriod.get(period) ?? 0), 0),
    );
  const ranked = charted.slice(0, slots);
  const focused = charted.slice(slots).find((row) => row.key === focusedKey);
  const rest = charted.slice(slots).filter((row) => row !== focused);
  const own = (row: UsageProjectRow, slot: number | null): UsageProjectSeries => ({
    key: row.key,
    label: row.label,
    slot,
    other: false,
    values: valuesOf([row]),
  });
  return [
    ...ranked.map((row, index) => own(row, index)),
    ...(focused === undefined ? [] : [own(focused, null)]),
    ...(rest.length === 0
      ? []
      : [
          {
            key: "other",
            label: `${rest.length} other ${rest.length === 1 ? "project" : "projects"}`,
            slot: null,
            other: true,
            values: valuesOf(rest),
          },
        ]),
  ];
}
