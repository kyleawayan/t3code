import type { ChatAttachment } from "@t3tools/contracts";
import { assistantCitationsToPlainText } from "@t3tools/shared/assistantCitations";

export type ThreadTitleMessage = {
  readonly role: "user" | "assistant" | "system";
  readonly text: string;
  readonly attachments?: ReadonlyArray<ChatAttachment> | undefined;
};

export interface ThreadContextBudget {
  /** Characters for the whole context, including role prefixes. */
  readonly total: number;
  /** Characters one message may use before spare space is shared out. */
  readonly perMessage: number;
  /** Characters user messages leave for assistant findings. */
  readonly assistantReserve: number;
}

const TITLE_CONTEXT_BUDGET: ThreadContextBudget = {
  total: 8_000,
  perMessage: 2_000,
  assistantReserve: 2_000,
};
const OMITTED = "[Earlier content truncated]\n\n";
const TRUNCATED = "\n[Content truncated]\n";

/** Keep the request and its final constraints when a message is too long. */
export function limitTitleMessage(text: string, budget: number): string {
  if (text.length <= budget) return text;
  if (budget <= TRUNCATED.length) return "";
  const available = budget - TRUNCATED.length;
  const head = Math.ceil(available / 2);
  const tail = available - head;
  return `${text.slice(0, head)}${TRUNCATED}${tail > 0 ? text.slice(-tail) : ""}`;
}

export function formatThreadTitleContext(messages: ReadonlyArray<ThreadTitleMessage>) {
  return formatThreadContext(messages, TITLE_CONTEXT_BUDGET);
}

/** Reserve space for user intent before adding assistant findings, in conversation order. */
export function formatThreadContext(
  messages: ReadonlyArray<ThreadTitleMessage>,
  budget: ThreadContextBudget,
) {
  const sections = messages.flatMap((message, index) => {
    if (message.role === "system" || (!message.text.trim() && !message.attachments?.length))
      return [];
    return [{ index, message, prefix: `${message.role.toUpperCase()}:\n` }];
  });
  const formatted = new Map<number, string>();
  const contentsFor = (section: (typeof sections)[number]) => {
    const cached = formatted.get(section.index);
    if (cached !== undefined) return cached;
    const text = assistantCitationsToPlainText(section.message.text).trim();
    const names = section.message.attachments?.map((attachment) => attachment.name).join(", ");
    const contents = [text, ...(names ? [`[Attachments: ${names}]`] : [])]
      .filter(Boolean)
      .join("\n");
    formatted.set(section.index, contents);
    return contents;
  };
  const selected = new Map<number, string>();
  let remaining = budget.total - OMITTED.length;
  const add = (section: (typeof sections)[number], budget: number) => {
    if (selected.has(section.index)) return;
    const limit = Math.min(budget, remaining) - section.prefix.length - 2;
    if (limit <= TRUNCATED.length) return;
    const contents = limitTitleMessage(contentsFor(section), limit);
    if (!contents) return;
    const text = section.prefix + contents;
    selected.set(section.index, text);
    remaining -= text.length + 2;
  };

  const firstUser = sections.find((section) => section.message.role === "user");
  if (firstUser) add(firstUser, budget.perMessage);
  // User messages get all but the assistant reserve. Assistant output cannot evict them.
  for (const section of sections.toReversed()) {
    if (section.message.role === "user") {
      add(section, Math.min(budget.perMessage, remaining - budget.assistantReserve));
    }
  }
  for (const section of sections.toReversed()) {
    if (section.message.role === "assistant") add(section, budget.perMessage);
  }
  // Use spare space when the conversation has only a few messages.
  for (const role of ["user", "assistant"] as const) {
    for (const section of sections.toReversed()) {
      const previous = selected.get(section.index);
      if (section.message.role !== role || previous === undefined) continue;
      const expanded =
        section.prefix +
        limitTitleMessage(
          contentsFor(section),
          previous.length + remaining - section.prefix.length,
        );
      remaining -= expanded.length - previous.length;
      selected.set(section.index, expanded);
    }
  }
  const retained = sections.filter((section) => selected.has(section.index));
  const truncated = retained.some(
    (section) => selected.get(section.index) !== section.prefix + contentsFor(section),
  );
  const attachments = retained.flatMap((section) => section.message.attachments ?? []);
  const firstAttachment = firstUser?.message.attachments?.[0];
  const recentAttachments = attachments.filter(
    (attachment) => attachment.id !== firstAttachment?.id,
  );
  return {
    message: `${truncated || retained.length < sections.length ? OMITTED : ""}${retained.map((section) => selected.get(section.index)).join("\n\n")}`,
    attachments: [
      ...(firstAttachment ? [firstAttachment] : []),
      ...recentAttachments.slice(firstAttachment ? -3 : -4),
    ],
  };
}
