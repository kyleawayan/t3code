import { ProviderDriverKind } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { getShortTriggerModelLabel, getTightTriggerModelLabel } from "./providerIconUtils";

const CLAUDE = ProviderDriverKind.make("claudeAgent");

describe("getShortTriggerModelLabel", () => {
  it("drops the brand the provider icon already shows and keeps the version whole", () => {
    expect(getShortTriggerModelLabel("Claude Opus 5.5", CLAUDE)).toBe("Opus 5.5");
    expect(getShortTriggerModelLabel("Claude Opus 5", CLAUDE)).toBe("Opus 5");
  });

  it("keeps the brand when the rest would start with the version", () => {
    expect(getShortTriggerModelLabel("Gemini 3 Pro", ProviderDriverKind.make("antigravity"))).toBe(
      "Gemini 3 Pro",
    );
  });

  it("leaves names from other brands and single-token names alone", () => {
    expect(getShortTriggerModelLabel("GPT-6.1-Sol", ProviderDriverKind.make("codex"))).toBe(
      "GPT-6.1-Sol",
    );
    expect(getShortTriggerModelLabel("Kimi K2", ProviderDriverKind.make("opencode"))).toBe(
      "Kimi K2",
    );
  });
});

describe("getTightTriggerModelLabel", () => {
  const CODEX = ProviderDriverKind.make("codex");
  const GEMINI = ProviderDriverKind.make("antigravity");

  it("drops the brand even before a version, so the version stays readable", () => {
    expect(getTightTriggerModelLabel("GPT-5.5", CODEX)).toBe("5.5");
    expect(getTightTriggerModelLabel("GPT-6.1-Sol", CODEX)).toBe("6.1-Sol");
    expect(getTightTriggerModelLabel("Gemini 3 Pro", GEMINI)).toBe("3 Pro");
  });

  it("keeps the short label where one exists, and labels without a brand", () => {
    expect(
      getTightTriggerModelLabel("Claude Opus 5.5", ProviderDriverKind.make("claudeAgent")),
    ).toBe("Opus 5.5");
    expect(getTightTriggerModelLabel("o3", CODEX)).toBe("o3");
  });
});
