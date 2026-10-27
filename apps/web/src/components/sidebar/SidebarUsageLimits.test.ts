import { describe, expect, it } from "vite-plus/test";

import { withoutApiKeyProviders } from "./SidebarUsageLimits";

type Presentations = Parameters<typeof withoutApiKeyProviders>[0];

describe("withoutApiKeyProviders", () => {
  it("drops API-key accounts, which have no subscription windows to show", () => {
    const presentations = new Map([
      [
        "env-1",
        {
          label: "Laptop",
          serverConfig: {
            providers: [
              { instanceId: "codex", auth: { type: "subscription" } },
              { instanceId: "claude-api", auth: { type: "apiKey" } },
            ],
          },
        },
      ],
      ["env-2", { label: "Offline", serverConfig: null }],
    ]) as unknown as Presentations;

    const eligible = withoutApiKeyProviders(presentations);

    expect(
      [...eligible].map(([id, presentation]) => [
        id,
        presentation.serverConfig?.providers.map((provider) => provider.instanceId) ?? null,
      ]),
    ).toEqual([
      ["env-1", ["codex"]],
      ["env-2", null],
    ]);
  });
});
