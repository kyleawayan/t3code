import * as Schema from "effect/Schema";

import { useLocalStorage } from "~/hooks/useLocalStorage";

/** Fork: tool call groups ("Used 3 tools") start open, so activity shows without a click each. */
const OPEN_TOOL_GROUPS_STORAGE_KEY = "t3code:open-tool-groups:v1";

export function useOpenToolGroups() {
  return useLocalStorage(OPEN_TOOL_GROUPS_STORAGE_KEY, false, Schema.Boolean);
}
