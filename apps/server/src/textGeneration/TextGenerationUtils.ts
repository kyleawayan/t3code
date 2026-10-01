import { TextGenerationError, type ThreadRecapStep } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import type { ThreadRecapGenerationInput, ThreadRecapGenerationResult } from "./TextGeneration.ts";

const isTextGenerationError = Schema.is(TextGenerationError);
const decodeJsonThreadTitle = Schema.decodeOption(
  Schema.fromJsonString(Schema.Struct({ title: Schema.String })),
);

/** Convert an Effect Schema to a flat JSON Schema object, inlining `$defs` when present. */
export function toJsonSchemaObject(schema: Schema.Top): unknown {
  const document = Schema.toJsonSchemaDocument(Schema.toType(schema));
  if (document.definitions && Object.keys(document.definitions).length > 0) {
    return { ...document.schema, $defs: document.definitions };
  }
  return document.schema;
}

/** Truncate a text section to `maxChars`, appending a `[truncated]` marker when needed. */
export function limitSection(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  const truncated = value.slice(0, maxChars);
  return `${truncated}\n\n[truncated]`;
}

/** Normalise a raw commit subject to imperative-mood, ≤72 chars, no trailing period. */
export function sanitizeCommitSubject(raw: string): string {
  const singleLine = raw.trim().split(/\r?\n/g)[0]?.trim() ?? "";
  const withoutTrailingPeriod = singleLine.replace(/[.]+$/g, "").trim();
  if (withoutTrailingPeriod.length === 0) {
    return "Update project files";
  }

  if (withoutTrailingPeriod.length <= 72) {
    return withoutTrailingPeriod;
  }
  return withoutTrailingPeriod.slice(0, 72).trimEnd();
}

/** Normalise a raw PR title to a single line with a sensible fallback. */
export function sanitizePrTitle(raw: string): string {
  const singleLine = raw.trim().split(/\r?\n/g)[0]?.trim() ?? "";
  if (singleLine.length > 0) {
    return singleLine;
  }
  return "Update project changes";
}

// Prompts ask for under 40 characters. This cap only stops a runaway model
// from pushing a paragraph into the sidebar, header, and window title.
const MAX_THREAD_TITLE_CHARS = 120;

