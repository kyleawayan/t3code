export const COMPOSER_FOOTER_COMPACT_BREAKPOINT_PX = 620;
export const COMPOSER_FOOTER_WIDE_ACTIONS_COMPACT_BREAKPOINT_PX = 780;
const RESTING_COMPOSER_IMAGE_THUMBNAIL_LIMIT = 3;

export function getRestingComposerImagePreviewCounts(imageCount: number): {
  visibleCount: number;
  overflowCount: number;
} {
  const visibleCount = Math.min(imageCount, RESTING_COMPOSER_IMAGE_THUMBNAIL_LIMIT);
  return {
    visibleCount,
    overflowCount: Math.max(0, imageCount - visibleCount),
  };
}

export function shouldUseCompactComposerFooter(
  width: number | null,
  options?: { hasWideActions?: boolean },
): boolean {
  const breakpoint = options?.hasWideActions
    ? COMPOSER_FOOTER_WIDE_ACTIONS_COMPACT_BREAKPOINT_PX
    : COMPOSER_FOOTER_COMPACT_BREAKPOINT_PX;
  return width !== null && width < breakpoint;
}

export function shouldUseRestingComposerLayout(input: {
  isExistingThread: boolean;
  isMobileViewport: boolean;
  isScrollCollapsed: boolean;
  hasExpandedChrome: boolean;
  hasMultilinePrompt: boolean;
  /** Whether the timeline has more content than fits above the composer. */
  timelineOverflows: boolean;
}): boolean {
  // Multiline drafts stay readable. Resting only clamps a single prompt
  // line and overlays its actions; non-image attachment and context
  // rows keep their natural height above it while image previews move inline.
  // Banners and the tasks badge dock above the surface, so they are absent
  // too. Whether the context strip can host the relocated controls is
  // deliberately absent here: resting reclaims vertical space at every
  // desktop width, and where the strip is missing or too narrow the controls
  // simply return when the composer is focused.
  //
  // Only a timeline scroll rests the composer: the user asked for it with the
  // gesture, and it lifts on the next composer interaction. Losing focus never
  // rests it, so clicking a message, copying output, or selecting text for a
  // citation leaves the composer where it was.
  //
  // Resting exists to give reading space back to the timeline. A thread that
  // fits above the composer has nothing to reclaim, so it stays expanded and
  // never shows the collapsed row that a fresh thread would otherwise open on.
  return (
    input.isExistingThread &&
    !input.isMobileViewport &&
    input.timelineOverflows &&
    input.isScrollCollapsed &&
    !input.hasMultilinePrompt &&
    !input.hasExpandedChrome
  );
}

/**
 * How much taller the empty expanded composer is than its resting row on
 * desktop widths, from the layout classes in ChatComposer: the body loses
 * 8px of top padding, the prompt clamps from min-h-17.5 (70px) to 32px, and
 * the 48px footer leaves flow.
 */
export const COMPOSER_RESTING_EXPANSION_MIN_PX = 94;

/**
 * The space the timeline reserves at its end for the composer overlay.
 *
 * The overlay is measured live, but a resting composer is much shorter than
 * an expanded one. Reserving only the resting height lets a scroll to the end
 * land flush against the short composer, and the expansion that follows then
 * covers the last rows because the timeline never moves for footer growth.
 * While resting, the reservation keeps the last expanded height, or at least
 * the resting height plus the empty expansion, so expanding again changes
 * nothing above the composer. An expanded measurement is authoritative and
 * may shrink it.
 */
export function resolveComposerTimelineInset(input: {
  currentInset: number;
  overlayHeight: number;
  isResting: boolean;
}): number {
  return input.isResting
    ? Math.max(input.currentInset, input.overlayHeight + COMPOSER_RESTING_EXPANSION_MIN_PX)
    : input.overlayHeight;
}

export function shouldAnimateComposerRestingTransition(input: {
  hasCompletedInitialLayout: boolean;
  stateChanged: boolean;
  hasInterruptedAnimation: boolean;
}): boolean {
  return input.hasCompletedInitialLayout && (input.stateChanged || input.hasInterruptedAnimation);
}

export function shouldUseCompactComposerPrimaryActions(
  width: number | null,
  options?: { hasWideActions?: boolean },
): boolean {
  if (!options?.hasWideActions) {
    return false;
  }
  return width !== null && width < COMPOSER_FOOTER_WIDE_ACTIONS_COMPACT_BREAKPOINT_PX;
}

export interface RestingComposerControlsMeasurement {
  gap: number;
  naturalFixedWidth: number;
  minimumFixedWidth: number;
  blockWidths: readonly number[];
  overflowWidth: number;
}

function restingComposerControlsWidth(
  input: RestingComposerControlsMeasurement,
  hiddenCount: number,
  fixedWidth = input.naturalFixedWidth,
): number {
  const { blockWidths, gap } = input;
  const visibleCount = blockWidths.length - hiddenCount;
  return (
    fixedWidth +
    blockWidths.slice(0, visibleCount).reduce((sum, width) => sum + width, 0) +
    (hiddenCount > 0 ? input.overflowWidth : 0) +
    gap * (visibleCount + (hiddenCount > 0 ? 1 : 0))
  );
}

