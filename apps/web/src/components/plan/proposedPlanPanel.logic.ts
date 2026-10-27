import type { OrchestrationV2ThreadProjection } from "@t3tools/contracts";

/**
 * The newest markdown for a plan: the timeline's turn item first, as the plan card reads it, then
 * the plan artifact. History paging blanks older plans, so an empty result means "unavailable".
 */
export function findProposedPlanMarkdown(
  projection: Pick<OrchestrationV2ThreadProjection, "turnItems" | "plans"> | null,
  planId: string,
): string | null {
  if (projection === null) return null;
  const item = projection.turnItems.findLast(
    (candidate) => candidate.type === "proposed_plan" && candidate.planId === planId,
  );
  if (item?.type === "proposed_plan" && item.markdown.trim()) return item.markdown;
  const plan = projection.plans.find(
    (candidate) => candidate.kind === "proposed_plan" && candidate.id === planId,
  );
  return plan?.kind === "proposed_plan" && plan.markdown.trim() ? plan.markdown : null;
}

// Rendered text drops markdown syntax, so both sides are compared without it.
function comparable(text: string): string {
  return text
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/, "")
    .replace(/[*_`#>~|]/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * The 1-based source lines a selection in the rendered plan came from. The rendered blocks the
 * selection starts and ends in (a list item, a paragraph) are matched as whole lines first, since
 * a short selection like "tests" also appears inside unrelated lines; the selected text itself is
 * the fallback. Null when nothing can be placed, such as a selection inside a rendered table.
 */
export function locatePlanSelection(
  markdown: string,
  selection: { text: string; startBlock?: string | undefined; endBlock?: string | undefined },
): { startLine: number; endLine: number } | null {
  const sourceLines = markdown.split("\n").map(comparable);
  const selected = selection.text.split("\n").map(comparable).filter(Boolean);
  const find = (block: string | undefined, fragment: string | undefined, from: number) => {
    const whole = block === undefined ? "" : comparable(block);
    if (whole) {
      const index = sourceLines.findIndex((line, i) => i >= from && line === whole);
      if (index !== -1) return index;
    }
    if (fragment === undefined) return -1;
    return sourceLines.findIndex((line, i) => i >= from && line.includes(fragment));
  };
  const start = find(selection.startBlock, selected[0], 0);
  if (start === -1) return null;
  const end = find(selection.endBlock, selected.at(-1), start);
  if (end === -1) return null;
  return { startLine: start + 1, endLine: end + 1 };
}
