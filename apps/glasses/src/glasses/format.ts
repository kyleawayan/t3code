import { getTextWidth, pxTruncate } from "@evenrealities/pretext";
import { commandProgramName } from "@t3tools/client-runtime/work-log/command-label";
import type {
  OrchestrationMessage,
  OrchestrationThread,
  OrchestrationThreadShell,
} from "@t3tools/contracts";

/**
 * The G2 renders one baked-in LVGL font on a 576x288 canvas. Text wraps at
 * the container width with a fixed 27px line height, list items cap at 64
 * characters, and glyphs outside the font set are dropped silently, so
 * everything here stays ASCII-only and is measured with Even's pretext
 * library rather than counted in characters.
 */
export const SCREEN_WIDTH = 576;
export const SCREEN_HEIGHT = 288;
export const LINE_HEIGHT_PX = 27;
// Documented as 64, but the host refuses a page whose row reaches 64 bytes.
export const LIST_ITEM_MAX_BYTES = 60;
export const LIST_MAX_ITEMS = 20;

// Thread page geometry, shared with the controller that builds the containers.
export const PANEL_PADDING = 10;
export const BODY_HEIGHT = 242;
export const BODY_INNER_WIDTH = SCREEN_WIDTH - PANEL_PADDING * 2;
export const BODY_MAX_LINES = Math.floor((BODY_HEIGHT - PANEL_PADDING * 2) / LINE_HEIGHT_PX);
export const DIVIDER_HEIGHT = 2;
export const STATUS_PADDING = 6;
export const STATUS_HEIGHT = SCREEN_HEIGHT - BODY_HEIGHT - DIVIDER_HEIGHT;
export const STATUS_INNER_WIDTH = SCREEN_WIDTH - STATUS_PADDING * 2;

const ACTIVITY_MAX_CHARS = 96;
// Rounded kerning can push a measured-to-fit line one pixel over; leave room.
const STATUS_SAFETY_PX = 12;
const STATUS_GAP_PX = 24;

export type ThreadStatusKind = "working" | "needs-you" | "error" | "done" | "idle";

type StatusShell = Pick<
  OrchestrationThreadShell,
  "session" | "latestTurn" | "hasPendingApprovals" | "hasPendingUserInput"
>;

export function threadStatusKind(shell: StatusShell): ThreadStatusKind {
  if (shell.hasPendingApprovals || shell.hasPendingUserInput) {
    return "needs-you";
  }
  const sessionStatus = shell.session?.status;
  if (sessionStatus === "running" || sessionStatus === "starting") {
    return "working";
  }
  if (shell.latestTurn?.state === "running") {
    return "working";
  }
  if (sessionStatus === "error" || shell.latestTurn?.state === "error") {
    return "error";
  }
  if (shell.latestTurn?.state === "completed") {
    return "done";
  }
  return "idle";
}

/**
 * Working spins through these; the caller advances the frame on a timer.
 * Every frame is the same 20px wide, so the text after it never shifts.
 */
export const SPINNER_FRAMES = ["▶", "▼", "◀", "▲"] as const;

// The real check mark (U+2713) is not in the firmware font; the square root
// sign is, and reads as one. Letters and punctuation are always safe.
const STATUS_ICON: Record<Exclude<ThreadStatusKind, "working">, string> = {
  "needs-you": "?",
  error: "E",
  done: "√",
  idle: "·",
};

export function statusIcon(kind: ThreadStatusKind, spinnerFrame: number): string {
  if (kind === "working") {
    return SPINNER_FRAMES[Math.abs(spinnerFrame) % SPINNER_FRAMES.length]!;
  }
  return STATUS_ICON[kind];
}

