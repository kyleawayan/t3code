const ISSUE_PATH = /^\/([^/]+)\/issue\/([A-Za-z][A-Za-z0-9_]*-\d+)(?:\/[^/]*)?\/?$/;

/** `https://linear.app/<workspace>/issue/<KEY-123>[/slug]` → its workspace and identifier. */
export function parseLinearIssueUrl(
  raw: string,
): { readonly workspace: string; readonly identifier: string } | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.hostname !== "linear.app") return null;
  const match = ISSUE_PATH.exec(url.pathname);
  if (!match?.[1] || !match[2]) return null;
  return { workspace: match[1].toLowerCase(), identifier: match[2].toUpperCase() };
}