/**
 * The width the resting controls take with nothing moved into overflow.
 *
 * The context strip squishes its labels to reserve up to this much for the
 * composer. Judging against the currently visible controls instead lets the
 * strip widen its labels into space the composer just gave up, which shrinks
 * the host, hides the controls again, and repeats.
 */
export function resolveRestingComposerControlsNaturalWidth(
  input: RestingComposerControlsMeasurement,
): number {
  return restingComposerControlsWidth(input, 0);
}

/**
 * The narrowest width at which the resting controls still show: every block
 * in overflow and the model picker at its minimum. The context strip collapses
 * its labels before leaving the host less than this.
 */
export function resolveRestingComposerControlsMinimumWidth(
  input: RestingComposerControlsMeasurement,
): number {
  return restingComposerControlsWidth(input, input.blockWidths.length, input.minimumFixedWidth);
}

/**
 * Decide how many trailing resting control blocks move into the overflow
 * menu, and whether the cluster can show at all, from natural widths.
 *
 * Trailing blocks hide before the model picker shrinks. Once they are all in
 * the overflow menu, the picker may contract to its minimum readable width;
 * below that the whole cluster hides rather than clipping.
 */
const RESTING_CONTROLS_SLACK_PX = 1;

export function resolveRestingComposerControlsLayout(
  input: RestingComposerControlsMeasurement & {
    hostWidth: number;
    previous?: { hiddenCount: number; visible: boolean };
  },
): { hiddenCount: number; visible: boolean } {
  const { blockWidths, hostWidth, previous } = input;
  let hiddenCount = 0;
  while (
    hiddenCount < blockWidths.length &&
    restingComposerControlsWidth(input, hiddenCount) > hostWidth
  ) {
    hiddenCount += 1;
  }
  // Growing the overflow menu is unconditional, or the controls would clip.
  // Shrinking it has to earn a pixel of slack first: the picker is flexible,
  // so its natural width is recovered from a truncated label whose
  // scrollWidth is integral while the rendered box is fractional. The
  // composer re-measures on every render, so without that margin a host
  // sitting exactly on a threshold flips a block in and out until React
  // gives up with "Maximum update depth exceeded".
  if (previous) {
    const previousHiddenCount = Math.min(previous.hiddenCount, blockWidths.length);
    while (
      hiddenCount < previousHiddenCount &&
      restingComposerControlsWidth(input, hiddenCount) > hostWidth - RESTING_CONTROLS_SLACK_PX
    ) {
      hiddenCount += 1;
    }
  }
  const minimumWidth = restingComposerControlsWidth(input, hiddenCount, input.minimumFixedWidth);
  const visible =
    previous && !previous.visible
      ? minimumWidth <= hostWidth - RESTING_CONTROLS_SLACK_PX
      : minimumWidth <= hostWidth;
  return { hiddenCount, visible };
}

export type ComposerFooterLabelControl = "model" | "traits" | "mode";

/**
 * The steps footer labels take as the footer narrows, each switching one
 * control to its next variant: the runtime mode goes icon-only, the effort
 * shortens, the model drops its brand prefix, the effort tightens, only the
 * effort level shows, and finally the model drops its brand even before a
 * version ("GPT-5.5" → "5.5"). Every variant still squishes to its floor but
 * never clips.
 */
const COMPOSER_FOOTER_LABEL_GIVE_WAY: ReadonlyArray<
  readonly [control: ComposerFooterLabelControl, variant: number]
> = [
  ["mode", 1],
  ["traits", 1],
  ["model", 1],
  ["traits", 2],
  ["traits", 3],
  ["model", 2],
];

/** The last give-way stage; past it the row may only scroll. */
export const COMPOSER_FOOTER_LAST_LABEL_STAGE = COMPOSER_FOOTER_LABEL_GIVE_WAY.length;

/**
 * The narrowest variant of each control that has one: the runtime mode's icon
 * and the effort level alone. These move out of the scrolling row into the
 * fixed actions, where the row's last-resort scroll can never carry them out
 * of view.
 */
export const COMPOSER_FOOTER_ACTIONS_VARIANT: Partial<Record<ComposerFooterLabelControl, number>> =
  { mode: 1, traits: 3 };

/** Which variant a control shows at a give-way stage; 0 is the full label. */
export function composerFooterLabelVariant(
  control: ComposerFooterLabelControl,
  stage: number,
): number {
  let variant = 0;
  for (const [stepControl, stepVariant] of COMPOSER_FOOTER_LABEL_GIVE_WAY.slice(0, stage)) {
    if (stepControl === control) variant = Math.max(variant, stepVariant);
  }
  return variant;
}