export function truncateEnd(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxChars - 3))}...`;
}

/**
 * Titles can be pasted prompts: markdown headings, newlines, runs of
 * whitespace. A newline inside a list row draws over the rows above it, so
 * everything collapses to one line before it reaches the glasses.
 */
export function flattenTitle(title: string): string {
  return title
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** `project: thread`, or just the thread title when the project is unknown. */
export function displayTitle(projectTitle: string | undefined, title: string): string {
  const thread = flattenTitle(title);
  const project = projectTitle === undefined ? "" : flattenTitle(projectTitle);
  return project.length === 0 ? thread : `${project}: ${thread}`;
}

const utf8 = new TextEncoder();

/**
 * List rows are capped at 64 bytes of UTF-8 by the host, not 64 characters:
 * a row that measures 64 characters with an em dash in it gets the whole
 * page rebuild refused. Cut on bytes and finish with "...".
 */
export function truncateBytes(text: string, maxBytes: number): string {
  if (utf8.encode(text).length <= maxBytes) {
    return text;
  }
  const budget = Math.max(0, maxBytes - 3);
  let kept = "";
  for (const char of text) {
    if (utf8.encode(kept + char).length > budget) {
      break;
    }
    kept += char;
  }
  return `${kept}...`;
}

export function threadListLabel(
  shell: StatusShell & Pick<OrchestrationThreadShell, "title">,
  projectTitle?: string,
  spinnerFrame = 0,
): string {
  // Status first: the firmware truncates long rows on the right.
  const icon = statusIcon(threadStatusKind(shell), spinnerFrame);
  return truncateBytes(`${icon} ${displayTitle(projectTitle, shell.title)}`, LIST_ITEM_MAX_BYTES);
}

function formatElapsed(fromIso: string, toMs: number): string | null {
  const from = Date.parse(fromIso);
  if (Number.isNaN(from)) {
    return null;
  }
  const seconds = Math.max(0, Math.round((toMs - from) / 1000));
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  return minutes < 60
    ? `${minutes}m ${seconds % 60}s`
    : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export interface StatusBarLayout {
  /** Thread title, right-aligned after the status. */
  readonly title: string;
  /** Inner width of the status container in pixels. */
  readonly maxWidth: number;
  /** True while the reader has scrolled back; the strip gains a "^" cue. */
  readonly browsing?: boolean;
  readonly spinnerFrame?: number;
  /** True while older turns are being fetched for the scroll-back window. */
  readonly loadingOlder?: boolean;
  /** True when the window starts at the first loaded line and nothing older exists. */
  readonly atTop?: boolean;
}

/**
 * Bottom strip: status and elapsed turn time on the left, thread title on
 * the right. The container is left-aligned only, so the gap is spaces sized
 * from measured pixel widths.
 */
export function statusBar(
  shell: StatusShell & Pick<OrchestrationThreadShell, "planProgress">,
  nowMs: number,
  layout?: StatusBarLayout,
): string {
  const kind = threadStatusKind(shell);
  // Icon only, same glyphs as the list; the word would just repeat it.
  let label = statusIcon(kind, layout?.spinnerFrame ?? 0);
  const plan = shell.planProgress;
  if (kind === "working" && plan) {
    label = `${label} ${plan.completedSteps}/${plan.totalSteps}`;
  }
  const turn = shell.latestTurn;
  // Elapsed time only while a turn runs; a finished turn shows just its icon.
  const elapsed =
    turn !== null && kind === "working"
      ? formatElapsed(turn.startedAt ?? turn.requestedAt, nowMs)
      : null;
  const status = elapsed === null ? label : `${label}   ${elapsed}`;
  if (layout === undefined) {
    return status;
  }
  const left = layout.loadingOlder
    ? `^ ${statusIcon("working", layout.spinnerFrame ?? 0)} Loading`
    : layout.browsing
      ? layout.atTop
        ? `^ Top   ${status}`
        : `^ ${status}`
      : status;
  const available = layout.maxWidth - STATUS_SAFETY_PX - getTextWidth(left) - STATUS_GAP_PX;
  if (available <= 0) {
    return left;
  }
  const title = pxTruncate(layout.title.trim(), available);
  if (title.length === 0) {
    return left;
  }
  const spaceWidth = Math.max(1, getTextWidth(" "));
  const gap = layout.maxWidth - STATUS_SAFETY_PX - getTextWidth(left) - getTextWidth(title);
  const spaces = Math.max(2, Math.floor(gap / spaceWidth));
  return `${left}${" ".repeat(spaces)}${title}`;
}

/** Sort newest activity first; archived and deleted threads are hidden. */
export function visibleThreads(
  threads: ReadonlyArray<OrchestrationThreadShell>,
): Array<OrchestrationThreadShell> {
  return threads
    .filter((thread) => thread.archivedAt === null)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, LIST_MAX_ITEMS);
}

/**
 * Strip the markdown noise that reads badly in a single fixed font: fences,
 * emphasis markers, heading hashes. Content stays otherwise intact.
 */
export function plainText(markdown: string): string {
  return markdown
    .replace(/```[^\n]*\n?/g, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function latestReply(messages: ReadonlyArray<OrchestrationMessage>): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message === undefined) {
      continue;
    }
    if (message.role === "assistant" && message.text.trim().length > 0) {
      return plainText(message.text);
    }
    if (message.role === "user") {
      return `You: ${plainText(message.text)}`;
    }
  }
  return "No reply yet.";
}

