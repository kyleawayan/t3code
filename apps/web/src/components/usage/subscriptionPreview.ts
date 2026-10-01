import { ProviderDriverKind } from "@t3tools/contracts";
import type { LimitAccount } from "@t3tools/shared/usageLimits";
import * as Schema from "effect/Schema";

import { useLocalStorage } from "../../hooks/useLocalStorage";

export const SUBSCRIPTION_PREVIEW_STORAGE_KEY = "t3code:dev:subscription-bars:v1";

export function useDevSubscriptionPreview() {
  const [enabled, setEnabled] = useLocalStorage(
    SUBSCRIPTION_PREVIEW_STORAGE_KEY,
    false,
    Schema.Boolean,
  );
  return [import.meta.env.DEV && enabled, setEnabled] as const;
}

export function sampleSubscriptionAccounts(now: number): readonly LimitAccount[] {
  return (["claudeAgent", "codex"] as const).map((driver, index) => ({
    key: `sample-${driver}`,
    driver: ProviderDriverKind.make(driver),
    displayName: driver === "codex" ? "Sample Codex account" : "Sample Claude account",
    email: undefined,
    plan: "Sample subscription",
    accentColor: undefined,
    environments: [],
    sourceLabel: "Sample data",
    redeem: null,
    limits: {
      checkedAt: new Date(now).toISOString(),
      windows: [
        {
          id: "five_hour",
          kind: "session",
          label: "5-hour",
          usedPercent: index === 0 ? 20 : 35,
          windowDurationMins: 300,
          resetsAt: new Date(now + (index + 1) * 3_600_000).toISOString(),
        },
        {
          id: "weekly",
          kind: "weekly",
          label: "Weekly",
          usedPercent: index === 0 ? 70 : 45,
          windowDurationMins: 10_080,
          resetsAt: new Date(now + (index + 2) * 86_400_000).toISOString(),
        },
      ],
    },
  }));
}
