import { useAtomValue } from "@effect/atom-react";
import { collectLimitAccounts } from "@t3tools/shared/usageLimits";
import * as Schema from "effect/Schema";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { useNowMinute } from "../../hooks/useNowMinute";
import { environmentPresentations } from "../../state/presentation";
import { ProviderInstanceIcon } from "../chat/ProviderInstanceIcon";
import { LimitRow } from "../chat/ThreadDetailsUsage";
import { providerClients } from "../settings/providerDriverMeta";
import { CollapsibleSectionHeader } from "../ui/collapsible-section-header";

const USAGE_LIMITS_COLLAPSED_STORAGE_KEY = "t3code:sidebar-usage-limits-collapsed:v1";

/**
 * Subscription limits at the foot of the sidebar, in the thread details card's rows, under a
 * header that collapses like the Snoozed and Settled shelves.
 * API-key accounts have no subscription windows, so they are left out, and the
 * section renders nothing unless some account reports limits.
 */
export function SidebarUsageLimits() {
  const [collapsed, setCollapsed] = useLocalStorage(
    USAGE_LIMITS_COLLAPSED_STORAGE_KEY,
    false,
    Schema.Boolean,
  );
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
                // Providers spell it apiKey (Claude, Codex), api-key (Cursor), or api_key (Grok).
                (provider) => !/^api[-_]?key$/i.test(provider.auth.type ?? ""),
              ),
            }
          : null,
      },
    ]),
  );
  const nowMinute = useNowMinute();
  const accounts = collectLimitAccounts(eligible).filter(
    (account) => account.limits.windows.length > 0,
  );
  if (accounts.length === 0) return null;
  const now = Date.parse(`${nowMinute}:00Z`);
  const accountsPerDriver = new Map<string, number>();
  for (const account of accounts) {
    accountsPerDriver.set(account.driver, (accountsPerDriver.get(account.driver) ?? 0) + 1);
  }

  return (
    <section
      aria-label="Usage limits"
      className="flex min-h-0 flex-col gap-1.5 overflow-y-auto"
      // The top takes back the thread list's bottom inset and the footer's top padding, so the
      // header follows Settled at the shelves' 1px gap. The bottom, with the footer gap, leaves
      // the chrono's rule as far below the header's baseline as Settled's is above its cap
      // (28px, measured for Atkinson Hyperlegible Next at 13.5px).
      style={{
        marginTop: "calc(1px - var(--sidebar-content-inset) - 0.25rem)",
        paddingBottom: "5px",
      }}
    >
      <div className="mx-0.5 shrink-0">
        <CollapsibleSectionHeader
          expanded={!collapsed}
          onClick={() => setCollapsed((current) => !current)}
          // An empty accessory drops the rule, so the row reads like the Snoozed and Settled shelves.
          accessory={<span aria-hidden />}
        >
          Usage limits
        </CollapsibleSectionHeader>
      </div>
      {collapsed
        ? null
        : accounts.map((account) => {
            const providerLabel = providerClients.get(account.driver)?.label ?? account.driver;
            // Two logins to one provider need their names to tell the rows apart.
            const label =
              (accountsPerDriver.get(account.driver) ?? 0) > 1
                ? (account.displayName ?? account.email ?? providerLabel)
                : providerLabel;
            return (
              <div key={account.key} className="flex flex-col">
                <h3 className="flex items-center gap-2 px-(--sidebar-row-content-inset) text-xs font-medium text-foreground">
                  <ProviderInstanceIcon
                    driverKind={account.driver}
                    displayName={providerLabel}
                    indicatorBackground="var(--background)"
                    className="size-4"
                    iconClassName="size-4 text-foreground/80"
                  />
                  <span className="truncate">{label}</span>
                </h3>
                <div className="flex flex-col text-xs">
                  {account.limits.windows.map((window) => (
                    <LimitRow key={window.id} window={window} now={now} stacked />
                  ))}
                </div>
              </div>
            );
          })}
    </section>
  );
}