export type TranscriptSource = Pick<OrchestrationThread, "messages" | "activities">;

export type TranscriptOrigin = "agent" | "user" | "approval" | "error";

interface TranscriptEntry {
  readonly at: string;
  text: string;
  readonly origin: TranscriptOrigin;
  /** Tool and user lines always carry their glyph; agent prose only when it opens a block. */
  readonly alwaysMarked: boolean;
}

// Marker glyphs as in the official terminal app: ">" opens an agent block,
// "/" is the user, "?" asks for a decision. Every marker is padded to one
// column width so wrapped lines can hang under the text.
const MARKER_GLYPH: Record<TranscriptOrigin, string> = {
  agent: ">",
  user: "/",
  approval: "?",
  error: "!",
};
const MARKER_COLUMN_PX = 22;
const WRAP_SAFETY_PX = 4;
const USER_MESSAGE_MAX_LINES = 3;

function spaceWidth(): number {
  return Math.max(1, getTextWidth(" "));
}

function markerColumn(glyph: string): string {
  const spaces = Math.max(1, Math.round((MARKER_COLUMN_PX - getTextWidth(glyph)) / spaceWidth()));
  return `${glyph}${" ".repeat(spaces)}`;
}

function indentColumn(): string {
  return " ".repeat(Math.max(1, Math.round(MARKER_COLUMN_PX / spaceWidth())));
}

/**
 * Greedy word wrap measured in pixels. The firmware wraps on its own, but it
 * cannot indent continuation lines, so the transcript wraps here first. A
 * single word wider than the line is split by character.
 */
