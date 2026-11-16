import * as Schema from "effect/Schema";

import { useLocalStorage } from "~/hooks/useLocalStorage";

/** Fork: tool calls start open, each group and each call's details, so activity shows unclicked. */
const OPEN_TOOL_GROUPS_STORAGE_KEY = "t3code:open-tool-groups:v1";

export function useOpenToolGroups() {
  return useLocalStorage(OPEN_TOOL_GROUPS_STORAGE_KEY, false, Schema.Boolean);
}
