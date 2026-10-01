import { ProviderDriverKind } from "@t3tools/contracts";
import {
  AntigravityIcon,
  ClaudeAI,
  CursorIcon,
  GrokIcon,
  Icon,
  OpenAI,
  OpenCodeIcon,
} from "../Icons";

export const PROVIDER_ICON_BY_PROVIDER: Partial<Record<ProviderDriverKind, Icon>> = {
  [ProviderDriverKind.make("codex")]: OpenAI,
  [ProviderDriverKind.make("claudeAgent")]: ClaudeAI,
  [ProviderDriverKind.make("opencode")]: OpenCodeIcon,
  [ProviderDriverKind.make("cursor")]: CursorIcon,
  [ProviderDriverKind.make("grok")]: GrokIcon,
  [ProviderDriverKind.make("antigravity")]: AntigravityIcon,
};

export type ModelEsque = {
  slug: string;
  name: string;
  shortName?: string | undefined;
  subProvider?: string | undefined;
  aliases?: ReadonlyArray<string> | undefined;
  isDefault?: boolean | undefined;
  badge?: "new" | undefined;
  isLegacy?: boolean | undefined;
  isUnavailable?: boolean | undefined;
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripLeadingQualifier(value: string, qualifier: string | null | undefined): string {
  const trimmedQualifier = qualifier?.trim();
  if (!trimmedQualifier) {
    return value;
  }

  const pattern = new RegExp(`^${escapeRegExp(trimmedQualifier)}(?:\\s*[.:/-]\\s*|\\s+)`, "iu");
  return value.replace(pattern, "").trim() || value;
}

export function getDisplayModelName(
  model: ModelEsque,
  options?: { preferShortName?: boolean },
): string {
  const name = options?.preferShortName && model.shortName ? model.shortName : model.name;
  return stripLeadingQualifier(name, model.subProvider);
}

export function getTriggerDisplayModelName(model: ModelEsque): string {
  return getDisplayModelName(model, { preferShortName: true });
}

export function getTriggerDisplayModelLabel(model: ModelEsque): string {
  return getTriggerDisplayModelName(model);
}

// The provider's own brand, which its icon already shows beside the name.
const PROVIDER_BRAND_PREFIX: Partial<Record<ProviderDriverKind, string>> = {
  [ProviderDriverKind.make("claudeAgent")]: "Claude",
  [ProviderDriverKind.make("antigravity")]: "Gemini",
  [ProviderDriverKind.make("grok")]: "Grok",
};

/**
 * A shorter model label for tight footers: the provider's brand word goes,
 * since the icon beside it already says it ("Claude Opus 5.5" → "Opus 5.5").
 * The brand stays when the rest would lead with the version ("Gemini 3 Pro"),
 * so the version always keeps a name in front of it.
 */
export function getShortTriggerModelLabel(label: string, driverKind: ProviderDriverKind): string {
  const brand = PROVIDER_BRAND_PREFIX[driverKind];
  if (!brand || !label.startsWith(`${brand} `)) return label;
  const rest = label.slice(brand.length + 1).trimStart();
  return /^\p{L}/u.test(rest) ? rest : label;
}

// Brands the tightest label drops even before a version. GPT names lead with
// one ("GPT-5.5"), so only this stage can shorten them.
const TIGHT_BRAND_PREFIX: Partial<Record<ProviderDriverKind, string>> = {
  ...PROVIDER_BRAND_PREFIX,
  [ProviderDriverKind.make("codex")]: "GPT",
};

/**
 * The tightest model label, for the narrowest footers: the brand goes even
 * when the version leads ("GPT-5.5" → "5.5", "Gemini 3 Pro" → "3 Pro"). The
 * icon beside it still names the provider, and the version is what tells the
 * models apart, so it must never be the part that gets cut off.
 */
export function getTightTriggerModelLabel(label: string, driverKind: ProviderDriverKind): string {
  const short = getShortTriggerModelLabel(label, driverKind);
  if (short !== label) return short;
  const brand = TIGHT_BRAND_PREFIX[driverKind];
  if (!brand || !(label.startsWith(`${brand} `) || label.startsWith(`${brand}-`))) return label;
  const rest = label.slice(brand.length + 1).trimStart();
  return rest.length > 0 ? rest : label;
}
