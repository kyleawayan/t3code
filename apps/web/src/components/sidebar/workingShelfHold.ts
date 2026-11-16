import * as Schema from "effect/Schema";

import { useLocalStorage } from "~/hooks/useLocalStorage";

/** Fork: the sidebar's Working shelf opens only on a press and hold, so a glance can't peek. */
const HOLD_TO_OPEN_WORKING_STORAGE_KEY = "t3code:hold-to-open-working:v1";

export function useHoldToOpenWorking() {
  return useLocalStorage(HOLD_TO_OPEN_WORKING_STORAGE_KEY, false, Schema.Boolean);
}
