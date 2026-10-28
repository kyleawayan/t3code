import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentPresentationWithProviders } from "@t3tools/client-runtime/state/presentation";
import { type EnvironmentId, ProviderDriverKind, UsageLimitSourceId } from "@t3tools/contracts";
import { Link } from "@tanstack/react-router";
import { collectLimitAccounts } from "@t3tools/shared/usageLimits";
import { useNowMinute } from "../../hooks/useNowMinute";
import { environmentPresentations } from "../../state/presentation";
import { UsageLimitsPooled } from "../usage/UsageLimitsPooled";
import { readUsagePagePreferences, saveUsagePagePreferences } from "../usage/usagePagePreferences";

/**
 * Subscription limits at the foot of the sidebar, with live reset countdowns.
 * API-key accounts have no subscription windows, so they are left out, and the
 * section renders nothing unless some account reports limits.
 */
type Presentations = ReadonlyMap<EnvironmentId, EnvironmentPresentationWithProviders>;

export function withoutApiKeyProviders(presentations: Presentations): Presentations {
  return new Map(
    [...presentations].map(([id, presentation]) => [
      id,
      {
        ...presentation,
        serverConfig: presentation.serverConfig
          ? {
              ...presentation.serverConfig,
              providers: presentation.serverConfig.providers.filter(
                (provider) => provider.auth.type !== "apiKey",
              ),
            }
          : null,
      },
    ]),
  );
}

// Dev builds show sample limits when no account reports any, so the panel can be
// checked on a machine that only uses API keys.
function withDevSampleLimits(presentations: Presentations, now: number): Presentations {
  const first = presentations.entries().next().value;
  if (!first) return presentations;
  const [environmentId, presentation] = first;
  const serverConfig = presentation.serverConfig;
  if (!serverConfig) return presentations;
  const checkedAt = new Date(now).toISOString();
  const resetsIn = (minutes: number) => new Date(now + minutes * 60_000).toISOString();
  return new Map(presentations).set(environmentId, {
    ...presentation,
    serverConfig: {
      ...serverConfig,
      // Real providers' "no limits" notices would crowd out the sample.
      providers: serverConfig.providers.map(
        ({ usageLimits: _usageLimits, ...provider }) => provider,
      ),
      usageLimitSources: [
        {
          id: UsageLimitSourceId.make("dev-sample"),
          kind: "cliproxy",
          label: "Sample (dev)",
          checkedAt,
          accounts: [
            {
              id: "sample-codex",
              driver: ProviderDriverKind.make("codex"),
              plan: "Sample plan",
              usageLimits: {
                checkedAt,
                windows: [
                  {
                    id: "five_hour",
                    kind: "session",
                    label: "Session",
                    usedPercent: 15,
                    windowDurationMins: 300,
                    resetsAt: resetsIn(250),
                  },
                  {
                    id: "seven_day",
                    kind: "weekly",
                    label: "Weekly",
                    usedPercent: 33,
                    windowDurationMins: 10_080,
                    resetsAt: resetsIn(5 * 24 * 60),
                  },
                ],
              },
            },
            {
              id: "sample-claude",
              driver: ProviderDriverKind.make("claudeAgent"),
              plan: "Sample plan",
              usageLimits: {
                checkedAt,
                windows: [
                  {
                    id: "five_hour",
                    kind: "session",
                    label: "Session",
                    usedPercent: 42,
                    windowDurationMins: 300,
                    resetsAt: resetsIn(135),
                  },
                  {
                    id: "seven_day",
                    kind: "weekly",
                    label: "Weekly",
                    usedPercent: 68,
                    windowDurationMins: 10_080,
                    resetsAt: resetsIn(3 * 24 * 60),
                  },
                ],
              },
            },
          ],
        },
      ],
    },
  });
}

export function SidebarUsageLimits() {
  const presentations = useAtomValue(environmentPresentations.presentationsWithProvidersAtom);
  const nowMinute = useNowMinute();
  const now = Date.parse(`${nowMinute}:00Z`);
  const withoutApiKeys = withoutApiKeyProviders(presentations);
  const sample = import.meta.env.DEV && collectLimitAccounts(withoutApiKeys).length === 0;
  const eligible = sample ? withDevSampleLimits(withoutApiKeys, now) : withoutApiKeys;
  if (collectLimitAccounts(eligible).length === 0) return null;

  return (
    <section
      aria-label="Usage limits"
      className="min-h-0 overflow-y-auto px-(--sidebar-row-content-inset) pb-2"
    >
      <Link
        to="/usage"
        onClick={() =>
          saveUsagePagePreferences({ ...readUsagePagePreferences(), metric: "limits" })
        }
        className="mb-2 flex rounded-sm text-xs font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        {sample ? "Usage limits · dev sample" : "Usage limits"}
      </Link>
      <UsageLimitsPooled presentations={eligible} now={now} compact />
    </section>
  );
}
