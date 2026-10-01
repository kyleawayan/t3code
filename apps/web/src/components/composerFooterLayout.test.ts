import { describe, expect, it } from "vite-plus/test";

import { resolveContextStripLabelsCompact, resolveContextStripLayout } from "./BranchToolbar.logic";
import {
  COMPOSER_FOOTER_COMPACT_BREAKPOINT_PX,
  COMPOSER_FOOTER_WIDE_ACTIONS_COMPACT_BREAKPOINT_PX,
  COMPOSER_RESTING_EXPANSION_MIN_PX,
  composerFooterLabelVariant,
  getRestingComposerImagePreviewCounts,
  isComposerFooterControlInActions,
  resolveComposerFooterControlsWidth,
  resolveComposerFooterLabelStage,
  resolveComposerFooterStageFloor,
  resolveComposerTimelineInset,
  resolveScrollToEndClearance,
  resolveRestingComposerControlsLayout,
  resolveRestingComposerControlsMinimumWidth,
  resolveRestingComposerControlsNaturalWidth,
  shouldAnimateComposerRestingTransition,
  shouldUseCompactComposerPrimaryActions,
  shouldUseCompactComposerFooter,
  shouldUseRestingComposerLayout,
} from "./composerFooterLayout";

describe("getRestingComposerImagePreviewCounts", () => {
  it("shows at most three thumbnails and counts the remainder", () => {
    expect(getRestingComposerImagePreviewCounts(0)).toEqual({
      visibleCount: 0,
      overflowCount: 0,
    });
    expect(getRestingComposerImagePreviewCounts(3)).toEqual({
      visibleCount: 3,
      overflowCount: 0,
    });
    expect(getRestingComposerImagePreviewCounts(7)).toEqual({
      visibleCount: 3,
      overflowCount: 4,
    });
  });
});

describe("shouldUseCompactComposerFooter", () => {
  it("stays expanded without a measured width", () => {
    expect(shouldUseCompactComposerFooter(null)).toBe(false);
  });

  it("switches to compact mode below the breakpoint", () => {
    expect(shouldUseCompactComposerFooter(COMPOSER_FOOTER_COMPACT_BREAKPOINT_PX - 1)).toBe(true);
  });

  it("stays expanded at and above the breakpoint", () => {
    expect(shouldUseCompactComposerFooter(COMPOSER_FOOTER_COMPACT_BREAKPOINT_PX)).toBe(false);
    expect(shouldUseCompactComposerFooter(COMPOSER_FOOTER_COMPACT_BREAKPOINT_PX + 48)).toBe(false);
  });

  it("uses a higher breakpoint for wide action states", () => {
    expect(
      shouldUseCompactComposerFooter(COMPOSER_FOOTER_WIDE_ACTIONS_COMPACT_BREAKPOINT_PX - 1, {
        hasWideActions: true,
      }),
    ).toBe(true);
    expect(
      shouldUseCompactComposerFooter(COMPOSER_FOOTER_WIDE_ACTIONS_COMPACT_BREAKPOINT_PX, {
        hasWideActions: true,
      }),
    ).toBe(false);
  });
});

describe("shouldUseCompactComposerPrimaryActions", () => {
  it("matches the wide footer breakpoint", () => {
    expect(
      shouldUseCompactComposerPrimaryActions(
        COMPOSER_FOOTER_WIDE_ACTIONS_COMPACT_BREAKPOINT_PX - 1,
        { hasWideActions: true },
      ),
    ).toBe(true);
    expect(
      shouldUseCompactComposerPrimaryActions(COMPOSER_FOOTER_WIDE_ACTIONS_COMPACT_BREAKPOINT_PX, {
        hasWideActions: true,
      }),
    ).toBe(false);
  });
});

