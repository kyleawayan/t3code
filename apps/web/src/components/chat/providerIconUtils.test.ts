import { ProviderDriverKind } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  getDisplayModelName,
  getProviderRowLabel,
  getShortTriggerModelLabel,
  getTightTriggerModelLabel,
} from "./providerIconUtils";

describe("getProviderRowLabel", () => {
  it("shows a sub-provider named after its provider on its own", () => {
    expect(getProviderRowLabel("OpenCode", "OpenCode Zen")).toBe("OpenCode Zen");
    expect(getProviderRowLabel("OpenCode", "OpenCode Go")).toBe("OpenCode Go");
  });

  it("keeps a provider id that merely starts like the provider name", () => {
    expect(getProviderRowLabel("OpenCode", "opencode-go")).toBe("OpenCode · opencode-go");
  });

  it("joins a sub-provider that names something else", () => {
    expect(getProviderRowLabel("OpenCode", "GitHub Copilot")).toBe("OpenCode · GitHub Copilot");
  });

  it("keeps the provider name when a model has no sub-provider", () => {
    expect(getProviderRowLabel("Claude", undefined)).toBe("Claude");
  });
});

describe("getDisplayModelName", () => {
  it("drops a leading sub-provider qualifier from the model name", () => {
    expect(
      getDisplayModelName({
        slug: "a/b",
        name: "OpenCode Zen: Step 5",
        subProvider: "OpenCode Zen",
      }),
    ).toBe("Step 5");
  });
});

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
