import type { ScopedThreadRef } from "@t3tools/contracts";
import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { useCallback } from "react";
import { create } from "zustand";

import type { RecapRefreshRequest } from "~/components/chat/threadResume.logic";

import { toastManager } from "~/components/ui/toast";
import { threadEnvironment } from "~/state/threads";
import { useAtomCommand } from "~/state/use-atom-command";

/**
 * Turns a thread's resume recap on or off. The server owns the recap state and
 * echoes it back on the thread, so callers read `recap.enabled` from the shell.
 */
export function useSetThreadRecapEnabled(): (
  threadRef: ScopedThreadRef,
  enabled: boolean,
) => Promise<void> {
  const updateThreadMetadata = useAtomCommand(threadEnvironment.updateMetadata, {
    reportFailure: false,
  });
  return useCallback(
    async (threadRef, enabled) => {
      const result = await updateThreadMetadata({
        environmentId: threadRef.environmentId,
        input: { threadId: threadRef.threadId, recapEnabled: enabled },
      });
      if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
        const error = squashAtomCommandFailure(result);
        toastManager.add({
          type: "error",
          title: enabled ? "Could not turn on resume recap" : "Could not turn off resume recap",
          description: error instanceof Error ? error.message : "An error occurred.",
        });
      }
    },
    [updateThreadMetadata],
  );
}

interface RecapRefreshState {
  /** Session-only: a refresh asked for from the map or the command palette, by thread key. */
  byThreadKey: Record<string, RecapRefreshRequest>;
  clear: (threadKey: string) => void;
}

export const useRecapRefreshStore = create<RecapRefreshState>()((set) => ({
  byThreadKey: {},
  clear: (threadKey) =>
    set((state) => {
      if (!(threadKey in state.byThreadKey)) return state;
      const { [threadKey]: _cleared, ...rest } = state.byThreadKey;
      return { byThreadKey: rest };
    }),
}));

/**
 * Asks the server to regenerate a thread's recap now. `baselineGeneratedAt`
 * is the summary on screen, so the map can show "Refreshing…" until a newer
 * one arrives.
 */
export function useRefreshThreadRecap(): (
  threadRef: ScopedThreadRef,
  baselineGeneratedAt: string | null,
) => Promise<void> {
  const updateThreadMetadata = useAtomCommand(threadEnvironment.updateMetadata, {
    reportFailure: false,
  });
  return useCallback(
    async (threadRef, baselineGeneratedAt) => {
      const threadKey = scopedThreadKey(threadRef);
      useRecapRefreshStore.setState((state) => ({
        byThreadKey: {
          ...state.byThreadKey,
          [threadKey]: { requestedAtMs: Date.now(), baselineGeneratedAt },
        },
      }));
      const result = await updateThreadMetadata({
        environmentId: threadRef.environmentId,
        input: { threadId: threadRef.threadId, refreshRecap: true },
      });
      if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
        useRecapRefreshStore.getState().clear(threadKey);
        const error = squashAtomCommandFailure(result);
        toastManager.add({
          type: "error",
          title: "Could not refresh resume recap",
          description: error instanceof Error ? error.message : "An error occurred.",
        });
      }
    },
    [updateThreadMetadata],
  );
}