describe("resolveComposerTimelineInset", () => {
  it("follows the expanded overlay height", () => {
    expect(
      resolveComposerTimelineInset({ currentInset: 160, overlayHeight: 140, isResting: false }),
    ).toBe(140);
  });

  it("keeps a larger expanded reservation while resting", () => {
    expect(
      resolveComposerTimelineInset({ currentInset: 200, overlayHeight: 60, isResting: true }),
    ).toBe(200);
  });

  it("reserves the empty expansion when no larger height is known", () => {
    expect(
      resolveComposerTimelineInset({ currentInset: 0, overlayHeight: 60, isResting: true }),
    ).toBe(60 + COMPOSER_RESTING_EXPANSION_MIN_PX);
  });
});

describe("shouldUseRestingComposerLayout", () => {
  const resting = {
    isExistingThread: true,
    isMobileViewport: false,
    isScrollCollapsed: true,
    hasExpandedChrome: false,
    hasMultilinePrompt: false,
    timelineOverflows: true,
  };

  it("uses the resting layout after a timeline scroll", () => {
    expect(shouldUseRestingComposerLayout(resting)).toBe(true);
  });

  it("keeps the composer expanded until the timeline is scrolled", () => {
    expect(shouldUseRestingComposerLayout({ ...resting, isScrollCollapsed: false })).toBe(false);
  });

  it("keeps the composer expanded while the timeline fits above it", () => {
    expect(shouldUseRestingComposerLayout({ ...resting, timelineOverflows: false })).toBe(false);
  });

  it("keeps new-thread composers expanded", () => {
    expect(shouldUseRestingComposerLayout({ ...resting, isExistingThread: false })).toBe(false);
  });

  it("leaves responsive mobile on its existing collapse path", () => {
    expect(shouldUseRestingComposerLayout({ ...resting, isMobileViewport: true })).toBe(false);
  });

  it("keeps drawers and composer-owned menus expanded", () => {
    expect(shouldUseRestingComposerLayout({ ...resting, hasExpandedChrome: true })).toBe(false);
  });

  it.each([false, true])(
    "keeps multiline drafts expanded when scroll collapsed is %s",
    (isScrollCollapsed) => {
      expect(
        shouldUseRestingComposerLayout({
          ...resting,
          hasMultilinePrompt: true,
          isScrollCollapsed,
        }),
      ).toBe(false);
    },
  );
});

describe("shouldAnimateComposerRestingTransition", () => {
  it("does not animate layout measurements that settle during initial mount", () => {
    expect(
      shouldAnimateComposerRestingTransition({
        hasCompletedInitialLayout: false,
        stateChanged: true,
        hasInterruptedAnimation: false,
      }),
    ).toBe(false);
  });

  it("animates later resting-state changes and interrupted transitions", () => {
    expect(
      shouldAnimateComposerRestingTransition({
        hasCompletedInitialLayout: true,
        stateChanged: true,
        hasInterruptedAnimation: false,
      }),
    ).toBe(true);
    expect(
      shouldAnimateComposerRestingTransition({
        hasCompletedInitialLayout: true,
        stateChanged: false,
        hasInterruptedAnimation: true,
      }),
    ).toBe(true);
  });
});

