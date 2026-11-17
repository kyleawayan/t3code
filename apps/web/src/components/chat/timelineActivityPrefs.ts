import * as Schema from "effect/Schema";

import { useLocalStorage } from "~/hooks/useLocalStorage";

/** Fork: tool calls open only after a press and hold, so a stray click doesn't peek. */
const HOLD_TO_OPEN_TOOL_CALLS_STORAGE_KEY = "t3code:hold-to-open-tool-calls:v1";

export function useHoldToOpenToolCalls() {
  return useLocalStorage(HOLD_TO_OPEN_TOOL_CALLS_STORAGE_KEY, false, Schema.Boolean);
}