export function wrapWords(text: string, maxWidth: number): Array<string> {
  const lines: Array<string> = [];
  for (const paragraph of text.split("\n")) {
    let current = "";
    for (const word of paragraph.split(" ")) {
      const candidate = current.length === 0 ? word : `${current} ${word}`;
      if (getTextWidth(candidate) <= maxWidth) {
        current = candidate;
        continue;
      }
      if (current.length > 0) {
        lines.push(current);
      }
      let rest = word;
      while (rest.length > 1 && getTextWidth(rest) > maxWidth) {
        let cut = rest.length - 1;
        while (cut > 1 && getTextWidth(rest.slice(0, cut)) > maxWidth) {
          cut -= 1;
        }
        lines.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      current = rest;
    }
    lines.push(current);
  }
  return lines;
}

export interface TranscriptLayout {
  readonly lines: ReadonlyArray<string>;
  /** Who produced each wrapped line, parallel to `lines`. */
  readonly origins: ReadonlyArray<TranscriptOrigin>;
}

function layoutEntries(
  entries: ReadonlyArray<TranscriptEntry>,
  maxWidth: number,
): TranscriptLayout {
  const indent = indentColumn();
  const textWidth = Math.max(40, maxWidth - MARKER_COLUMN_PX - WRAP_SAFETY_PX);
  const lines: Array<string> = [];
  const origins: Array<TranscriptOrigin> = [];
  let previous: TranscriptOrigin | null = null;
  for (const entry of entries) {
    const marked = entry.alwaysMarked || entry.origin !== previous;
    let wrapped = wrapWords(entry.text, textWidth);
    // The reader wrote the user lines; like T3 Code's collapsed prompt, a
    // glimpse is enough and the agent's reply keeps the screen.
    if (entry.origin === "user" && wrapped.length > USER_MESSAGE_MAX_LINES) {
      const kept = wrapped.slice(0, USER_MESSAGE_MAX_LINES);
      const last = kept[USER_MESSAGE_MAX_LINES - 1]!;
      kept[USER_MESSAGE_MAX_LINES - 1] = `${last.replace(/\s*\S*$/, "")}...`;
      wrapped = kept;
    }
    wrapped.forEach((line, index) => {
      const column = index === 0 && marked ? markerColumn(MARKER_GLYPH[entry.origin]) : indent;
      lines.push(`${column}${line}`);
      origins.push(entry.origin);
    });
    previous = entry.origin;
  }
  return { lines, origins };
}

/**
 * Only the agent's own lines are worth typing out. When the reveal cursor
 * sits on a line from anyone else (the user's ask, an approval, an error),
 * jump past that line so it appears whole and at once.
 */
export function skipInstantLines(layout: TranscriptLayout, revealChars: number): number {
  const total = transcriptLength(layout.lines);
  let cursor = Math.max(0, revealChars);
  let lineStart = 0;
  for (let index = 0; index < layout.lines.length; index += 1) {
    const length = layout.lines[index]!.length;
    const lineEnd = lineStart + length;
    if (cursor < lineEnd) {
      if (layout.origins[index] === "agent") {
        // The reader has already replied below the text still being typed:
        // finish it at once and land on their new message.
        return layout.origins.slice(index + 1).includes("user") ? total : cursor;
      }
      cursor = lineEnd + 1;
    }
    lineStart = lineEnd + 1;
  }
  return Math.min(cursor, total);
}

// Progress and update events restate a tool line that is already on screen.
const SKIPPED_ACTIVITY_KINDS = new Set([
  "tool.progress",
  // Bookkeeping after every reply; noise on a glasses-sized page.
  "context-window.updated",
  "checkpoint.captured",
]);

type ToolPayload = {
  readonly itemType?: unknown;
  readonly status?: unknown;
  readonly detail?: unknown;
  readonly data?: { readonly toolName?: unknown; readonly input?: Record<string, unknown> };
};

const STEP_LABEL_MAX_CHARS = 56;

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

/** `"Bash: ls -la"` and `"Edit: {json}"` both carry the tool's input after the tool name. */
function detailBody(detail: string | null): string | null {
  if (detail === null) {
    return null;
  }
  const separator = detail.indexOf(": ");
  return separator === -1 ? detail : detail.slice(separator + 2).trim();
}

function detailInput(detail: string | null): Record<string, unknown> | null {
  const body = detailBody(detail);
  if (body === null || !body.startsWith("{")) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(body);
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function baseName(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, "");
  const slash = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  return slash === -1 ? trimmed : trimmed.slice(slash + 1);
}

function firstLine(text: string): string {
  return text.split(/\r?\n/)[0]?.trim() ?? "";
}

/**
 * One line per tool call, worded like T3 Code's work log: "Running <cmd>",
 * "Editing <file>", "Reading <file>", with the past tense once it finished.
 * Falls back to the server's summary for tools this does not recognise.
 */
export function toolStepLabel(activity: OrchestrationThread["activities"][number]): string {
  const payload = (activity.payload ?? {}) as ToolPayload;
  const input: Record<string, unknown> = {
    ...detailInput(asString(payload.detail)),
    ...payload.data?.input,
  };
  const toolName = asString(payload.data?.toolName) ?? "";
  const status = asString(payload.status);
  const done = status === "completed";
  const failed = status === "failed" || status === "declined";
  const tense = (active: string, past: string) =>
    failed ? `Failed: ${active}` : done ? past : active;
  const itemType = asString(payload.itemType);

  const command =
    asString(input.command) ??
    (itemType === "command_execution" ? detailBody(asString(payload.detail)) : null);
  const path = asString(input.file_path) ?? asString(input.path) ?? asString(input.notebook_path);
  const pattern = asString(input.pattern) ?? asString(input.query);

  let label: string | null = null;
  if (itemType === "command_execution" && command !== null && !command.startsWith("{")) {
    // Program name only, as T3 Code's work log shows it: "Running cd".
    const program = commandProgramName(firstLine(command)) ?? firstLine(command).split(" ")[0];
    label = `${tense("Running", "Ran")} ${program}`;
  } else if (itemType === "file_change" && path !== null) {
    label = `${tense(toolName === "Write" ? "Writing" : "Editing", toolName === "Write" ? "Wrote" : "Edited")} ${baseName(path)}`;
  } else if (toolName === "Read" && path !== null) {
    label = `${tense("Reading", "Read")} ${baseName(path)}`;
  } else if ((toolName === "Grep" || toolName === "Glob") && pattern !== null) {
    label = `${tense("Searching", "Searched")} ${pattern}`;
  } else if (itemType === "web_search" && pattern !== null) {
    label = `${tense("Searching web:", "Searched web:")} ${pattern}`;
  } else if (toolName === "WebFetch" && asString(input.url) !== null) {
    label = `${tense("Fetching", "Fetched")} ${asString(input.url)}`;
  } else if (toolName.length > 0 && !/^tool$/i.test(toolName)) {
    label = `${toolName}${done ? "" : "..."}`;
  }
  return truncateEnd(label ?? activity.summary, STEP_LABEL_MAX_CHARS);
}

function activityOrigin(activity: OrchestrationThread["activities"][number]): TranscriptOrigin {
  if (activity.kind === "approval.resolved") {
    return "user";
  }
  switch (activity.tone) {
    case "approval":
      return "approval";
    case "error":
      return "error";
    default:
      return "agent";
  }
}

function toolCallIdOf(payload: unknown): string | null {
  if (typeof payload === "object" && payload !== null && "toolCallId" in payload) {
    const id = (payload as { toolCallId?: unknown }).toolCallId;
    return typeof id === "string" && id.length > 0 ? id : null;
  }
  return null;
}

function messageEntry(message: OrchestrationMessage): TranscriptEntry | null {
  if (message.role === "system") {
    return null;
  }
  const text = plainText(message.text);
  if (text.length === 0) {
    return null;
  }
  return message.role === "user"
    ? { at: message.createdAt, text, origin: "user", alwaysMarked: true }
    : { at: message.createdAt, text, origin: "agent", alwaysMarked: false };
}

/**
 * Every loaded turn as the official terminal app shows it: asks, tool lines,
 * and the assistant's text in time order. A tool's later events replace its
 * first line in place, so "started" becomes "completed" without a second row.
 */
function transcriptEntries(thread: TranscriptSource): Array<TranscriptEntry> {
  const entries: Array<TranscriptEntry> = [];
  for (const message of thread.messages) {
    const entry = messageEntry(message);
    if (entry !== null) {
      entries.push(entry);
    }
  }
  const byToolCall = new Map<string, TranscriptEntry>();
  const activities = thread.activities
    .filter((activity) => !SKIPPED_ACTIVITY_KINDS.has(activity.kind))
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  for (const activity of activities) {
    const text =
      activity.tone === "tool"
        ? toolStepLabel(activity)
        : truncateEnd(activity.summary, ACTIVITY_MAX_CHARS);
    const toolCallId = toolCallIdOf(activity.payload);
    const existing = toolCallId === null ? undefined : byToolCall.get(toolCallId);
    if (existing !== undefined) {
      existing.text = text;
      continue;
    }
    const entry: TranscriptEntry = {
      at: activity.createdAt,
      text,
      origin: activityOrigin(activity),
      alwaysMarked: true,
    };
    entries.push(entry);
    if (toolCallId !== null) {
      byToolCall.set(toolCallId, entry);
    }
  }
  entries.sort((left, right) => left.at.localeCompare(right.at));
  return entries.filter((entry, index) => index === 0 || entries[index - 1]!.text !== entry.text);
}

/** Every loaded turn, wrapped to the body width, oldest first. */
export function transcriptLayout(thread: TranscriptSource, maxWidth: number): TranscriptLayout {
  const entries = transcriptEntries(thread);
  return entries.length === 0
    ? { lines: ["No reply yet."], origins: ["agent"] }
    : layoutEntries(entries, maxWidth);
}

export function transcriptLines(thread: TranscriptSource, maxWidth: number): Array<string> {
  return [...transcriptLayout(thread, maxWidth).lines];
}

export interface LineWindow {
  /** Index of the first line in the window. */
  readonly start: number;
  /** Index one past the last line in the window. */
  readonly end: number;
  readonly text: string;
}

/** Character count of the lines joined with newlines. */
export function transcriptLength(lines: ReadonlyArray<string>): number {
  return lines.reduce((sum, line) => sum + line.length, 0) + Math.max(0, lines.length - 1);
}

/**
 * The first `revealChars` characters of the transcript as whole and partial
 * lines, which is what the typewriter reveal shows in follow mode.
 */
export function revealedLines(lines: ReadonlyArray<string>, revealChars: number): Array<string> {
  const shown: Array<string> = [];
  let remaining = Math.max(0, revealChars);
  for (const line of lines) {
    if (remaining >= line.length) {
      shown.push(line);
      remaining -= line.length + 1;
      if (remaining < 0) {
        break;
      }
      continue;
    }
    if (remaining > 0) {
      shown.push(line.slice(0, remaining));
    }
    break;
  }
  return shown;
}

/**
 * The newest lines before `end` that fit a character budget. The host caps a
 * text update at 2000 characters and a page rebuild at 1000, which is what
 * bounds how much history one container can hold for native scrolling.
 */
export function windowEndingAt(
  lines: ReadonlyArray<string>,
  end: number,
  maxChars: number,
  maxLines = Number.POSITIVE_INFINITY,
): LineWindow {
  const clampedEnd = Math.min(Math.max(0, end), lines.length);
  let start = clampedEnd;
  while (start > 0 && clampedEnd - start < maxLines) {
    const candidate = lines.slice(start - 1, clampedEnd);
    if (transcriptLength(candidate) > maxChars && start < clampedEnd) {
      break;
    }
    start -= 1;
  }
  return { start, end: clampedEnd, text: lines.slice(start, clampedEnd).join("\n") };
}

/** The oldest lines from `start` that fit a character budget. */
export function windowStartingAt(
  lines: ReadonlyArray<string>,
  start: number,
  maxChars: number,
  maxLines = Number.POSITIVE_INFINITY,
): LineWindow {
  const clampedStart = Math.min(Math.max(0, start), lines.length);
  let end = clampedStart;
  while (end < lines.length && end - clampedStart < maxLines) {
    const candidate = lines.slice(clampedStart, end + 1);
    if (transcriptLength(candidate) > maxChars && end > clampedStart) {
      break;
    }
    end += 1;
  }
  return { start: clampedStart, end, text: lines.slice(clampedStart, end).join("\n") };
}