describe("resolveRestingComposerControlsLayout", () => {
  // Picker 140 natural / 96 minimum, plus a 9px separator. Traits 60,
  // mode 140, overflow 24, gap 4.
  const base = {
    gap: 4,
    naturalFixedWidth: 149,
    minimumFixedWidth: 105,
    blockWidths: [60, 140],
    overflowWidth: 24,
  };

  it("shows everything when the host has room", () => {
    // 149 + 60 + 140 + 4 * 2 = 357
    expect(resolveRestingComposerControlsLayout({ ...base, hostWidth: 357 })).toEqual({
      hiddenCount: 0,
      visible: true,
    });
  });

  it("moves trailing blocks into the overflow menu until the rest fits", () => {
    // 149 + 60 + 24 + 4 * 2 = 241
    expect(resolveRestingComposerControlsLayout({ ...base, hostWidth: 356 })).toEqual({
      hiddenCount: 1,
      visible: true,
    });
    expect(resolveRestingComposerControlsLayout({ ...base, hostWidth: 241 })).toEqual({
      hiddenCount: 1,
      visible: true,
    });
    // 149 + 24 + 4 = 177
    expect(resolveRestingComposerControlsLayout({ ...base, hostWidth: 240 })).toEqual({
      hiddenCount: 2,
      visible: true,
    });
  });

  it("shrinks the picker after moving every trailing block into overflow", () => {
    expect(resolveRestingComposerControlsLayout({ ...base, hostWidth: 176 })).toEqual({
      hiddenCount: 2,
      visible: true,
    });
    // 105 + 24 + 4 = 133
    expect(resolveRestingComposerControlsLayout({ ...base, hostWidth: 133 })).toEqual({
      hiddenCount: 2,
      visible: true,
    });
  });

  it("hides the whole cluster below the picker's minimum readable width", () => {
    expect(resolveRestingComposerControlsLayout({ ...base, hostWidth: 132 })).toEqual({
      hiddenCount: 2,
      visible: false,
    });
    expect(resolveRestingComposerControlsLayout({ ...base, hostWidth: 0 })).toEqual({
      hiddenCount: 2,
      visible: false,
    });
  });

  it("uses the same thresholds while shrinking and growing", () => {
    expect(resolveRestingComposerControlsLayout({ ...base, hostWidth: 240 })).toEqual({
      hiddenCount: 2,
      visible: true,
    });
    expect(resolveRestingComposerControlsLayout({ ...base, hostWidth: 241 })).toEqual({
      hiddenCount: 1,
      visible: true,
    });
  });

  it("supports a single leading control without overflow blocks", () => {
    expect(
      resolveRestingComposerControlsLayout({
        ...base,
        naturalFixedWidth: 140,
        minimumFixedWidth: 140,
        blockWidths: [],
        overflowWidth: 0,
        hostWidth: 139,
      }),
    ).toEqual({ hiddenCount: 0, visible: false });
  });
});

describe("context strip labels and resting composer controls", () => {
  // Widths captured from a desktop renderer that crashed with React error
  // 185. The strip is 724px wide. Its expanded labels need 327px, and the
  // rest of its chrome needs 125px. The composer controls sit in the host
  // that takes whatever is left.
  const stripWidth = 724;
  const labelWidth = 327;
  const chromeWidth = 125;
  const measurement = {
    gap: 4,
    naturalFixedWidth: 96.3828125 + 5 + 4,
    minimumFixedWidth: 52 + 5 + 4,
    blockWidths: [130.6953125, 119.671875],
    overflowWidth: 28,
  };
  const naturalWidth = resolveRestingComposerControlsNaturalWidth(measurement);

  function hostWidth(compact: boolean): number {
    return stripWidth - chromeWidth - (compact ? 0 : labelWidth);
  }

  it("squishes the labels so the full controls fit, and settles there", () => {
    // Squished to their minimum scale the labels need 164px: 64 for the
    // workspace label and 100 for the branch name.
    const stripLayout = (labelsRenderedWidth: number) =>
      resolveContextStripLayout({
        compact: false,
        availableWidth: stripWidth,
        contentWidth: chromeWidth + labelsRenderedWidth,
        labelsRenderedWidth,
        collapsibleLabelsMinimumWidth: 64,
        pinnedLabelsMinimumWidth: 100,
        hostNaturalWidth: naturalWidth,
        hostMinimumWidth: resolveRestingComposerControlsMinimumWidth(measurement),
      });

    // Natural labels leave the controls too little, so the host reserves
    // their natural width (plus the pixel of slack) and the labels squish.
    const first = stripLayout(labelWidth);
    expect(first).toEqual({ compact: false, squeezed: false, hostReserveWidth: 365 });
    const layout = resolveRestingComposerControlsLayout({
      ...measurement,
      hostWidth: first.hostReserveWidth,
    });
    expect(layout).toEqual({ hiddenCount: 0, visible: true });

    // The next pass sees the squished labels and lands on the same answer.
    const squishedLabelWidth = stripWidth - chromeWidth - first.hostReserveWidth;
    expect(stripLayout(squishedLabelWidth)).toEqual(first);
    expect(
      resolveRestingComposerControlsLayout({
        ...measurement,
        hostWidth: first.hostReserveWidth,
        previous: { hiddenCount: 1, visible: true },
      }),
    ).toEqual(layout);
  });

  it("does not settle when the strip only reserves the visible controls", () => {
    // Regression guard for the alternating layout. Reserving only the
    // controls left visible after two blocks moved into overflow makes the
    // strip expand its labels, which shrinks the host below what the full
    // controls need, which hides the blocks again.
    const hiddenControlsWidth = 137;
    const expands = !resolveContextStripLabelsCompact({
      compact: true,
      neededWidth: chromeWidth + labelWidth + hiddenControlsWidth,
      availableWidth: stripWidth,
    });
    expect(expands).toBe(true);
    expect(
      resolveRestingComposerControlsLayout({ ...measurement, hostWidth: hostWidth(false) }),
    ).toEqual({ hiddenCount: 2, visible: true });
  });
});

