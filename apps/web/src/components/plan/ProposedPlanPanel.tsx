import type { EnvironmentId, ScopedThreadRef } from "@t3tools/contracts";
import { proposedPlanTitle, stripDisplayedPlanMarkdown } from "@t3tools/shared/proposedPlanText";
import { CopyIcon, DownloadIcon, MessageSquarePlusIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { type DraftId, useComposerDraftStore } from "~/composerDraftStore";
import { useCopyToClipboard } from "~/hooks/useCopyToClipboard";
import {
  observeSelectionActions,
  resolveSelectionActionPosition,
  type SelectionActionPoint,
} from "~/lib/selectionActions";
import {
  buildProposedPlanMarkdownFilename,
  downloadPlanAsTextFile,
  normalizePlanMarkdownForExport,
} from "~/proposedPlan";
import type { ReviewCommentContext } from "~/reviewCommentContext";
import { useThreadProjection } from "~/state/entities";
import ChatMarkdown from "../ChatMarkdown";
import { nextFileCommentId } from "../files/fileCommentAnnotations";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { findProposedPlanMarkdown, locatePlanSelection } from "./proposedPlanPanel.logic";

/**
 * Builds the composer comment for a passage of the plan. The plan has no file, so the comment
 * names the plan instead of a path and quotes the source lines (or the selected text, when the
 * lines can't be placed) for the agent.
 */
export function buildPlanReviewComment(input: {
  id: string;
  planId: string;
  markdown: string;
  selectedText: string;
  startBlock?: string | undefined;
  endBlock?: string | undefined;
  text: string;
}): ReviewCommentContext {
  const title = proposedPlanTitle(input.markdown) ?? "Proposed plan";
  const lines = locatePlanSelection(input.markdown, {
    text: input.selectedText,
    startBlock: input.startBlock,
    endBlock: input.endBlock,
  });
  const quoted = lines
    ? input.markdown
        .split("\n")
        .slice(lines.startLine - 1, lines.endLine)
        .join("\n")
    : input.selectedText.trim();
  return {
    id: input.id,
    sectionId: `plan:${input.planId}`,
    sectionTitle: "Proposed plan comment",
    // Agents often title plans "Plan: …" already.
    filePath: /^plan\b/i.test(title) ? title : `Plan: ${title}`,
    startIndex: lines ? lines.startLine - 1 : 0,
    endIndex: lines ? lines.endLine - 1 : 0,
    rangeLabel: !lines
      ? "Selection"
      : lines.startLine === lines.endLine
        ? `L${lines.startLine}`
        : `L${lines.startLine} to L${lines.endLine}`,
    text: input.text.trim(),
    diff: quoted,
    fenceLanguage: "markdown",
  };
}

type PendingComment = {
  selectedText: string;
  startBlock: string | undefined;
  endBlock: string | undefined;
  position: SelectionActionPoint;
};

const PLAN_BLOCK_SELECTOR = "p, li, h1, h2, h3, h4, h5, h6, td, th, pre, blockquote";

// A list item's text includes its nested items, so only its own first line is kept.
function blockTextAt(node: Node, root: HTMLElement): string | undefined {
  const element = node instanceof Element ? node : node.parentElement;
  const block = element?.closest(PLAN_BLOCK_SELECTOR);
  if (!block || !root.contains(block)) return undefined;
  return (block as HTMLElement).innerText.split("\n")[0];
}

/** Fork: a proposed plan opened from its card, read-only, with selection comments. */
export function ProposedPlanPanel({
  planId,
  threadRef,
  environmentId,
  composerDraftTarget,
  cwd,
}: {
  planId: string;
  threadRef: ScopedThreadRef;
  environmentId: EnvironmentId;
  composerDraftTarget: ScopedThreadRef | DraftId;
  cwd: string | undefined;
}) {
  const projection = useThreadProjection(threadRef)?.projection ?? null;
  const markdown = findProposedPlanMarkdown(projection, planId);
  const addReviewComment = useComposerDraftStore((store) => store.addReviewComment);
  const { copyToClipboard, isCopied } = useCopyToClipboard();
  const [content, setContent] = useState<HTMLDivElement | null>(null);
  const actionRef = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<PendingComment | null>(null);
  const [composing, setComposing] = useState<PendingComment | null>(null);
  const [commentText, setCommentText] = useState("");

  // oxlint-disable-next-line t3code/react-effect-budget -- subscribes to document selection changes.
  useEffect(() => {
    if (!content) return;
    const clear = () => setSelection(null);
    const actions = observeSelectionActions({
      element: content,
      getActionElement: () => actionRef.current,
      onSelection: (pointer) => {
        const native = window.getSelection();
        const range = native && native.rangeCount > 0 ? native.getRangeAt(0) : null;
        const selectedText = native?.toString().trim() ?? "";
        if (!range || !selectedText || !content.contains(range.commonAncestorContainer)) {
          clear();
          return;
        }
        const rects = range.getClientRects();
        setSelection({
          selectedText,
          startBlock: blockTextAt(range.startContainer, content),
          endBlock: blockTextAt(range.endContainer, content),
          position: resolveSelectionActionPosition({
            bounds: content.getBoundingClientRect(),
            selectionRect: rects.item(rects.length - 1) ?? range.getBoundingClientRect(),
            pointer,
            viewport: { width: window.innerWidth, height: window.innerHeight },
          }),
        });
      },
      onDismiss: clear,
    });
    document.addEventListener("selectionchange", actions.selectionChanged);
    return () => {
      document.removeEventListener("selectionchange", actions.selectionChanged);
      actions.dispose();
    };
  }, [content]);

  if (markdown === null) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-muted-foreground text-sm">
        This plan isn't loaded. Scroll the thread back to it, or open it again from its card.
      </div>
    );
  }

  const title = proposedPlanTitle(markdown) ?? "Proposed plan";
  const closeComment = () => {
    setComposing(null);
    setCommentText("");
  };
  const submitComment = () => {
    if (!composing || !commentText.trim()) return;
    addReviewComment(
      composerDraftTarget,
      buildPlanReviewComment({
        id: nextFileCommentId(),
        planId,
        markdown,
        selectedText: composing.selectedText,
        startBlock: composing.startBlock,
        endBlock: composing.endBlock,
        text: commentText,
      }),
    );
    window.getSelection()?.removeAllRanges();
    closeComment();
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-1 border-b px-3 py-1.5">
        <span className="min-w-0 flex-1 truncate font-medium text-sm">{title}</span>
        <Button
          aria-label="Copy plan"
          size="icon-xs"
          variant="ghost"
          onClick={() => copyToClipboard(markdown, undefined)}
        >
          <CopyIcon aria-hidden="true" />
        </Button>
        <span className="sr-only" aria-live="polite">
          {isCopied ? "Plan copied" : ""}
        </span>
        <Button
          aria-label="Download plan"
          size="icon-xs"
          variant="ghost"
          onClick={() =>
            downloadPlanAsTextFile(
              buildProposedPlanMarkdownFilename(markdown),
              normalizePlanMarkdownForExport(markdown),
            )
          }
        >
          <DownloadIcon aria-hidden="true" />
        </Button>
      </div>
      <div ref={setContent} className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <ChatMarkdown
          text={stripDisplayedPlanMarkdown(markdown)}
          cwd={cwd}
          environmentId={environmentId}
          threadRef={threadRef}
          isStreaming={false}
        />
      </div>
      {selection && !composing
        ? createPortal(
            <div
              ref={actionRef}
              className="fixed z-50"
              style={{ left: selection.position.x, top: selection.position.y }}
            >
              <Button
                size="xs"
                variant="glass"
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => {
                  setComposing(selection);
                  setSelection(null);
                }}
              >
                <MessageSquarePlusIcon aria-hidden="true" className="size-3.5" />
                Comment
              </Button>
            </div>,
            document.body,
          )
        : null}
      {composing
        ? createPortal(
            <div
              ref={actionRef}
              className="dropdown-glass fixed z-50 flex w-72 flex-col gap-2 rounded-xl p-2 shadow-xl"
              style={{
                left: Math.min(composing.position.x, window.innerWidth - 296),
                top: Math.min(composing.position.y, window.innerHeight - 160),
              }}
            >
              <Textarea
                aria-label="Comment on the plan"
                autoFocus
                size="sm"
                placeholder="Comment for the agent"
                value={commentText}
                onChange={(event) => setCommentText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    closeComment();
                  } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                    event.preventDefault();
                    submitComment();
                  }
                }}
              />
              <div className="flex justify-end gap-1">
                <Button size="xs" variant="ghost" onClick={closeComment}>
                  Cancel
                </Button>
                <Button size="xs" disabled={!commentText.trim()} onClick={submitComment}>
                  Comment
                </Button>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
