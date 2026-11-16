import "~/index.css";
import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";

vi.mock(
  import("~/components/ChatMarkdown"),
  () =>
    ({
      default: (props: { text: string }) => <div data-testid="markdown">{props.text}</div>,
    }) as never,
);
vi.mock(import("~/lib/openPullRequestLink"), () => ({
  useOpenChangeRequestLink: () => () => false,
}));
vi.mock(import("~/browser/useOpenLink"), () => ({ useOpenLink: () => async () => {} }));

import { render } from "../../test/render";
import { PULL_REQUESTS_PANEL_REF, useRightPanelStore } from "../rightPanelStore";
import { useLinearKeyStore, type LinearBridge } from "./linearBridge";
import { LINEAR_FIXTURE_ISSUES } from "./linearFixtures";
import { LinearIssuePanel } from "./LinearIssuePanel";
import { tryOpenLinearLink } from "./linearOpen";
import { newLinearSurface } from "./linearSurface";

const environmentId = EnvironmentId.make("environment");
const threadRef = scopeThreadRef(environmentId, ThreadId.make("thread"));
const KEY_STATUS = {
  hasKey: true,
  encryptionAvailable: true,
  workspaceName: "My Workspace",
  workspaceUrlKey: "my-workspace",
};

function installBridge(request: LinearBridge["request"]): Disposable {
  window.t3Linear = {
    status: async () => KEY_STATUS,
    setKey: async () => ({ ok: true, status: KEY_STATUS }),
    clearKey: async () => true,
    request,
    claimHistory: async () => true,
    onHistoryStep: () => () => {},
  };
  useLinearKeyStore.setState({ status: KEY_STATUS });
  return {
    [Symbol.dispose]() {
      delete window.t3Linear;
      useLinearKeyStore.setState({ status: null });
    },
  };
}

const fixtureRequest: LinearBridge["request"] = async (_query, variables) => ({
  ok: true,
  data: { issue: LINEAR_FIXTURE_ISSUES[String(variables.id)] ?? null },
});

function LinearHarness(props: { visible?: boolean }) {
  const surface = useRightPanelStore((state) =>
    state.byThreadKey[scopedThreadKey(threadRef)]?.surfaces.find(
      (entry) => entry.kind === "linear",
    ),
  );
  if (surface?.kind !== "linear") return null;
  return (
    <LinearIssuePanel
      threadRef={threadRef}
      environmentId={environmentId}
      surface={surface}
      visible={props.visible ?? true}
    />
  );
}

function openTab(identifier: string) {
  useRightPanelStore.getState().removeThread(threadRef);
  useRightPanelStore
    .getState()
    .setLinearSurface(threadRef, newLinearSurface("test", identifier), true);
}

it("renders an issue page from Linear's data", async () => {
  using _bridge = installBridge(fixtureRequest);
  openTab("ENG-1");
  await using screen = await render(<LinearHarness />);

  await expect
    .element(screen.getByRole("heading", { name: "Sample issue for the Linear tab" }))
    .toBeVisible();
  const properties = screen.getByLabelText("Properties");
  await expect.element(properties.getByText("Bug", { exact: true })).toBeVisible();
  await expect.element(properties.getByText("Follow-up", { exact: true })).toBeVisible();
  // The timing in parentheses is covered by cycleLabel's own tests.
  await expect.element(properties.getByText(/^Cycle 10 \(/)).toBeVisible();
  await expect.element(properties.getByText("1 related")).toBeVisible();

  const subIssues = screen.getByRole("region", { name: "Sub-issues" });
  await expect.element(subIssues.getByText("2/6")).toBeVisible();
  expect(
    subIssues
      .getByRole("listitem")
      .all()
      .map((row) => row.element().textContent),
  ).toEqual([
    expect.stringContaining("Finished step"),
    expect.stringContaining("Sub-issue waiting on review"),
    expect.stringContaining("Nested sub-issue one level deeper"),
    expect.stringContaining("Blocked next step"),
    expect.stringContaining("Someday idea"),
    expect.stringContaining("Dropped approach"),
  ]);

  await expect.element(screen.getByText("Agent notes")).toBeVisible();
  const activity = screen.getByRole("region", { name: "Activity" });
  await expect.element(activity.getByText(/added related issue ENG-5/)).toBeVisible();
  await expect.element(activity.getByText("via MCP")).toBeVisible();
  await expect.element(activity.getByText("A threaded reply to the first comment.")).toBeVisible();
  expect(
    activity
      .getByRole("listitem")
      .all()
      .map((item) => item.element().textContent),
  ).toEqual([
    expect.stringContaining("Linear moved from Cycle 9 to Cycle 10"),
    expect.stringContaining("Second comment"),
    expect.stringContaining("First comment"),
    expect.stringContaining("added related issue ENG-5"),
    expect.stringContaining("created the issue"),
  ]);
});

it("navigates into sub-issues and relations, and back with the keyboard", async () => {
  using _bridge = installBridge(fixtureRequest);
  openTab("ENG-1");
  await using screen = await render(<LinearHarness />);

  // The row comes before the blocked row's chip that names it.
  await userEvent.click(
    screen.getByRole("button", { name: /Sub-issue waiting on review/ }).first(),
  );
  await expect.element(screen.getByText("Sub-issue of")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: /^ENG-1 / })).toBeVisible();

  const mod = /Mac/.test(navigator.platform) ? "Meta" : "Control";
  // `[[` is a literal bracket in user-event's key syntax.
  await userEvent.keyboard(`{${mod}>}[[{/${mod}}`);
  await expect
    .element(screen.getByRole("heading", { name: "Sample issue for the Linear tab" }))
    .toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Forward" }));
  // One blocked issue: the chip opens it directly instead of a list.
  await userEvent.click(screen.getByRole("button", { name: /^Blocks ENG-4/ }));
  await expect.element(screen.getByRole("heading", { name: "ENG-4 wasn't found" })).toBeVisible();
});