describe("resolveRestingComposerControlsLayout hysteresis", () => {
  // Same cluster as above: picker 140 natural / 96 minimum plus a 9px
  // separator, traits 60, mode 140, overflow 24, gap 4.
  const base = {
    gap: 4,
    naturalFixedWidth: 149,
    minimumFixedWidth: 105,
    blockWidths: [60, 140],
    overflowWidth: 24,
  };

  it("keeps a block in overflow when re-showing it would leave no slack", () => {
    // 149 + 60 + 140 + 4 * 2 = 357 fills the host exactly.
    expect(
      resolveRestingComposerControlsLayout({
        ...base,
        hostWidth: 357,
        previous: { hiddenCount: 1, visible: true },
      }),
    ).toEqual({ hiddenCount: 1, visible: true });
  });

  it("re-shows a block once the host clears the slack margin", () => {
    expect(
      resolveRestingComposerControlsLayout({
        ...base,
        hostWidth: 358,
        previous: { hiddenCount: 1, visible: true },
      }),
    ).toEqual({ hiddenCount: 0, visible: true });
  });

  it("restores the blocks that fit when the full cluster has no slack", () => {
    const partlyRestored = resolveRestingComposerControlsLayout({
      ...base,
      hostWidth: 357,
      previous: { hiddenCount: 2, visible: true },
    });
    expect(partlyRestored).toEqual({ hiddenCount: 1, visible: true });
    expect(
      resolveRestingComposerControlsLayout({ ...base, hostWidth: 357, previous: partlyRestored }),
    ).toEqual(partlyRestored);
    expect(
      resolveRestingComposerControlsLayout({ ...base, hostWidth: 358, previous: partlyRestored }),
    ).toEqual({ hiddenCount: 0, visible: true });
  });

  it("requires slack before partially restoring a cluster", () => {
    // One inline block, the picker, and overflow need 149 + 60 + 24 + 8 = 241px.
    const previous = { hiddenCount: 2, visible: true };
    expect(resolveRestingComposerControlsLayout({ ...base, hostWidth: 241, previous })).toEqual(
      previous,
    );
    expect(resolveRestingComposerControlsLayout({ ...base, hostWidth: 242, previous })).toEqual({
      hiddenCount: 1,
      visible: true,
    });
  });

  it("still resolves from scratch when there is no previous layout", () => {
    expect(resolveRestingComposerControlsLayout({ ...base, hostWidth: 357 })).toEqual({
      hiddenCount: 0,
      visible: true,
    });
  });

  it("settles when the measured picker width jitters below a pixel", () => {
    // Regression guard for React error #185 ("Maximum update depth
    // exceeded"). The composer re-measures on every render, so the picker's
    // recovered natural width can land a fraction of a pixel apart between
    // renders. Without hysteresis that flips hiddenCount forever.
    let layout = { hiddenCount: 0, visible: true };
    const settled: string[] = [];
    for (let index = 0; index < 10; index += 1) {
      layout = resolveRestingComposerControlsLayout({
        ...base,
        // The picker's recovered natural width lands a half pixel apart
        // between renders.
        naturalFixedWidth: index % 2 === 0 ? 149 : 149.5,
        hostWidth: 357,
        previous: layout,
      });
      if (index >= 2) settled.push(`${layout.hiddenCount}:${layout.visible}`);
    }
    expect(new Set(settled).size).toBe(1);
  });

  it("keeps the cluster hidden until its minimum width clears the slack", () => {
    // 105 + 24 + 4 = 133 is the exact minimum for the hidden cluster.
    expect(
      resolveRestingComposerControlsLayout({
        ...base,
        hostWidth: 133,
        previous: { hiddenCount: 2, visible: false },
      }),
    ).toEqual({ hiddenCount: 2, visible: false });
    expect(
      resolveRestingComposerControlsLayout({
        ...base,
        hostWidth: 134,
        previous: { hiddenCount: 2, visible: false },
      }),
    ).toEqual({ hiddenCount: 2, visible: true });
  });
});

