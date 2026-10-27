/**
 * Fork: the user keeps their Obsidian vaults in iCloud. macOS stores both Obsidian's own iCloud
 * folder (`iCloud~md~obsidian`) and general iCloud Drive (`com~apple~CloudDocs`) under
 * `~/Library/Mobile Documents`, so only markdown files there default to Obsidian; elsewhere the
 * picker keeps the preferred editor. The desktop shell only opens POSIX paths in Obsidian.
 */
export function isObsidianVaultCandidate(absolutePath: string): boolean {
  return absolutePath.startsWith("/") && absolutePath.includes("/Library/Mobile Documents/");
}

/** The note name Obsidian shows as its inline title: the file name without its extension. */
export function obsidianNoteTitle(absolutePath: string): string {
  const name = absolutePath.slice(absolutePath.lastIndexOf("/") + 1);
  return name.replace(/\.(?:md|mdx|markdown|mdown|mkd)$/i, "");
}
