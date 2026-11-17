import * as Schema from "effect/Schema";

import { useLocalStorage } from "~/hooks/useLocalStorage";

/** Fork: tool calls start open, each group and each call's details, so activity shows unclicked. */
const OPEN_TOOL_GROUPS_STORAGE_KEY = "t3code:open-tool-groups:v1";

export function useOpenToolGroups() {
  return useLocalStorage(OPEN_TOOL_GROUPS_STORAGE_KEY, false, Schema.Boolean);
}

/** Fork: tool calls open only after a press and hold, so a stray click doesn't peek. Overrides opening them by default. */
const HOLD_TO_OPEN_TOOL_CALLS_STORAGE_KEY = "t3code:hold-to-open-tool-calls:v1";

export function useHoldToOpenToolCalls() {
  return useLocalStorage(HOLD_TO_OPEN_TOOL_CALLS_STORAGE_KEY, false, Schema.Boolean);
}