describe("resolveScrollToEndClearance", () => {
  it("removes the side tab gap in both composer states while clearing overlapping attachments", () => {
    for (const overlayHeight of [120, 214]) {
      const layout = {
        overlayHeight,
        mainSurfaceTop: 534,
        button: { left: 340, right: 460 },
        attachments: [{ top: 500, left: 600, right: 700 }],
      };
      expect(resolveScrollToEndClearance(layout)).toBe(overlayHeight - 34);
      expect(resolveScrollToEndClearance({ ...layout, attachments: [] })).toBe(overlayHeight);
      expect(
        resolveScrollToEndClearance({
          ...layout,
          attachments: [...layout.attachments, { top: 500, left: 100, right: 700 }],
        }),
      ).toBe(overlayHeight);
      expect(resolveScrollToEndClearance({ ...layout, button: { left: 590, right: 710 } })).toBe(
        overlayHeight,
      );
    }
  });
});

describe("resolveComposerFooterLabelStage", () => {
  // A narrow expanded footer. Each label control is its chrome plus a 4px gap
  // and the floor of the variant it shows:
  //   model   30 chrome; "Claude Opus 5.5" 52, "Opus 5.5" 30
  //   traits  10 chrome; "Extra High · 1M" 48, "XHigh·1M" 30, "XH·1M" 22, "XH" 16
  //   mode    30 chrome; "Auto" 14, icon only
  // plus the 28px plan toggle and 4px row gaps. A control at its narrowest moves
  // into the actions and costs the 8px actions gap instead of a row gap. The
  // stages need 236, 222, 204, 182, 174, and 172px.
  function controls(rendered: { model?: number; mode?: number } = {}) {
    const model = rendered.model ?? 100;
    const mode = rendered.mode ?? 28;
    return [
      {
        width: 34 + model,
        label: { control: "model" as const, rendered: model, gap: 4, floors: [52, 30] },
      },
      {
        width: 109,
        label: { control: "traits" as const, rendered: 95, gap: 4, floors: [48, 30, 22, 16] },
      },
      {
        width: mode > 0 ? 34 + mode : 30,
        label: { control: "mode" as const, rendered: mode, gap: 4, floors: [14, 0] },
      },
      { width: 28 },
    ];
  }
  const stageAt = (
    availableWidth: number,
    stage = 0,
    rendered: { model?: number; mode?: number } = {},
  ) =>
    resolveComposerFooterLabelStage({
      stage,
      availableWidth,
      gap: 4,
      actionsGap: 8,
      controls: controls(rendered),
    });

  it("keeps every full label while it fits squished to its floor", () => {
    expect(stageAt(240)).toBe(0);
  });

  it("turns the runtime mode into an icon among the actions before shortening text", () => {
    const stage = stageAt(230);
    expect(stage).toBe(1);
    expect(isComposerFooterControlInActions("mode", stage)).toBe(true);
    expect(composerFooterLabelVariant("traits", stage)).toBe(0);
    expect(composerFooterLabelVariant("model", stage)).toBe(0);
  });

  it("shortens the effort, then the model, then tightens the effort", () => {
    expect(composerFooterLabelVariant("traits", stageAt(210))).toBe(1);
    expect(composerFooterLabelVariant("model", stageAt(210))).toBe(0);
    expect(composerFooterLabelVariant("model", stageAt(190))).toBe(1);
    expect(composerFooterLabelVariant("traits", stageAt(190))).toBe(1);
    expect(composerFooterLabelVariant("traits", stageAt(180))).toBe(2);
  });

  it("moves the effort icon into the actions last", () => {
    const stage = stageAt(173);
    expect(stage).toBe(5);
    expect(isComposerFooterControlInActions("traits", stage)).toBe(true);
    expect(composerFooterLabelVariant("model", stage)).toBe(1);
  });

  it("lets the row scroll rather than squeeze a label past its floor", () => {
    // Even the last stage needs 172px. The labels keep their floors, so
    // "Opus 5.5" never loses its ".5".
    expect(stageAt(150)).toBe(5);
  });

  it("gives the same answer however the labels are showing now", () => {
    for (const rendered of [{ model: 52 }, { model: 75, mode: 0 }, { mode: 14 }]) {
      expect(stageAt(240, 0, rendered)).toBe(0);
      expect(stageAt(230, 0, rendered)).toBe(1);
      expect(stageAt(190, 0, rendered)).toBe(3);
    }
  });

  it("needs a few pixels of room before a longer variant comes back", () => {
    expect(stageAt(238, 1)).toBe(1);
    expect(stageAt(240, 1)).toBe(0);
  });

  it("does nothing without label variants to switch", () => {
    expect(
      resolveComposerFooterLabelStage({
        stage: 0,
        availableWidth: 10,
        gap: 4,
        actionsGap: 8,
        controls: [{ width: 28 }],
      }),
    ).toBe(0);
  });
});

