import { registerCustomTheme } from "@pierre/diffs";
import { parsePatchFiles } from "@pierre/diffs/utils/parsePatchFiles";
import type { FileDiffMetadata, ThemeRegistration } from "@pierre/diffs/types";

export const DIFF_THEME_NAMES = {
  light: "xcode-hc-light",
  dark: "xcode-hc-dark",
} as const;

export type DiffThemeName = (typeof DIFF_THEME_NAMES)[keyof typeof DIFF_THEME_NAMES];

// Register the bundled Xcode High Contrast syntax themes with Pierre's shared
// theme resolver. Idempotent (registerCustomTheme swallows duplicates), and the
// worker pool forwards a resolved custom theme to its workers when the theme is
// set, so this one registration covers both the chat highlighter and the diff
// worker. JSON theme modules load lazily and may arrive under `default`.
registerCustomTheme(DIFF_THEME_NAMES.dark, () =>
  import("../themes/xcode-hc-dark.json").then((m) => (m.default ?? m) as ThemeRegistration),
);
registerCustomTheme(DIFF_THEME_NAMES.light, () =>
  import("../themes/xcode-hc-light.json").then((m) => (m.default ?? m) as ThemeRegistration),
);

export function resolveDiffThemeName(theme: "light" | "dark"): DiffThemeName {
  return theme === "dark" ? DIFF_THEME_NAMES.dark : DIFF_THEME_NAMES.light;
}

const FNV_OFFSET_BASIS_32 = 0x811c9dc5;
const FNV_PRIME_32 = 0x01000193;
const SECONDARY_HASH_SEED = 0x9e3779b9;
const SECONDARY_HASH_MULTIPLIER = 0x85ebca6b;

export function fnv1a32(
  input: string,
  seed = FNV_OFFSET_BASIS_32,
  multiplier = FNV_PRIME_32,
): number {
  let hash = seed >>> 0;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, multiplier) >>> 0;
  }
  return hash >>> 0;
}

export function buildPatchCacheKey(patch: string, scope = "diff-panel"): string {
  const normalizedPatch = patch.trim();
  const primary = fnv1a32(normalizedPatch, FNV_OFFSET_BASIS_32, FNV_PRIME_32).toString(36);
  const secondary = fnv1a32(
    normalizedPatch,
    SECONDARY_HASH_SEED,
    SECONDARY_HASH_MULTIPLIER,
  ).toString(36);
  return `${scope}:${normalizedPatch.length}:${primary}:${secondary}`;
}

export type RenderablePatch =
  | {
      kind: "files";
      files: FileDiffMetadata[];
    }
  | {
      kind: "raw";
      text: string;
      reason: string;
    };

export interface DiffLineStat {
  additions: number;
  deletions: number;
}

export function getDiffLineStat(files: ReadonlyArray<FileDiffMetadata>): DiffLineStat {
  return files.reduce<DiffLineStat>(
    (total, file) => {
      for (const hunk of file.hunks) {
        total.additions += hunk.additionLines;
        total.deletions += hunk.deletionLines;
      }

      return total;
    },
    { additions: 0, deletions: 0 },
  );
}

interface RenderablePatchOptions {
  /**
   * Pierre's partial-patch parser keeps hunk render starts in source-file
   * coordinates. Its virtualizer iterates partial patches as compact rows, so
   * review diffs need compact render starts while retaining collapsedBefore
   * for the "N unmodified lines" separator.
   */
  compactPartialHunkOffsets?: boolean;
}

export function compactPartialHunkOffsets(file: FileDiffMetadata): FileDiffMetadata {
  if (!file.isPartial) return file;

  let splitLineStart = 0;
  let unifiedLineStart = 0;
  const hunks = file.hunks.map((hunk) => {
    const compactHunk = {
      ...hunk,
      splitLineStart,
      unifiedLineStart,
    };
    splitLineStart += hunk.splitLineCount;
    unifiedLineStart += hunk.unifiedLineCount;
    return compactHunk;
  });

  return {
    ...file,
    hunks,
    splitLineCount: splitLineStart,
    unifiedLineCount: unifiedLineStart,
    ...(file.cacheKey ? { cacheKey: `${file.cacheKey}:compact-partial` } : {}),
  };
}

export function getRenderablePatch(
  patch: string | undefined,
  cacheScope = "diff-panel",
  options: RenderablePatchOptions = {},
): RenderablePatch | null {
  if (!patch) return null;
  const normalizedPatch = patch.trim();
  if (normalizedPatch.length === 0) return null;

  try {
    const parsedPatches = parsePatchFiles(
      normalizedPatch,
      buildPatchCacheKey(normalizedPatch, cacheScope),
    );
    const files = parsedPatches.flatMap((parsedPatch) =>
      options.compactPartialHunkOffsets
        ? parsedPatch.files.map(compactPartialHunkOffsets)
        : parsedPatch.files,
    );
    if (files.length > 0) {
      return { kind: "files", files };
    }

    return {
      kind: "raw",
      text: normalizedPatch,
      reason: "Unsupported diff format. Showing raw patch.",
    };
  } catch {
    return {
      kind: "raw",
      text: normalizedPatch,
      reason: "Failed to parse patch. Showing raw patch.",
    };
  }
}

