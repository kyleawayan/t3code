import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

import { act, render } from "../../../test/render";

const state = vi.hoisted(() => ({
  markdown: "",
  addReviewComment: vi.fn(),
}));

// Plain factories: spreading the real modules here deadlocks on their shared imports.
vi.mock(
  import("../../state/entities"),
  () =>
    ({
      useThreadProjection: (() => ({
        projection: {
          turnItems: [{ type: "proposed_plan", planId: "plan-1", markdown: state.markdown }],
          plans: [],
        },
      })) as never,
    }) as never,
);
vi.mock(
  import("../../composerDraftStore"),
  () =>
    ({
      DraftId: {},
      useComposerDraftStore: ((selector: (store: unknown) => unknown) =>
        selector({ addReviewComment: state.addReviewComment })) as never,
    }) as never,
);
// The real renderer pulls in the app's state runtime; this test is about selection and comments.
vi.mock(import("../ChatMarkdown"), () => ({
  default: (({ text }: { text: string }) => (
    <div className="whitespace-pre-wrap">{text}</div>
  )) as never,
}));

import { ProposedPlanPanel } from "./ProposedPlanPanel";

const threadRef = scopeThreadRef(EnvironmentId.make("env-1"), ThreadId.make("thread-1"));

function setup(markdown: string) {
  state.markdown = markdown;
  state.addReviewComment.mockReset();
}

function selectText(text: string) {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const start = node.textContent?.indexOf(text) ?? -1;
    if (start === -1) continue;
    const range = document.createRange();
    range.setStart(node, start);
    range.setEnd(node, start + text.length);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    return;
  }
  throw new Error(`No text node contains ${text}`);
}

describe("ProposedPlanPanel", () => {
  it("adds a comment on the selected passage to the composer", async () => {
    setup("# Ship the widget\n\n1. Add the widget to the toolbar\n2. Write a test");
    // The panel reads no route.
    await using screen = await render(
      <ProposedPlanPanel
        planId="plan-1"
        threadRef={threadRef}
        environmentId={threadRef.environmentId}
        composerDraftTarget={threadRef}
        cwd={undefined}
      />,
      { router: false },
    );
    await expect.element(screen.getByText("Ship the widget")).toBeVisible();

    await act(() => selectText("Write a test"));
    const commentButton = screen.getByRole("button", { name: "Comment" });
    await expect.element(commentButton).toBeVisible();
    await commentButton.click();

    const input = screen.getByRole("textbox", { name: "Comment on the plan" });
    await input.fill("Cover the empty state too");
    await screen.getByRole("button", { name: "Comment", exact: true }).click();

    expect(state.addReviewComment).toHaveBeenCalledExactlyOnceWith(
      threadRef,
      expect.objectContaining({
        sectionTitle: "Proposed plan comment",
        filePath: "Plan: Ship the widget",
        rangeLabel: "L4",
        diff: "2. Write a test",
        text: "Cover the empty state too",
      }),
    );
  });

  it("says when the plan isn't loaded", async () => {
    setup("");
    // The panel reads no route.
    await using screen = await render(
      <ProposedPlanPanel
        planId="plan-1"
        threadRef={threadRef}
        environmentId={threadRef.environmentId}
        composerDraftTarget={threadRef}
        cwd={undefined}
      />,
      { router: false },
    );
    await expect.element(screen.getByText(/This plan isn't loaded/)).toBeVisible();
  });
});