describe("composer footer at the narrowest chat column", () => {
  // Beside an inline side panel the chat column stops at 360px (the preview
  // panel's sibling minimum). The composer keeps 20px each side, so its
  // footer holds 320 - 2 * 16 = 288px, and a 320px phone leaves 272px. The
  // gap before the actions is 6px. Chevrons hide at this width. A running
  // turn's actions (attach, spinner, stop) take 110px; idle ones 68px.
  //   model   30 chrome; "Claude Opus 5.5" 52, "Opus 5.5" 30
  //   traits  14 chrome; "Extra High · 1M" 52, "XHigh·1M" 34, "XH·1M" 24, icon 16
  //   mode    30 chrome; "Auto" 16, icon only
  const measurement = {
    gap: 4,
    actionsGap: 8,
    controls: [
      { width: 134, label: { control: "model" as const, rendered: 100, gap: 4, floors: [52, 30] } },
      {
        width: 118,
        label: { control: "traits" as const, rendered: 100, gap: 4, floors: [52, 34, 24, 16] },
      },
      { width: 64, label: { control: "mode" as const, rendered: 30, gap: 4, floors: [16, 0] } },
    ],
  };
  function fit(footerWidth: number, actionsWidth: number) {
    const availableWidth = footerWidth - 6 - actionsWidth;
    const stage = resolveComposerFooterLabelStage({ ...measurement, stage: 0, availableWidth });
    return {
      stage,
      fits: resolveComposerFooterControlsWidth(measurement, stage) <= availableWidth,
    };
  }

  it("keeps the model, effort, and mode visible on the desktop minimum while running", () => {
    const { stage, fits } = fit(288, 110);
    expect(fits).toBe(true);
    expect(composerFooterLabelVariant("model", stage)).toBe(1);
    expect(composerFooterLabelVariant("traits", stage)).toBe(1);
    expect(isComposerFooterControlInActions("mode", stage)).toBe(true);
  });

  it("keeps full model and effort labels on the desktop minimum when idle", () => {
    const { stage, fits } = fit(288, 68);
    expect(fits).toBe(true);
    expect(composerFooterLabelVariant("model", stage)).toBe(0);
    expect(composerFooterLabelVariant("traits", stage)).toBe(0);
  });

  it("tightens the effort but keeps its context window on a phone while running", () => {
    const { stage, fits } = fit(272, 110);
    expect(fits).toBe(true);
    expect(composerFooterLabelVariant("traits", stage)).toBe(2);
    expect(isComposerFooterControlInActions("mode", stage)).toBe(true);
  });

  it("moves the effort icon into the actions when even its tightest label will not fit", () => {
    // A few pixels narrower than the phone: 262px.
    const { stage, fits } = fit(262, 110);
    expect(fits).toBe(true);
    expect(isComposerFooterControlInActions("traits", stage)).toBe(true);
    expect(isComposerFooterControlInActions("mode", stage)).toBe(true);
    expect(composerFooterLabelVariant("model", stage)).toBe(1);
  });
});

