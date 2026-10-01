import { collectLimitPools } from "@t3tools/shared/usageLimits";
import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

vi.mock("../ui/label", () => ({ Label: "label" }));
vi.mock("../ui/switch", () => ({ Switch: "input" }));

import { DevSubscriptionPreviewSwitch } from "./DevSubscriptionPreviewSwitch";
import {
  sampleSubscriptionAccounts,
  SUBSCRIPTION_PREVIEW_STORAGE_KEY,
  useDevSubscriptionPreview,
} from "./subscriptionPreview";

let renderer: ReactTestRenderer | undefined;
let values: Map<string, string>;
const now = Date.parse("2026-10-15T12:00:00Z");

function SubscriptionPreview() {
  const [enabled] = useDevSubscriptionPreview();
  const pools = enabled ? collectLimitPools(sampleSubscriptionAccounts(now), now) : [];
  return <p>{pools.length === 0 ? "No preview" : pools.map((pool) => pool.driver).join(", ")}</p>;
}

beforeEach(() => {
  vi.stubEnv("DEV", true);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  values = new Map();
  const events = new EventTarget();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    },
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    dispatchEvent: events.dispatchEvent.bind(events),
  });
});

afterEach(async () => {
  await act(() => renderer?.unmount());
  renderer = undefined;
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it("toggles both sample providers immediately and persists the dev preference", async () => {
  await act(() => {
    renderer = create(
      <>
        <DevSubscriptionPreviewSwitch />
        <SubscriptionPreview />
      </>,
    );
  });
  expect(renderer!.root.findAllByType("p").at(-1)!.props.children).toBe("No preview");
  await act(() => renderer!.root.findByType("input").props.onCheckedChange(true));
  expect(renderer!.root.findAllByType("p").at(-1)!.props.children).toContain("claudeAgent");
  expect(renderer!.root.findAllByType("p").at(-1)!.props.children).toContain("codex");
  expect(values.get(SUBSCRIPTION_PREVIEW_STORAGE_KEY)).toBe("true");
  expect(sampleSubscriptionAccounts(now).every((account) => account.redeem === null)).toBe(true);
  await act(() => renderer!.root.findByType("input").props.onCheckedChange(false));
  expect(renderer!.root.findAllByType("p").at(-1)!.props.children).toBe("No preview");
});

it("hides the switch and ignores a saved preview flag in production", async () => {
  vi.stubEnv("DEV", false);
  values.set(SUBSCRIPTION_PREVIEW_STORAGE_KEY, "true");
  await act(() => {
    renderer = create(
      <>
        <DevSubscriptionPreviewSwitch />
        <SubscriptionPreview />
      </>,
    );
  });
  expect(renderer!.root.findAllByType("input")).toHaveLength(0);
  expect(renderer!.root.findByType("p").props.children).toBe("No preview");
});
