import type {
  ComposerFooterControlWidths,
  RestingComposerControlsMeasurement,
} from "../composerFooterLayout";
import { measureSquishText, measureSquishTextProbe } from "../ui/squish-text";

function elementOuterWidth(element: HTMLElement): number {
  const width = element.getBoundingClientRect().width;
  if (width === 0) return 0;
  const style = getComputedStyle(element);
  return (
    width +
    (Number.parseFloat(style.marginInlineStart) || 0) +
    (Number.parseFloat(style.marginInlineEnd) || 0)
  );
}

function elementInlineMarginWidth(element: HTMLElement): number {
  const style = getComputedStyle(element);
  return (
    (Number.parseFloat(style.marginInlineStart) || 0) +
    (Number.parseFloat(style.marginInlineEnd) || 0)
  );
}

/**
 * The picker's natural and minimum widths. Its label is the one part that
 * flexes, so swap the label's rendered width for its full width and for the
 * width it squishes down to.
 */
function providerModelPickerWidths(picker: HTMLElement): { natural: number; minimum: number } {
  const renderedWidth = picker.getBoundingClientRect().width;
  if (renderedWidth === 0) return { natural: 0, minimum: 0 };
  const style = getComputedStyle(picker);
  const label = picker.querySelector<HTMLElement>('[data-chat-provider-model-picker-label="true"]');
  const text = label ? measureSquishText(label) : null;
  const chromeWidth = text ? renderedWidth - text.rendered : renderedWidth;
  const maxWidth = Number.parseFloat(style.maxWidth);
  const naturalWidth = Math.min(
    chromeWidth + (text?.natural ?? 0),
    Number.isFinite(maxWidth) ? maxWidth : Number.POSITIVE_INFINITY,
  );
  // A length min-width can hold the picker wider than its squished label
  // needs; min-content and auto parse to NaN and defer to the label.
  const minWidth = Number.parseFloat(style.minWidth) || 0;
  const minimumWidth = Math.min(
    naturalWidth,
    Math.max(minWidth, chromeWidth + (text?.minimum ?? 0)),
  );
  const marginWidth = elementInlineMarginWidth(picker);
  return { natural: naturalWidth + marginWidth, minimum: minimumWidth + marginWidth };
}

/**
 * Read the natural widths of the resting composer controls from the DOM.
 *
 * Both the composer (deciding which blocks move into overflow) and the
 * context strip (deciding how far its labels squish) read the same numbers,
 * so neither decision depends on what the other one hid last render.
 *
 * Hidden blocks and the unused overflow trigger stay mounted out of flow at
 * full size. The picker is the one flexible item: its intended and minimum
 * widths are recovered from its squished label.
 */
export function measureRestingComposerControls(
  controls: HTMLElement,
): RestingComposerControlsMeasurement | null {
  const gap = Number.parseFloat(getComputedStyle(controls).columnGap) || 0;
  const picker = controls.querySelector<HTMLElement>("[data-chat-provider-model-picker]");
  const leadingControl =
    picker ?? controls.querySelector<HTMLElement>('[data-chat-provider-unavailable="true"]');
  if (!leadingControl) return null;
  // Separators are display:none on phone widths; a hidden one takes no gap.
  const separator = controls.querySelector<HTMLElement>("[data-resting-controls-separator]");
  const separatorWidth = separator ? elementOuterWidth(separator) : 0;
  const overflow = controls.querySelector<HTMLElement>("[data-resting-controls-overflow]");
  const separatorAndGapWidth = separatorWidth > 0 ? separatorWidth + gap : 0;
  const blocks = Array.from(controls.querySelectorAll<HTMLElement>("[data-resting-block]"));
  const leadingWidths = picker
    ? providerModelPickerWidths(picker)
    : { natural: elementOuterWidth(leadingControl), minimum: elementOuterWidth(leadingControl) };
  return {
    gap,
    naturalFixedWidth: leadingWidths.natural + separatorAndGapWidth,
    minimumFixedWidth: leadingWidths.minimum + separatorAndGapWidth,
    blockWidths: blocks.map(elementOuterWidth),
    overflowWidth: overflow ? elementOuterWidth(overflow) : 0,
  };
}

function measureComposerFooterControl(
  element: HTMLElement,
  style: CSSStyleDeclaration,
): ComposerFooterControlWidths {
  const control: ComposerFooterControlWidths = {
    width: element.offsetWidth + elementInlineMarginWidth(element),
  };
  const probe = element.querySelector<HTMLElement>("[data-composer-footer-label]");
  const labelControl = probe?.dataset.composerFooterLabel;
  if (probe && (labelControl === "model" || labelControl === "traits" || labelControl === "mode")) {
    // Fixed content standing in for the label marks itself as the label's slot.
    const label =
      element.querySelector<HTMLElement>("[data-composer-footer-label-slot]") ??
      element.querySelector<HTMLElement>("[data-squish-text]");
    control.label = {
      control: labelControl,
      rendered: label?.offsetWidth ?? 0,
      gap: Number.parseFloat(style.columnGap) || 0,
      floors: measureSquishTextProbe(probe),
    };
  }
  return control;
}

/**
 * Read the expanded footer for resolveComposerFooterLabelStage: each in-flow
 * control in the scrolling row, plus any label control sitting among the fixed
 * actions. The room those take there counts as the row's.
 */
export function measureComposerFooterControls(
  row: HTMLElement,
  actions: HTMLElement | null,
): {
  availableWidth: number;
  gap: number;
  actionsGap: number;
  controls: ComposerFooterControlWidths[];
} {
  const style = getComputedStyle(row);
  const controls: ComposerFooterControlWidths[] = [];
  for (const child of row.children) {
    const element = child as HTMLElement;
    if (element.offsetWidth === 0) continue;
    const elementStyle = getComputedStyle(element);
    if (elementStyle.position === "absolute" || elementStyle.position === "fixed") continue;
    controls.push(measureComposerFooterControl(element, elementStyle));
  }
  const actionsGap = actions ? Number.parseFloat(getComputedStyle(actions).columnGap) || 0 : 0;
  let availableWidth =
    row.clientWidth -
    (Number.parseFloat(style.paddingInlineStart) || 0) -
    (Number.parseFloat(style.paddingInlineEnd) || 0);
  for (const child of actions?.children ?? []) {
    if (!child.querySelector("[data-composer-footer-label]")) continue;
    const element = child as HTMLElement;
    const control = measureComposerFooterControl(element, getComputedStyle(element));
    controls.push(control);
    availableWidth += control.width + actionsGap;
  }
  return { availableWidth, gap: Number.parseFloat(style.columnGap) || 0, actionsGap, controls };
}