describe("composer footer while answering a question", () => {
  // A 430px composer leaves a 398px footer. Answering a question while the
  // turn runs, the actions hold attach (28), the context meter (24), stop
  // (28), and Submit (64) with 8px gaps: 168px before any label control joins
  // them. Chevrons show at this width.
  //   model   48 chrome; "GPT-6.1-Sol" 38 (no brand to drop)
  //   traits  44 chrome with the fast icon; "Extra High · 1M" 52, "XHigh·1M" 34,
  //           "XH·1M" 24, icon 16
  //   mode    48 chrome; "Auto" 16, icon only
  const measurement = {
    gap: 4,
    actionsGap: 8,
    controls: [
      { width: 90, label: { control: "model" as const, rendered: 38, gap: 4, floors: [38, 38] } },
      {
        width: 148,
        label: { control: "traits" as const, rendered: 100, gap: 4, floors: [52, 34, 24, 16] },
      },
      { width: 68, label: { control: "mode" as const, rendered: 16, gap: 4, floors: [16, 0] } },
    ],
  };

  it("tightens the effort instead of letting Submit push it out of the row", () => {
    const availableWidth = 398 - 6 - 168;
    const stage = resolveComposerFooterLabelStage({ ...measurement, stage: 0, availableWidth });
    expect(composerFooterLabelVariant("traits", stage)).toBeGreaterThanOrEqual(2);
    expect(isComposerFooterControlInActions("mode", stage)).toBe(true);
    expect(resolveComposerFooterControlsWidth(measurement, stage)).toBeLessThanOrEqual(
      availableWidth,
    );
  });
});

describe("resolveComposerFooterStageFloor", () => {
  const base = { floor: null, measuredStage: 2, currentStage: 2, rowWidth: 200 };

  it("steps past a stage the row overflows at though the measurement said it fits", () => {
    expect(resolveComposerFooterStageFloor({ ...base, overflows: true })).toEqual({
      stage: 3,
      rowWidth: 200,
    });
  });

  it("ignores overflow from a stage that has not rendered yet", () => {
    expect(
      resolveComposerFooterStageFloor({ ...base, measuredStage: 3, overflows: true }),
    ).toBeNull();
  });

  it("holds until the row grows well past where it overflowed", () => {
    const floor = { stage: 3, rowWidth: 200 };
    const held = { ...base, floor, currentStage: 3, overflows: false };
    expect(resolveComposerFooterStageFloor({ ...held, rowWidth: 220 })).toEqual(floor);
    expect(resolveComposerFooterStageFloor({ ...held, rowWidth: 230 })).toBeNull();
  });

  it("has nowhere to go past the last stage", () => {
    expect(
      resolveComposerFooterStageFloor({
        ...base,
        measuredStage: 5,
        currentStage: 5,
        overflows: true,
      }),
    ).toBeNull();
  });
});
