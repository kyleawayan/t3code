import { useAtomValue } from "@effect/atom-react";
import { Link } from "@tanstack/react-router";
import { collectLimitAccounts } from "@t3tools/shared/usageLimits";
import { useMemo } from "react";

import { useNowMinute } from "../../hooks/useNowMinute";
import { environmentPresentations } from "../../state/presentation";
import { useSidebar } from "../ui/sidebar";
import { UsageLimitsPooled } from "../usage/UsageLimitsPooled";
import { readUsagePagePreferences, saveUsagePagePreferences } from "../usage/usagePagePreferences";

export function SidebarUsageLimits() {
  const presentations = useAtomValue(environmentPresentations.presentationsAtom);
  const { isMobile, setOpenMobile } = useSidebar();
  const eligible = useMemo(
    () =>
      new Map(
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
      ),
    [presentations],
  );
  const nowMinute = useNowMinute();
  const now = Date.parse(`${nowMinute}:00Z`);
  if (collectLimitAccounts(eligible).length === 0) return null;

  return (
    <section aria-label="Usage limits" className="min-h-0 overflow-y-auto px-1 pb-2">
      <Link
        to="/usage"
        onClick={() => {
          saveUsagePagePreferences({ ...readUsagePagePreferences(), metric: "limits" });
          if (isMobile) setOpenMobile(false);
        }}
        className="mb-2 flex rounded-sm text-xs font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        Usage limits
      </Link>
      <UsageLimitsPooled presentations={eligible} now={now} compact />
    </section>
  );
}
