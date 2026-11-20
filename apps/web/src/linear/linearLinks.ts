const ISSUE_PATH = /^\/([^/]+)\/issue\/([A-Za-z][A-Za-z0-9_]*-\d+)(?:\/[^/]*)?\/?$/;
const PROJECT_PATH = /^\/([^/]+)\/project\/[^/]+(?:\/[^/]*)?\/?$/;
const MILESTONE_HASH =
  /^#milestone-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

function parseLinearAppUrl(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  return url.protocol === "https:" && url.hostname === "linear.app" ? url : null;
}

/** `https://linear.app/<workspace>/issue/<KEY-123>[/slug]` → its workspace and identifier. */
export function parseLinearIssueUrl(
  raw: string,
): { readonly workspace: string; readonly identifier: string } | null {
  const url = parseLinearAppUrl(raw);
  const match = url ? ISSUE_PATH.exec(url.pathname) : null;
  if (!match?.[1] || !match[2]) return null;
  return { workspace: match[1].toLowerCase(), identifier: match[2].toUpperCase() };
}

/** `https://linear.app/<workspace>/project/<slug>/overview#milestone-<id>` → its workspace and id. */
export function parseLinearMilestoneUrl(
  raw: string,
): { readonly workspace: string; readonly id: string } | null {
  const url = parseLinearAppUrl(raw);
  const path = url ? PROJECT_PATH.exec(url.pathname) : null;
  const hash = url ? MILESTONE_HASH.exec(url.hash) : null;
  if (!path?.[1] || !hash?.[1]) return null;
  return { workspace: path[1].toLowerCase(), id: hash[1].toLowerCase() };
}

/** Linear's API gives a milestone no URL; its project's overview anchors it by id. */
export function linearMilestoneUrl(projectUrl: string, id: string): string {
  return `${projectUrl.replace(/\/+$/, "")}/overview#milestone-${id}`;
}
