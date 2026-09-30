import type { ScopedThreadRef } from "@t3tools/contracts";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { useCallback } from "react";

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
