import { updateClientSettings, useClientSettings } from "~/hooks/useSettings";

/** Fork: the sidebar's Working shelf opens only on a press and hold, so a glance can't peek. */
export function useHoldToOpenWorking() {
  const hold = useClientSettings((settings) => settings.holdToOpenWorking);
  const setHold = (next: boolean) => void updateClientSettings({ holdToOpenWorking: next });
  return [hold, setHold] as const;
}