it("explains how to add a key when there isn't one", async () => {
  using _bridge = installBridge(async () => ({
    ok: false,
    error: "no-key",
    message: "Add a Linear API key in Settings.",
  }));
  openTab("ENG-9");
  await using screen = await render(<LinearHarness />);

  await expect
    .element(screen.getByRole("heading", { name: "Linear needs an API key" }))
    .toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Open Settings" })).toBeVisible();
});

it("opens only links to the key's workspace in the tab", () => {
  using _bridge = installBridge(fixtureRequest);
  useRightPanelStore.getState().removeThread(threadRef);

  expect(tryOpenLinearLink("https://linear.app/other-team/issue/ENG-2/title", threadRef)).toBe(
    false,
  );
  expect(tryOpenLinearLink("https://github.com/example/repo/pull/1", threadRef)).toBe(false);
  expect(tryOpenLinearLink("https://linear.app/my-workspace/issue/ENG-2/title", undefined)).toBe(
    false,
  );
  expect(
    tryOpenLinearLink("https://linear.app/my-workspace/issue/ENG-2/title", PULL_REQUESTS_PANEL_REF),
  ).toBe(false);
  expect(tryOpenLinearLink("https://linear.app/my-workspace/issue/ENG-2/title", threadRef)).toBe(
    true,
  );
  const panel = () => useRightPanelStore.getState().byThreadKey[scopedThreadKey(threadRef)];
  const firstTab = panel()?.surfaces[0]?.id;
  expect(panel()).toMatchObject({
    isOpen: true,
    activeSurfaceId: firstTab,
    surfaces: [{ kind: "linear", history: ["ENG-2"], index: 0 }],
  });
  // Another issue opens a second tab; the first issue switches back to its own tab.
  expect(tryOpenLinearLink("https://linear.app/my-workspace/issue/ENG-5", threadRef)).toBe(true);
  expect(tryOpenLinearLink("https://linear.app/my-workspace/issue/ENG-2", threadRef)).toBe(true);
  expect(
    panel()?.surfaces.map((surface) => (surface.kind === "linear" ? surface.history : null)),
  ).toEqual([["ENG-2"], ["ENG-5"]]);
  expect(panel()?.activeSurfaceId).toBe(firstTab);

  useLinearKeyStore.setState({ status: { ...KEY_STATUS, hasKey: false } });
  expect(tryOpenLinearLink("https://linear.app/my-workspace/issue/ENG-3", threadRef)).toBe(false);
});

it("searches issues and opens the chosen one", async () => {
  using _bridge = installBridge(async (query, variables) =>
    query.includes("searchIssues")
      ? {
          ok: true,
          data: {
            searchIssues: {
              nodes:
                variables.term === "nested" || variables.term === "gpt-4"
                  ? [LINEAR_FIXTURE_ISSUES["ENG-7"]]
                  : [],
            },
          },
        }
      : query.includes("assignedIssues")
        ? {
            ok: true,
            data: { viewer: { assignedIssues: { nodes: [LINEAR_FIXTURE_ISSUES["ENG-1"]] } } },
          }
        : fixtureRequest(query, variables),
  );
  openTab("");
  await using screen = await render(<LinearHarness />);

  const results = screen.getByRole("region", { name: "Search results" });
  await expect.element(results.getByText("Sample issue for the Linear tab")).toBeVisible();

  const searchbox = screen.getByRole("searchbox", { name: "Search Linear issues" });
  // A key-shaped term offers the key and still searches.
  await userEvent.type(searchbox, "gpt-4");
  await expect.element(results.getByText("Open GPT-4")).toBeVisible();
  await expect.element(results.getByText("Nested sub-issue one level deeper")).toBeVisible();
  await userEvent.clear(searchbox);
  await userEvent.type(searchbox, "nested");
  await expect.element(results.getByText("Nested sub-issue one level deeper")).toBeVisible();
  await userEvent.keyboard("{Enter}");
  await expect
    .element(screen.getByRole("heading", { name: "Nested sub-issue one level deeper" }))
    .toBeVisible();
});

it("fetches only while its tab is on screen", async () => {
  const request = vi.fn(fixtureRequest);
  using _bridge = installBridge(request);
  // An issue no other test loaded, so nothing is cached.
  openTab("ENG-99");
  await using screen = await render(<LinearHarness visible={false} />);
  expect(request).not.toHaveBeenCalled();

  await screen.rerender(<LinearHarness visible />);
  await expect.element(screen.getByRole("heading", { name: "ENG-99 wasn't found" })).toBeVisible();
  expect(request).toHaveBeenCalledTimes(1);
  expect(request.mock.calls[0]?.[1]).toEqual({ id: "ENG-99" });
});
