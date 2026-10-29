import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { ScopedThreadRef } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { useLayoutEffect, useRef } from "react";

import { getLocalStorageItem, writeLocalStorageValue } from "~/hooks/useLocalStorage";
import { observeResize } from "~/lib/observeResize";

const STORAGE_KEY = "t3code.markdownPreviewScroll";
const MAX_ENTRIES = 100;
const SAVE_DELAY_MS = 250;
const ScrollTops = Schema.Record(Schema.String, Schema.Number);

export function markdownPreviewScrollKey(
  threadRef: ScopedThreadRef,
  cwd: string,
  relativePath: string,
): string {
  return JSON.stringify([scopedThreadKey(threadRef), cwd, relativePath]);
}

/** Insertion order is recency, so the least recently scrolled files fall off first. */
export function rememberScrollTop(
  scrollTops: typeof ScrollTops.Type,
  key: string,
  top: number,
  limit = MAX_ENTRIES,
): typeof ScrollTops.Type {
  const entries = Object.entries(scrollTops).filter(([entryKey]) => entryKey !== key);
  if (top > 0) entries.push([key, Math.round(top)]);
  return Object.fromEntries(entries.slice(-limit));
}

function readScrollTop(key: string): number {
  try {
    return getLocalStorageItem(STORAGE_KEY, ScrollTops)?.[key] ?? 0;
  } catch (error) {
    console.error(error);
    return 0;
  }
}

/** Attach to a `ScrollArea` to keep its scroll position per key across remounts and reloads. */
export function usePersistedScrollAreaPosition(key: string) {
  const rootRef = useRef<HTMLDivElement>(null);

  // oxlint-disable-next-line t3code/react-effect-budget -- Restore and save the viewport's DOM scroll position in localStorage for this key.
  useLayoutEffect(() => {
    const root = rootRef.current;
    const viewport = root?.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]');
    if (!root || !viewport) return;

    // Re-applied on every resize until the user scrolls: the panel can mount narrow and
    // widen, and scroll anchoring would carry a position reached early to other content.
    let target: number | null = readScrollTop(key);
    let unsavedTop: number | null = null;
    let saveTimer: number | undefined;

    const save = () => {
      window.clearTimeout(saveTimer);
      if (unsavedTop === null) return;
      const top = unsavedTop;
      unsavedTop = null;
      writeLocalStorageValue(
        STORAGE_KEY,
        (scrollTops) => rememberScrollTop(scrollTops, key, top),
        {},
        ScrollTops,
      );
    };
    const restore = () => {
      if (target !== null) viewport.scrollTop = target;
    };
    const stopRestoring = () => {
      target = null;
    };
    const onScroll = () => {
      if (target !== null) return;
      unsavedTop = viewport.scrollTop;
      window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(save, SAVE_DELAY_MS);
    };

    restore();
    const stopObserving = observeResize([viewport, ...viewport.children], restore);
    viewport.addEventListener("scroll", onScroll, { passive: true });
    // On the root so dragging the scrollbar, which sits beside the viewport, also counts.
    const userInputEvents = ["wheel", "touchstart", "pointerdown", "keydown"] as const;
    for (const type of userInputEvents) {
      root.addEventListener(type, stopRestoring, { passive: true, capture: true });
    }
    // React cleanup doesn't run on reload or window close.
    window.addEventListener("pagehide", save);
    return () => {
      stopObserving();
      viewport.removeEventListener("scroll", onScroll);
      window.removeEventListener("pagehide", save);
      for (const type of userInputEvents) {
        root.removeEventListener(type, stopRestoring, { capture: true });
      }
      save();
    };
  }, [key]);

  return rootRef;
}