/** Normalise a raw thread title to a single line. Clients truncate for display. */
export function sanitizeThreadTitle(raw: string): string {
  // Unwrap a JSON-formatted title before truncation can cut off the closing brace.
  const decoded = decodeJsonThreadTitle(raw);
  const title = Option.isSome(decoded) ? decoded.value.title : raw;
  const normalized = title
    .trim()
    .split(/\r?\n/g)[0]
    ?.trim()
    .replace(/^['"`]+|['"`]+$/g, "")
    .trim()
    .replace(/\s+/g, " ");

  if (!normalized || normalized.trim().length === 0) {
    return "New thread";
  }

  if (normalized.length <= MAX_THREAD_TITLE_CHARS) {
    return normalized;
  }

  return `${normalized.slice(0, MAX_THREAD_TITLE_CHARS - 3).trimEnd()}...`;
}

// Prompts ask for 8-12 words, plus up to 6 describing each ID they name.
// This cap only stops a runaway model from
// pushing a paragraph into the recap card.
const MAX_RECAP_TEXT_CHARS = 160;
const MAX_RECAP_STEPS = 20;
const MAX_RECAP_LINKS = 8;
const HTTP_URL = /^https?:\/\/\S+$/i;
// What may follow a URL that ends there: sentence punctuation, then a delimiter or the end.
const URL_END = /^[.,;:!?]*(?:[\s<>"'`)\]}]|$)/;

// Clients build `https://linear.app/<slug>/issue/<id>`, so a slug must be one plain path segment.
const LINEAR_WORKSPACE_SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
const LINEAR_ISSUE_URL_WORKSPACE = /https?:\/\/linear\.app\/([^/\s?#]+)\/issue\//gi;

function linearWorkspaceSlug(value: string | null | undefined): string | undefined {
  const slug = value?.trim();
  return slug && LINEAR_WORKSPACE_SLUG.test(slug) ? slug : undefined;
}

function linearWorkspacesInText(text: string): ReadonlyArray<string> {
  return Array.from(text.matchAll(LINEAR_ISSUE_URL_WORKSPACE), (match) =>
    linearWorkspaceSlug(match[1]),
  ).filter((slug) => slug !== undefined);
}

/** Whether `url` appears in `text` as a whole URL, not as the start of a longer one. */
function containsWholeUrl(text: string, url: string): boolean {
  for (let index = text.indexOf(url); index !== -1; index = text.indexOf(url, index + 1)) {
    if (URL_END.test(text.slice(index + url.length, index + url.length + 16))) return true;
  }
  return false;
}

function recapText(raw: string | null | undefined): string | null {
  const normalized = raw?.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  return normalized.length <= MAX_RECAP_TEXT_CHARS
    ? normalized
    : `${normalized.slice(0, MAX_RECAP_TEXT_CHARS - 3).trimEnd()}...`;
}

function recapStepIdFromLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export interface GeneratedThreadRecap {
  readonly goal: string;
  readonly done: string | null;
  readonly now: string;
  readonly next: string | null;
  readonly blocked: string | null;
  readonly steps: ReadonlyArray<{
    readonly id: string;
    readonly label: string;
    readonly status: ThreadRecapStep["status"];
    readonly source: ThreadRecapStep["source"];
    readonly linearIssueId: string | null;
    readonly url: string | null;
    readonly blockedBy: ReadonlyArray<string>;
  }>;
  readonly links: ReadonlyArray<{ readonly label: string; readonly url: string }>;
  readonly linearWorkspace: string | null;
}

/**
 * Normalize model output into recap fields that satisfy the contract. Drops
 * Linear IDs the thread never mentioned, URLs the thread text never
 * contained, and dependencies on unknown steps.
 */
export function finalizeThreadRecap(
  generated: GeneratedThreadRecap,
  input: Pick<
    ThreadRecapGenerationInput,
    "linearIssueIds" | "message" | "previousSummary" | "title"
  >,
): Effect.Effect<ThreadRecapGenerationResult, TextGenerationError> {
  const goal = recapText(generated.goal);
  const now = recapText(generated.now);
  if (goal === null || now === null) {
    return Effect.fail(
      new TextGenerationError({
        operation: "generateThreadRecap",
        detail: "The model returned a recap without a goal or current step.",
      }),
    );
  }

  const threadText = input.title ? `${input.title}\n${input.message}` : input.message;
  // Only URLs copied verbatim from the thread survive. Models rewrite and invent links.
  // Links kept earlier already passed this check, so they survive when long threads
  // truncate the message that held them.
  const previousUrls = new Set([
    ...(input.previousSummary?.links.map((link) => link.url) ?? []),
    ...(input.previousSummary?.steps.flatMap((step) => (step.url ? [step.url] : [])) ?? []),
  ]);
  const threadUrl = (raw: string | null) => {
    const url = raw?.trim();
    return url && HTTP_URL.test(url) && (containsWholeUrl(threadText, url) || previousUrls.has(url))
      ? url
      : undefined;
  };
  // Only Linear IDs the thread or an earlier recap named survive. Models invent plausible IDs.
  const knownIssueIds = new Set(
    [
      ...input.linearIssueIds,
      ...(input.previousSummary?.linearIssueIds ?? []),
      ...(input.previousSummary?.steps.flatMap((step) =>
        step.linearIssueId ? [step.linearIssueId] : [],
      ) ?? []),
    ].map((id) => id.toUpperCase()),
  );
  const linearIssueIdFor = (raw: string | null) => {
    const id = raw?.trim().toUpperCase();
    return id && knownIssueIds.has(id) ? id : undefined;
  };
  const usedIds = new Set<string>();
  const steps: Array<Omit<ThreadRecapStep, "blockedBy"> & { blockedBy: ReadonlyArray<string> }> =
    [];
  for (const step of generated.steps) {
    if (steps.length >= MAX_RECAP_STEPS) break;
    const label = recapText(step.label);
    if (label === null) continue;
    const baseId = step.id.trim() || recapStepIdFromLabel(label) || `step-${steps.length + 1}`;
    let id = baseId;
    for (let suffix = 2; usedIds.has(id); suffix += 1) id = `${baseId}-${suffix}`;
    usedIds.add(id);
    const linearIssueId = linearIssueIdFor(step.linearIssueId);
    const url = threadUrl(step.url);
    steps.push({
      id,
      label,
      status: step.status,
      source: step.source === "linear" && linearIssueId === undefined ? "inferred" : step.source,
      ...(linearIssueId !== undefined ? { linearIssueId } : {}),
      ...(url !== undefined ? { url } : {}),
      blockedBy: step.blockedBy,
    });
  }

  // The map marks the single step with status "now", and `now` names the same task.
  const nowIndexes = steps.flatMap((step, index) => (step.status === "now" ? [index] : []));
  if (nowIndexes.length > 1) {
    for (const index of nowIndexes.slice(1)) steps[index] = { ...steps[index]!, status: "next" };
  } else if (nowIndexes.length === 0) {
    const isNowTask = (label: string) => label.toLowerCase() === now.toLowerCase();
    const matching = steps.findIndex((step) => isNowTask(step.label));
    if (matching !== -1) {
      steps[matching] = { ...steps[matching]!, status: "now" };
    } else {
      if (steps.length >= MAX_RECAP_STEPS) {
        const dropIndex = [
          steps.findLastIndex((step) => step.status === "unknown"),
          steps.findLastIndex((step) => step.status === "next"),
          steps.findIndex((step) => step.status === "done"),
          steps.length - 1,
        ].find((index) => index !== -1)!;
        usedIds.delete(steps[dropIndex]!.id);
        steps.splice(dropIndex, 1);
      }
      // Reuse the earlier recap's id for the same task so the map keeps its layout.
      const previousId = input.previousSummary?.steps.find((step) => isNowTask(step.label))?.id;
      const baseId =
        previousId !== undefined && !usedIds.has(previousId)
          ? previousId
          : `now-${recapStepIdFromLabel(now) || "step"}`;
      let id = baseId;
      for (let suffix = 2; usedIds.has(id); suffix += 1) id = `${baseId}-${suffix}`;
      usedIds.add(id);
      steps.splice(steps.findLastIndex((step) => step.status === "done") + 1, 0, {
        id,
        label: now,
        status: "now",
        source: "chat",
        blockedBy: [],
      });
    }
  }

  // Clients link issue IDs under this slug, so the model's value must match a Linear issue URL
  // the thread or an earlier recap contained. Otherwise use the first such URL, then the
  // earlier recap's slug.
  const confirmedWorkspaces = [
    ...linearWorkspacesInText(threadText),
    ...linearWorkspacesInText([...previousUrls].join("\n")),
  ];
  const modelWorkspace = linearWorkspaceSlug(generated.linearWorkspace);
  const finalLinearWorkspace =
    (modelWorkspace !== undefined && confirmedWorkspaces.includes(modelWorkspace)
      ? modelWorkspace
      : confirmedWorkspaces[0]) ??
    linearWorkspaceSlug(input.previousSummary?.linearWorkspace) ??
    null;

  const links = new Map<string, { label: string; url: string }>();
  for (const link of generated.links) {
    if (links.size >= MAX_RECAP_LINKS) break;
    const url = threadUrl(link.url);
    if (url !== undefined && !links.has(url)) {
      links.set(url, { label: recapText(link.label) ?? recapText(url) ?? url, url });
    }
  }

  return Effect.succeed({
    goal,
    done: recapText(generated.done),
    now,
    next: recapText(generated.next),
    blocked: recapText(generated.blocked),
    steps: steps.map((step) => ({
      ...step,
      blockedBy: [
        ...new Set(
          step.blockedBy.map((id) => id.trim()).filter((id) => id !== step.id && usedIds.has(id)),
        ),
      ],
    })),
    links: [...links.values()],
    linearWorkspace: finalLinearWorkspace,
  });
}

/** CLI name to human-readable label, e.g. "codex" → "Codex CLI (`codex`)" */
function cliLabel(cliName: string): string {
  const capitalized = cliName.charAt(0).toUpperCase() + cliName.slice(1);
  return `${capitalized} CLI (\`${cliName}\`)`;
}

/**
 * Normalize an unknown error from a CLI text generation process into a
 * typed `TextGenerationError`. Parameterized by CLI name so both Codex
 * and Claude (and future providers) can share the same logic.
 */
export function normalizeCliError(
  cliName: string,
  operation: string,
  error: unknown,
  fallback: string,
): TextGenerationError {
  if (isTextGenerationError(error)) {
    return error;
  }

  if (error instanceof Error) {
    const lower = error.message.toLowerCase();
    if (
      error.message.includes(`Command not found: ${cliName}`) ||
      lower.includes(`spawn ${cliName}`) ||
      lower.includes("enoent")
    ) {
      return new TextGenerationError({
        operation,
        detail: `${cliLabel(cliName)} is required but not available on PATH.`,
        cause: error,
      });
    }
    return new TextGenerationError({
      operation,
      detail: fallback,
      cause: error,
    });
  }

  return new TextGenerationError({
    operation,
    detail: fallback,
    cause: error,
  });
}
