import * as Schema from "effect/Schema";

import { readLocalStorageValue } from "./hooks/useLocalStorage";

/** Fork: MTG INHIBIT, under the sidebar chrono, silences alert sounds until it is pressed again. */
export const MTG_INHIBIT_STORAGE_KEY = "t3code:mtg-inhibit:v1";
export const MtgInhibitSchema = Schema.Boolean;

export function isMtgInhibited(): boolean {
  return readLocalStorageValue(MTG_INHIBIT_STORAGE_KEY, false, MtgInhibitSchema);
}
