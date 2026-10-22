import { type ComponentProps, useLayoutEffect, useRef } from "react";

import { observeResize } from "~/lib/observeResize";
import { cn } from "~/lib/utils";

/**
 * The narrowest horizontal scale squished text reaches by default. Narrower
 * glyphs stop reading as letters, so past this the text clips instead. The
 * sizer splits text into parts to match (halves here).
 */
export const SQUISH_TEXT_MIN_SCALE = 0.5;

/** For composer controls, which would otherwise drop into an overflow menu. */
export const SQUISH_TEXT_TIGHT_MIN_SCALE = 1 / 3;

// offsetWidth and clientWidth round to whole pixels, and the sizer's runs lose
// kerning at their seams, so a box within a pixel of the text counts as a fit.
const SQUISH_TEXT_FIT_TOLERANCE_PX = 1;

/** The horizontal scale that fits `naturalWidth` of text into `availableWidth`. */
export function resolveSquishScale(
  availableWidth: number,
  naturalWidth: number,
  minScale: number = SQUISH_TEXT_MIN_SCALE,
): number {
  if (naturalWidth <= 0 || availableWidth + SQUISH_TEXT_FIT_TOLERANCE_PX >= naturalWidth) {
    return 1;
  }
  return Math.max(minScale, availableWidth / naturalWidth);
}

/**
 * The unscaled width an ellipsizing SquishText's text box needs so that, at
 * `scale`, it fills `availableWidth` exactly; null when the text fits whole.
 */
export function resolveSquishEllipsisWidth(
  availableWidth: number,
  naturalWidth: number,
  scale: number,
): number | null {
  return naturalWidth * scale > availableWidth + SQUISH_TEXT_FIT_TOLERANCE_PX
    ? availableWidth / scale
    : null;
}

/**
 * Split text in half for the invisible sizer. The sizer may wrap between the
 * halves, so its min-content width is the wider half: about the natural width
 * times SQUISH_TEXT_MIN_SCALE, and never less.
 */
export function splitSquishTextHalves(text: string): [string, string] {
  const [head = "", tail = ""] = splitSquishTextParts(text, 2);
  return [head, tail];
}

/**
 * Split text into `count` runs for the invisible sizer, which may wrap between them, so its
 * min-content width is the widest run: about the natural width divided by `count`.
 */
export function splitSquishTextParts(text: string, count: number): string[] {
  const characters = Array.from(text);
  const size = Math.ceil(characters.length / count);
  return Array.from({ length: count }, (_, index) =>
    characters.slice(index * size, (index + 1) * size).join(""),
  ).filter((part) => part !== "");
}

/**
 * Which label form to show: the first that still reads at the minimum scale, longest first.
 * When none does, the shortest shows and clips.
 */
export function resolveSquishVariant(
  availableWidth: number,
  naturalWidths: readonly number[],
  minScale: number = SQUISH_TEXT_MIN_SCALE,
): number {
  const index = naturalWidths.findIndex(
    (natural) => natural * minScale <= availableWidth + SQUISH_TEXT_FIT_TOLERANCE_PX,
  );
  return index === -1 ? naturalWidths.length - 1 : index;
}

export interface SquishTarget {
  root: HTMLElement;
  /** Holds one text box per label form, longest first. Only the chosen one shows. */
  textBox: HTMLElement;
  /** Holds an invisible full-width copy of each form, present when there is more than one. */
  measureBox?: HTMLElement | null | undefined;
  /** Set for text that squishes only this far, then ends in an ellipsis. */
  ellipsisScale?: number | undefined;
  minScale?: number | undefined;
}

function childElements(element: HTMLElement): HTMLElement[] {
  return Array.from(element.children as HTMLCollectionOf<HTMLElement>);
}

function naturalWidths(target: SquishTarget): number[] {
  if (target.measureBox) {
    return childElements(target.measureBox).map((measure) => measure.offsetWidth);
  }
  // An ellipsizing text box is narrowed below its content, so read the content.
  const text = target.textBox.firstElementChild as HTMLElement | null;
  return [text ? (target.ellipsisScale === undefined ? text.offsetWidth : text.scrollWidth) : 0];
}

/**
 * The narrowest width a SquishText still reads at: its shortest form at the minimum scale, or
 * the widest sizer run of that form when the sizer holds it wider. Layouts that make room for
 * controls should treat this, not the rendered width, as what the label needs. `element` may
 * be the SquishText or contain one.
 */
export function measureSquishTextMinimumWidth(element: HTMLElement): number | null {
  const root = element.matches("[data-squish-text]")
    ? element
    : element.querySelector<HTMLElement>("[data-squish-text]");
  if (!root) return null;
  const textBox = root.querySelector<HTMLElement>("[data-squish-text-box]");
  if (!textBox) return null;
  const measureBox = root.querySelector<HTMLElement>("[data-squish-text-measures]");
  const widths = naturalWidths({ root, textBox, measureBox });
  const runs = Array.from(
    root.querySelectorAll<HTMLElement>("[data-squish-text-run]"),
    (run) => run.offsetWidth,
  );
  const minScale = Number(root.dataset.squishMinScale) || SQUISH_TEXT_MIN_SCALE;
  return Math.max(Math.min(...widths) * minScale, ...runs);
}

const pendingFits = new Set<SquishTarget>();
let fitQueued = false;

