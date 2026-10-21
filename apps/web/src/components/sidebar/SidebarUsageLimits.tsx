import { useAtomValue } from "@effect/atom-react";
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
export function SidebarUsageLimits() {
  const presentations = useAtomValue(environmentPresentations.presentationsWithProvidersAtom);
  const eligible = new Map(
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
  const nowMinute = useNowMinute();
  if (collectLimitAccounts(eligible).length === 0) return null;
  const now = Date.parse(`${nowMinute}:00Z`);

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
        Usage limits
      </Link>
      <UsageLimitsPooled presentations={eligible} now={now} compact />
    </section>
  );
}