export function resolveFileDiffPath(fileDiff: FileDiffMetadata): string {
  const raw = fileDiff.name ?? fileDiff.prevName ?? "";
  if (raw.startsWith("a/") || raw.startsWith("b/")) {
    return raw.slice(2);
  }
  return raw;
}

/**
 * What the file was called before the change. Only a rename makes it differ from the current
 * path, and the hosts that resolve a diff position against both sides need both names.
 */
export function resolveFileDiffPreviousPath(fileDiff: FileDiffMetadata): string {
  const raw = fileDiff.prevName ?? fileDiff.name ?? "";
  if (raw.startsWith("a/") || raw.startsWith("b/")) {
    return raw.slice(2);
  }
  return raw;
}

export function buildFileDiffRenderKey(fileDiff: FileDiffMetadata): string {
  const cacheKey = fileDiff.cacheKey;
  if (!cacheKey) return `${fileDiff.prevName ?? "none"}:${fileDiff.name}`;

  return cacheKey.endsWith(":hydrated") ? cacheKey.slice(0, -":hydrated".length) : cacheKey;
}

export function getDiffCollapseIconClassName(fileDiff: FileDiffMetadata): string {
  switch (fileDiff.type) {
    case "new":
      return "text-[var(--diffs-addition-base)]";
    case "deleted":
      return "text-[var(--diffs-deletion-base)]";
    case "change":
    case "rename-pure":
    case "rename-changed":
      return "text-[var(--diffs-modified-base)]";
    default:
      return "text-muted-foreground/80";
  }
}

/**
 * Maps every diff/file surface the @pierre/diffs renderer paints onto the
 * app's code tokens, so themed palettes reach the code body, gutter, and
 * row tints instead of the renderer's bundled colors. Shared by the diff
 * panel and the file preview.
 */
export const DIFF_SURFACE_THEME_UNSAFE_CSS = `
:host,
[data-diffs-header],
[data-diff],
[data-file],
[data-error-wrapper],
[data-virtualizer-buffer] {
  --diffs-header-font-family: var(--font-sans) !important;
  --diffs-font-family: var(--font-mono) !important;
  --diffs-bg: var(--code-background) !important;
  --diffs-light-bg: var(--code-background) !important;
  --diffs-dark-bg: var(--code-background) !important;
  --diffs-token-light-bg: transparent;
  --diffs-token-dark-bg: transparent;

  /* Gutter, context, and row tints all derive from the code surface the diff
     body sits on — mixing from the canvas leaves the gutter looking unthemed
     when a palette separates the two. */
  --diffs-bg-context-override: color-mix(in srgb, var(--code-background) 97%, var(--code-foreground));
  --diffs-bg-hover-override: color-mix(in srgb, var(--code-background) 94%, var(--code-foreground));
  --diffs-bg-separator-override: color-mix(
    in srgb,
    var(--code-background) 95%,
    var(--code-foreground)
  );
  --diffs-bg-buffer-override: color-mix(in srgb, var(--code-background) 90%, var(--code-foreground));

  /* Line + gutter tints keep T3's original diff colours (mixed from the theme's
     --success/--destructive over the code surface). Only the changed WORD is
     restyled: a solid GitHub-High-Contrast "inverted" chip whose lightness flips
     per mode so the token text (recoloured to the editor background) always
     clears WCAG AAA — light mode -> dark chip + near-white text; dark mode ->
     light chip + near-black text. The emphasis overrides must resolve on :host
     (Pierre reads var(--*-emphasis-override, <default>) there); the line/gutter
     overrides apply on the [data-diff] subtree as shipped.
     light-dark(<light-mode>, <dark-mode>). */
  --diffs-bg-addition-override: light-dark(
    color-mix(in srgb, var(--code-background) 50%, var(--success)),
    color-mix(in srgb, var(--code-background) 70%, var(--success))
  );
  --diffs-bg-addition-number-override: light-dark(
    color-mix(in srgb, var(--code-background) 35%, var(--success)),
    color-mix(in srgb, var(--code-background) 60%, var(--success))
  );
  --diffs-bg-addition-hover-override: color-mix(in srgb, var(--code-background) 85%, var(--success));
  --diffs-bg-addition-emphasis-override: light-dark(#1d652a, #52c062);

  --diffs-bg-deletion-override: light-dark(
    color-mix(in srgb, var(--code-background) 50%, var(--destructive)),
    color-mix(in srgb, var(--code-background) 70%, var(--destructive))
  );
  --diffs-bg-deletion-number-override: light-dark(
    color-mix(in srgb, var(--code-background) 35%, var(--destructive)),
    color-mix(in srgb, var(--code-background) 60%, var(--destructive))
  );
  --diffs-bg-deletion-hover-override: color-mix(in srgb, var(--code-background) 85%, var(--destructive));
  --diffs-bg-deletion-emphasis-override: light-dark(#9e3235, #ff8787);

  background-color: var(--diffs-bg) !important;
  color: var(--code-foreground) !important;
}

/* Invert the changed word's text to the editor background color. Shiki paints
   the token color as an inline style on a child element, so the child (\`*\`)
   must be targeted too, with !important, to win over that inline color. */
[data-line-type="change-addition"] [data-diff-span],
[data-line-type="change-addition"] [data-diff-span] *,
[data-line-type="change-deletion"] [data-diff-span],
[data-line-type="change-deletion"] [data-diff-span] * {
  color: var(--code-background) !important;
}
`;
