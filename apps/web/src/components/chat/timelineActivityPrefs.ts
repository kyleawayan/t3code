import { updateClientSettings, useClientSettings } from "~/hooks/useSettings";

/** Fork: tool calls open only after a press and hold, so a stray click doesn't peek. */
export function useHoldToOpenToolCalls() {
  const hold = useClientSettings((settings) => settings.holdToOpenToolCalls);
  const setHold = (next: boolean) => void updateClientSettings({ holdToOpenToolCalls: next });
  return [hold, setHold] as const;
}