/** Whether a control sits among the fixed actions at a give-way stage. */
export function isComposerFooterControlInActions(
  control: ComposerFooterLabelControl,
  stage: number,
): boolean {
  return composerFooterLabelVariant(control, stage) === COMPOSER_FOOTER_ACTIONS_VARIANT[control];
}

export interface ComposerFooterControlWidths {
  /** Laid-out width, inline margins included. */
  width: number;
  /** Present on a control whose label has shorter variants. */
  label?: {
    control: ComposerFooterLabelControl;
    /** The label (or the icon standing in for it) as laid out now; 0 when absent. */
    rendered: number;
    /** The flex gap the label adds beside its siblings. */
    gap: number;
    /** Each variant's floor, in give-way order. 0 means nothing in the label's place. */
    floors: readonly number[];
  };
}

export interface ComposerFooterControlsMeasurement {
  gap: number;
  actionsGap: number;
  controls: ReadonlyArray<ComposerFooterControlWidths>;
}

// Rounding moves each control's measured chrome by a pixel as its label
// squishes, so a longer variant needs a margin before it comes back.
const FOOTER_LABEL_STAGE_HYSTERESIS_PX = 4;

/**
 * The width the footer's controls take from the row at a give-way stage, with
 * labels at their floor. A control in the actions costs its own width plus the
 * actions gap instead of a place in the row.
 */
export function resolveComposerFooterControlsWidth(
  input: ComposerFooterControlsMeasurement,
  stage: number,
): number {
  let width = 0;
  let rowCount = 0;
  for (const control of input.controls) {
    const { label } = control;
    if (!label) {
      width += control.width;
      rowCount += 1;
      continue;
    }
    const chrome = control.width - (label.rendered > 0 ? label.rendered + label.gap : 0);
    const floor = label.floors[composerFooterLabelVariant(label.control, stage)] ?? 0;
    width += chrome + (floor > 0 ? label.gap + floor : 0);
    if (isComposerFooterControlInActions(label.control, stage)) {
      width += input.actionsGap;
    } else {
      rowCount += 1;
    }
  }
  return width + input.gap * Math.max(0, rowCount - 1);
}

/**
 * The fewest give-way steps that fit every footer control with its labels at
 * their floor. Past the last step the row scrolls, which beats clipping a
 * label mid-text into something that reads like another model.
 *
 * `controls` holds the row's controls plus any sitting among the actions now,
 * and `availableWidth` the row's room plus what those take from the actions
 * today. Built from each control's chrome and its variants' floors, never from
 * how squished the labels are now or where a control sits, so a switch cannot
 * flip the answer.
 */
export function resolveComposerFooterLabelStage(
  input: ComposerFooterControlsMeasurement & { stage: number; availableWidth: number },
): number {
  if (!input.controls.some((control) => control.label)) return 0;
  for (let stage = 0; stage < COMPOSER_FOOTER_LAST_LABEL_STAGE; stage += 1) {
    const slack = stage < input.stage ? FOOTER_LABEL_STAGE_HYSTERESIS_PX : 0;
    if (resolveComposerFooterControlsWidth(input, stage) <= input.availableWidth - slack) {
      return stage;
    }
  }
  return COMPOSER_FOOTER_LAST_LABEL_STAGE;
}

/**
 * A floor under the measured stage, for when the row overflows at a stage the
 * measurement said fits (something in the footer it does not model, like a
 * wide answer button arriving mid-layout). The floor moves one stage on, and
 * holds until the row grows well past the width it overflowed at.
 */
export function resolveComposerFooterStageFloor(input: {
  floor: { stage: number; rowWidth: number } | null;
  measuredStage: number;
  currentStage: number;
  rowWidth: number;
  overflows: boolean;
}): { stage: number; rowWidth: number } | null {
  const floor =
    input.floor && input.rowWidth <= input.floor.rowWidth + FOOTER_STAGE_FLOOR_RELEASE_PX
      ? input.floor
      : null;
  // Overflow before the measured stage renders is the old stage's, not news.
  if (
    input.overflows &&
    input.measuredStage <= input.currentStage &&
    input.currentStage < COMPOSER_FOOTER_LAST_LABEL_STAGE
  ) {
    return { stage: input.currentStage + 1, rowWidth: input.rowWidth };
  }
  return floor;
}

// How far the row must grow past where it overflowed before the floor lifts.
const FOOTER_STAGE_FLOOR_RELEASE_PX = 24;

export function resolveScrollToEndClearance(input: {
  overlayHeight: number;
  mainSurfaceTop: number;
  button: { left: number; right: number };
  attachments: ReadonlyArray<{ top: number; left: number; right: number }>;
}): number {
  let contentTop = input.mainSurfaceTop;
  let top = contentTop;
  for (const attachment of input.attachments) {
    contentTop = Math.min(contentTop, attachment.top);
    if (attachment.left < input.button.right && attachment.right > input.button.left) {
      top = Math.min(top, attachment.top);
    }
  }
  return Math.ceil(input.overlayHeight - (top - contentTop));
}
