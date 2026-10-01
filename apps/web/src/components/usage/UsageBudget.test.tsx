import { EnvironmentId, USAGE_CONTRACT_VERSION } from "@t3tools/contracts";
import { mergeUsage } from "@t3tools/shared/usageMerge";
import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

const state = vi.hoisted(() => ({ useUsage: vi.fn() }));
vi.mock("../../state/usage", () => ({ useUsage: state.useUsage }));
vi.mock("../../hooks/useNowMinute", () => ({ useNowMinute: () => "2026-10-15T12:00" }));
vi.mock("../ui/button", () => ({ Button: "button" }));
vi.mock("../ui/input", () => ({ Input: "input" }));
vi.mock("../ui/label", () => ({ Label: "label" }));

import { UsageBudget, UsageBudgetProgress } from "./UsageBudget";
import { useUsageBudget } from "./useUsageBudget";
import {
  DAILY_USAGE_BUDGET_STORAGE_KEY,
  USAGE_BUDGET_STORAGE_KEY,
  type UsageBudgetPeriod,
} from "./usageBudgetUtils";

let renderer: ReactTestRenderer | undefined;
let values: Map<string, string>;

function SidebarBudget({ period = "month" }: { period?: UsageBudgetPeriod }) {
  const [budgetUsd] = useUsageBudget(period);
  return budgetUsd === null ? null : (
    <UsageBudgetProgress budgetUsd={budgetUsd} period={period} compact />
  );
}

function displayedText() {
  const text: string[] = [];
  const visit = (node: ReturnType<ReactTestRenderer["toJSON"]> | string) => {
    if (typeof node === "string") text.push(node);
    else if (Array.isArray(node)) node.forEach(visit);
    else node?.children?.forEach(visit);
  };
  visit(renderer?.toJSON() ?? null);
  return text.join(" ");
}

beforeEach(() => {
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
  state.useUsage.mockReset().mockReturnValue({
    merged: {
      ...mergeUsage([], USAGE_CONTRACT_VERSION),
      costUsd: 40,
      providers: [
        { provider: "claude", costUsd: 30 },
        { provider: "codex", costUsd: 10 },
      ],
    },
    environments: [
      {
        environmentId: EnvironmentId.make("test-environment"),
        error: null,
        summary: { contractVersion: USAGE_CONTRACT_VERSION },
      },
    ],
    isPending: false,
    isPartial: false,
  });
});

afterEach(async () => {
  await act(() => renderer?.unmount());
  renderer = undefined;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("saves, updates, and removes the budget while updating sidebar progress immediately", async () => {
  await act(() => {
    renderer = create(
      <>
        <UsageBudget />
        <SidebarBudget />
      </>,
    );
  });
  expect(state.useUsage).not.toHaveBeenCalled();
  await act(() => renderer!.root.findByType("input").props.onChange({ target: { value: "100" } }));
  await act(() => renderer!.root.findByType("form").props.onSubmit({ preventDefault: () => {} }));
  expect(values.get(USAGE_BUDGET_STORAGE_KEY)).toBe("100");
  expect(displayedText()).toContain("60% left");
  expect(displayedText()).toContain("$40.00");

  await act(() => renderer!.root.findByType("input").props.onChange({ target: { value: "50" } }));
  await act(() => renderer!.root.findByType("form").props.onSubmit({ preventDefault: () => {} }));
  expect(values.get(USAGE_BUDGET_STORAGE_KEY)).toBe("50");
  expect(displayedText()).toContain("20% left");

  await act(() =>
    renderer!.root
      .findAllByType("button")
      .find((node) => node.props.children === "Remove budget")!
      .props.onClick(),
  );
  expect(values.has(USAGE_BUDGET_STORAGE_KEY)).toBe(false);
  expect(displayedText()).not.toContain("% left");
});

it("restores a saved budget and shows no dollar amounts in compact progress", async () => {
  values.set(USAGE_BUDGET_STORAGE_KEY, "100");
  await act(() => {
    renderer = create(<SidebarBudget />);
  });
  expect(displayedText()).toContain("60% left");
  expect(displayedText()).not.toContain("$");
});

it("keeps daily and monthly budgets independent when saving and removing either", async () => {
  await act(() => {
    renderer = create(
      <>
        <UsageBudget period="day" />
        <UsageBudget period="month" />
        <SidebarBudget period="day" />
        <SidebarBudget period="month" />
      </>,
    );
  });
  expect(state.useUsage).not.toHaveBeenCalled();
  await act(() =>
    renderer!.root.findAllByType("input")[0]!.props.onChange({ target: { value: "50" } }),
  );
  await act(() =>
    renderer!.root.findAllByType("form")[0]!.props.onSubmit({ preventDefault: () => {} }),
  );
  expect(values.get(DAILY_USAGE_BUDGET_STORAGE_KEY)).toBe("50");
  expect(values.has(USAGE_BUDGET_STORAGE_KEY)).toBe(false);
  expect(displayedText()).toContain("Today");
  expect(displayedText()).toContain("20% left");
  expect(state.useUsage).toHaveBeenCalledWith(
    expect.objectContaining({ sinceDay: "2026-10-15", untilDay: "2026-10-15" }),
  );

  await act(() =>
    renderer!.root.findAllByType("input")[1]!.props.onChange({ target: { value: "100" } }),
  );
  await act(() =>
    renderer!.root.findAllByType("form")[1]!.props.onSubmit({ preventDefault: () => {} }),
  );
  expect(values.get(USAGE_BUDGET_STORAGE_KEY)).toBe("100");
  expect(displayedText()).toContain("This month");
  expect(displayedText()).toContain("60% left");
  expect(state.useUsage).toHaveBeenCalledWith(
    expect.objectContaining({ sinceDay: "2026-10-01", untilDay: "2026-10-15" }),
  );

  await act(() =>
    renderer!.root
      .findAllByType("button")
      .find((node) => node.props.children === "Remove budget")!
      .props.onClick(),
  );
  expect(values.has(DAILY_USAGE_BUDGET_STORAGE_KEY)).toBe(false);
  expect(values.get(USAGE_BUDGET_STORAGE_KEY)).toBe("100");
  expect(displayedText()).not.toContain("Today");
  expect(displayedText()).toContain("60% left");
});

it("labels incomplete estimates instead of claiming all remaining budget is available", async () => {
  const result = state.useUsage.getMockImplementation()!();
  state.useUsage.mockReturnValue({ ...result, isPartial: true });
  await act(() => {
    renderer = create(<UsageBudgetProgress budgetUsd={100} compact />);
  });
  expect(displayedText()).toContain("≤60% left");
  expect(displayedText()).toContain("Partial estimate");
});

it("shows unavailable usage instead of an untouched budget when every environment fails", async () => {
  state.useUsage.mockReturnValue({
    merged: mergeUsage([], USAGE_CONTRACT_VERSION),
    environments: [{ summary: null, error: "Unavailable" }],
    isPending: false,
    isPartial: false,
  });
  await act(() => {
    renderer = create(<UsageBudgetProgress budgetUsd={100} compact />);
  });
  expect(displayedText()).toContain("Budget usage unavailable");
  expect(displayedText()).not.toContain("100% left");
});