// Sidebars render hundreds of these. Resizes from one frame are fitted together after the
// observer delivers them, reading every width before writing any style so the batch lays out
// once. Fitting changes only the text's transform, width and display, never the root's size.
function fitPendingSquishTargets(): void {
  fitQueued = false;
  const fits = Array.from(pendingFits, (target) => {
    const available = target.root.clientWidth;
    const naturals = naturalWidths(target);
    // Shorter forms take over at the usual scale; only the shortest squishes past it.
    const index = resolveSquishVariant(available, naturals);
    const natural = naturals[index] ?? 0;
    if (target.ellipsisScale === undefined) {
      const scale = resolveSquishScale(available, natural, target.minScale);
      return { target, index, scale, width: null };
    }
    const scale = resolveSquishScale(available, natural, target.ellipsisScale);
    return { target, index, scale, width: resolveSquishEllipsisWidth(available, natural, scale) };
  });
  pendingFits.clear();
  for (const { target, index, scale, width } of fits) {
    const texts = childElements(target.textBox);
    texts.forEach((text, textIndex) => {
      if (texts.length > 1) {
        text.style.display = textIndex === index ? "inline-block" : "none";
      }
      if (textIndex !== index) return;
      text.style.transform = scale === 1 ? "" : `scaleX(${scale})`;
      if (target.ellipsisScale !== undefined) {
        text.style.width = width === null ? "" : `${width}px`;
      }
    });
  }
}

/** Keep a SquishText's form and scale fitted until the returned cleanup runs. */
export function observeSquishTarget(target: SquishTarget): () => void {
  // Watches the root for room and the text (or its measured copies) for natural width.
  const firstText = target.textBox.firstElementChild;
  const watched = [target.root, target.measureBox ?? firstText].filter(
    (element): element is Element => element !== null && element !== undefined,
  );
  const stop = observeResize(watched, () => {
    pendingFits.add(target);
    if (fitQueued) return;
    fitQueued = true;
    queueMicrotask(fitPendingSquishTargets);
  });
  return () => {
    stop();
    pendingFits.delete(target);
  };
}

/**
 * Single-line text whose glyphs scale on the x axis down to `minScale` before clipping; its
 * min-content width sits at that scale, so `min-w-min` ancestors can't squeeze it further.
 * `variants` (longest first) take over past the floor; `ellipsisScale` ends in "…" instead.
 */
// Titles squish only this far, where they still read at a glance, then end in "…".
export const THREAD_TITLE_SQUISH_SCALE = 0.8;

export function SquishText({
  children,
  className,
  ellipsisScale,
  minScale = SQUISH_TEXT_MIN_SCALE,
  variants,
  ...props
}: Omit<ComponentProps<"span">, "children" | "ref"> & {
  children: string;
  ellipsisScale?: number;
  minScale?: number;
  variants?: readonly string[] | undefined;
}) {
  const rootRef = useRef<HTMLSpanElement>(null);
  const textBoxRef = useRef<HTMLSpanElement>(null);
  const measureBoxRef = useRef<HTMLSpanElement>(null);
  const forms = [children, ...(variants ?? []).filter((variant) => variant !== children)];
  const formCount = forms.length;

  // Forms are keyed by position, so their boxes stay put while the text changes; the observer
  // re-subscribes only when the number of forms (and so the boxes) changes.
  // oxlint-disable-next-line t3code/react-effect-budget -- observes the element's size to fit the text.
  useLayoutEffect(() => {
    const root = rootRef.current;
    const textBox = textBoxRef.current;
    if (!root || !textBox) return;
    return observeSquishTarget({
      root,
      textBox,
      measureBox: formCount > 1 ? measureBoxRef.current : null,
      ellipsisScale,
      minScale,
    });
  }, [ellipsisScale, minScale, formCount]);

  const runs = splitSquishTextParts(forms.at(-1) ?? children, Math.ceil(1 / minScale));
  return (
    <span
      ref={rootRef}
      data-squish-text=""
      data-squish-min-scale={minScale}
      className={cn("relative inline-grid min-w-0 overflow-hidden", className)}
      {...props}
    >
      {/* Invisible copies that give the box its intrinsic widths: the full text
          at max-content (it may wrap anywhere, so it never sets the minimum),
          and the shortest form's widest run at min-content. Zero height, so
          their wrapped lines never grow the row. */}
      {forms.length > 1 ? (
        <span
          aria-hidden="true"
          className="invisible h-0 select-none break-all whitespace-normal [grid-area:1/1]"
        >
          {children}
        </span>
      ) : null}
      <span
        aria-hidden="true"
        className="invisible h-0 select-none whitespace-normal [grid-area:1/1]"
      >
        {runs.map((run, index) => (
          // oxlint-disable-next-line react/no-array-index-key -- runs are positional slices
          <span key={index}>
            {index > 0 ? <wbr /> : null}
            <span data-squish-text-run="" className="inline-block whitespace-pre">
              {run}
            </span>
          </span>
        ))}
      </span>
      {forms.length > 1 ? (
        <span
          ref={measureBoxRef}
          data-squish-text-measures=""
          aria-hidden="true"
          className="pointer-events-none invisible absolute start-0 top-0 flex w-max select-none flex-col items-start"
        >
          {forms.map((form, index) => (
            // Positional keys keep each form's box stable as its text changes.
            // oxlint-disable-next-line react/no-array-index-key
            <span key={index} className="whitespace-pre">
              {form}
            </span>
          ))}
        </span>
      ) : null}
      {/* Zero width, so the visible text sets the row height without adding
          to the intrinsic widths. It overflows to the right and the root clips
          whatever the minimum scale cannot fit. */}
      <span ref={textBoxRef} data-squish-text-box="" className="w-0 [grid-area:1/1]">
        {forms.map((form, index) => (
          <span
            // oxlint-disable-next-line react/no-array-index-key -- positional, see the effect above
            key={index}
            data-squish-text-content=""
            className={cn(
              "inline-block origin-left whitespace-pre",
              index > 0 && "hidden",
              ellipsisScale !== undefined && "overflow-hidden text-ellipsis align-top",
            )}
          >
            {form}
          </span>
        ))}
      </span>
    </span>
  );
}
