import { FileTree } from "@pierre/trees/react";
import { type ComponentProps, useEffect } from "react";

import { observeResize } from "~/lib/observeResize";

import { resolveSquishEllipsisWidth, resolveSquishScale } from "../SquishText";

// Names squish this far before middle-truncating: tighter than sidebar titles, since a
// narrow tree is the point and file names are short.
const FILE_TREE_NAME_SQUISH_SCALE = 0.65;
// FileTree renders into its host a commit after mounting it; give up rather than poll forever.
const MAX_ATTACH_FRAMES = 60;

const ROW = 'button[data-type="item"]';
const NAME_BOX = ':scope > [data-item-section="content"] > :first-child';
const NAME_HEAD = ':scope > [data-truncate-segment-priority="2"]';
const NAME_TEXT = '[data-truncate-content="visible"]';
// Pierre truncates a name's head away whole before touching its tail, dropping the
// ellipsis too, so "background" read as "round". A head this long keeps at least its
// first letter and ellipsis; a shorter one, like the "." of ".trash", stays as is.
const NAME_HEAD_MIN_EM = 1.25;
const NAME_HEAD_MIN_CHARACTERS = 3;

function nameBoxOf(row: Element): HTMLElement | null {
  const box = row.querySelector<HTMLElement>(NAME_BOX);
  return box && !box.parentElement?.querySelector("[data-item-rename-input]") ? box : null;
}

// Each segment of a long name is clipped, but its scrollWidth still spans the whole text,
// so the natural width reads without resetting earlier fits. The extra pixel covers
// scrollWidth's rounding: a box even half a pixel short of its text makes Pierre trade
// the head's last letter for an ellipsis.
function naturalNameWidth(box: HTMLElement): number {
  let width = 1;
  for (const text of box.querySelectorAll<HTMLElement>(NAME_TEXT)) width += text.scrollWidth;
  return width;
}

// Pierre lays names out inside its shadow root, so SquishText cannot wrap them. Every
// width is read before any style is written, so a batch costs one layout. The name cell
// fills the row's free space (see PIERRE_TREE_UNSAFE_CSS), so its width is the room
// available whatever an earlier fit left on the name box.
function fitNames(boxes: readonly HTMLElement[]): void {
  const fits = boxes.map((box) => {
    const available = box.parentElement?.clientWidth ?? 0;
    const natural = naturalNameWidth(box);
    const head = box.querySelector<HTMLElement>(NAME_HEAD);
    const headText = head?.querySelector(NAME_TEXT)?.textContent ?? "";
    const scale = resolveSquishScale(available, natural, FILE_TREE_NAME_SQUISH_SCALE);
    return {
      box,
      head,
      keepHead: Array.from(headText).length >= NAME_HEAD_MIN_CHARACTERS,
      scale,
      width: resolveSquishEllipsisWidth(available, natural, scale) ?? natural,
    };
  });
  for (const { box, head, keepHead, scale, width } of fits) {
    box.style.transform = scale === 1 ? "" : `scaleX(${scale})`;
    box.style.width = scale === 1 ? "" : `${width}px`;
    if (head) head.style.minWidth = keepHead ? `${NAME_HEAD_MIN_EM}em` : "";
  }
}

function observeNameSquish(host: HTMLElement, root: ShadowRoot): () => void {
  const pendingRows = new Set<Element>();
  let fitAll = false;
  let queued = false;
  const flush = () => {
    queued = false;
    const rows = fitAll ? root.querySelectorAll(ROW) : pendingRows;
    const boxes = Array.from(rows, nameBoxOf).filter(
      (box): box is HTMLElement => box !== null && box.isConnected,
    );
    fitAll = false;
    pendingRows.clear();
    fitNames(boxes);
  };
  const schedule = () => {
    if (queued) return;
    queued = true;
    queueMicrotask(flush);
  };
  // Rows are virtualized and reused, so a row's text, git lane, or decoration can change
  // without the tree resizing.
  const mutations = new MutationObserver((records) => {
    for (const record of records) {
      const target = record.target instanceof Element ? record.target : record.target.parentElement;
      const row = target?.closest(ROW);
      if (row) pendingRows.add(row);
      for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (node.matches(ROW)) pendingRows.add(node);
        for (const added of node.querySelectorAll(ROW)) pendingRows.add(added);
      }
    }
    if (pendingRows.size > 0) schedule();
  });
  mutations.observe(root, { childList: true, subtree: true, characterData: true });
  // The scroll area narrows without the host resizing when a classic scrollbar appears.
  const scrollArea = root.querySelector("[data-file-tree-virtualized-scroll]");
  const stopResize = observeResize(scrollArea ? [host, scrollArea] : host, () => {
    fitAll = true;
    schedule();
  });
  return () => {
    mutations.disconnect();
    stopResize();
  };
}

/** Pierre's FileTree with names that squish before they truncate, like the sidebar's titles. */
export function SquishedFileTree(props: ComponentProps<typeof FileTree>) {
  const { model } = props;
  useEffect(() => {
    let stop: (() => void) | undefined;
    let frame = 0;
    let attempts = 0;
    const attach = () => {
      const host = model.getFileTreeContainer();
      if (host?.shadowRoot) stop = observeNameSquish(host, host.shadowRoot);
      else if (attempts++ < MAX_ATTACH_FRAMES) frame = requestAnimationFrame(attach);
    };
    attach();
    return () => {
      cancelAnimationFrame(frame);
      stop?.();
    };
  }, [model]);
  return <FileTree {...props} />;
}
