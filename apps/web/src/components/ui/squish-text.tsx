import { type ComponentProps, useLayoutEffect, useRef } from "react";

import { cn } from "~/lib/utils";

/**
 * The narrowest horizontal scale squished text may reach. Narrower glyphs stop
 * reading as letters, so past this the text clips instead. The sizer splits
 * text in half to match; change both together.
 */
export const SQUISH_TEXT_MIN_SCALE = 0.5;

// offsetWidth and clientWidth round to whole pixels, and the sizer's runs lose
// kerning at their seams, so a box within a pixel of the text counts as a fit.
const SQUISH_TEXT_FIT_TOLERANCE_PX = 1;

/** The horizontal scale that fits `naturalWidth` of text into `availableWidth`. */
export function resolveSquishScale(availableWidth: number, naturalWidth: number): number {
  if (naturalWidth <= 0 || availableWidth + SQUISH_TEXT_FIT_TOLERANCE_PX >= naturalWidth) {
    return 1;
  }
  return Math.max(SQUISH_TEXT_MIN_SCALE, availableWidth / naturalWidth);
}

/**
 * Split text in half for the invisible sizer. The sizer may wrap between the
 * halves, so its min-content width is the wider half: about the natural width
 * times SQUISH_TEXT_MIN_SCALE, and never less.
 */
export function splitSquishTextHalves(text: string): [string, string] {
  const characters = Array.from(text);
  const middle = Math.ceil(characters.length / 2);
  return [characters.slice(0, middle).join(""), characters.slice(middle).join("")];
}

export interface SquishTextMeasurement {
  /** Laid-out width of the box the text squishes into. */
  rendered: number;
  /** Width of the text at full scale. */
  natural: number;
  /** The box's min-content width, where the text reaches about its minimum scale. */
  minimum: number;
}

/** Read a SquishText's widths. `element` may be the SquishText or contain one. */
export function measureSquishText(element: HTMLElement): SquishTextMeasurement | null {
  const root = element.matches("[data-squish-text]")
    ? element
    : element.querySelector<HTMLElement>("[data-squish-text]");
  if (!root) return null;
  const text = root.querySelector<HTMLElement>("[data-squish-text-content]");
  if (!text) return null;
  let minimum = 0;
  for (const run of root.querySelectorAll<HTMLElement>("[data-squish-text-run]")) {
    minimum = Math.max(minimum, run.offsetWidth);
  }
  // offsetWidth ignores the transform, so the text reports its natural width.
  return { rendered: root.offsetWidth, natural: text.offsetWidth, minimum };
}

/**
 * Invisible copies of the shorter texts a SquishText may switch to, so a
 * layout can read each one's floor before choosing it. Place it inside the
 * control, which must be positioned, so the copies share the label's font.
 */
export function SquishTextProbe({
  variants,
  ...props
}: Omit<ComponentProps<"span">, "children"> & { variants: readonly string[] }) {
  return (
    <span
      aria-hidden="true"
      data-squish-probe=""
      className="pointer-events-none invisible absolute start-0 top-0 flex w-max select-none flex-col items-start"
      {...props}
    >
      {variants.map((variant, index) => {
        const [head, tail] = splitSquishTextHalves(variant);
        return (
          // Variants are positional: the layout reads them by index.
          // oxlint-disable-next-line react/no-array-index-key
          <span key={index} data-squish-probe-variant="" className="flex">
            <span className="inline-block whitespace-pre">{head}</span>
            <span className="inline-block whitespace-pre">{tail}</span>
          </span>
        );
      })}
    </span>
  );
}

/**
 * The floor of each probed variant: the wider half, which is where a
 * SquishText showing that text stops squishing. An empty variant reads 0.
 */
export function measureSquishTextProbe(probe: HTMLElement): number[] {
  return Array.from(probe.querySelectorAll<HTMLElement>("[data-squish-probe-variant]"), (variant) =>
    Math.max(0, ...Array.from(variant.children, (half) => (half as HTMLElement).offsetWidth)),
  );
}

export interface SquishTarget {
  root: HTMLElement;
  text: HTMLElement;
}

// One observer for every SquishText: sidebars render hundreds, and each
// instance watches two boxes (its root for room, its text for natural width).
const squishTargets = new WeakMap<Element, SquishTarget>();
let squishObserver: ResizeObserver | null = null;

function fitSquishTargets(entries: readonly ResizeObserverEntry[]): void {
  const targets = new Set<SquishTarget>();
  for (const entry of entries) {
    const target = squishTargets.get(entry.target);
    if (target) targets.add(target);
  }
  // Read every width before writing any transform, so one batch lays out once.
  // Written straight to the DOM: a resize never re-renders, and a transform
  // never resizes anything, so the observer cannot feed itself.
  const scales = Array.from(targets, (target) => ({
    target,
    scale: resolveSquishScale(target.root.clientWidth, target.text.offsetWidth),
  }));
  for (const { target, scale } of scales) {
    target.text.style.transform = scale === 1 ? "" : `scaleX(${scale})`;
  }
}

/** Keep a SquishText's scale fitted until the returned cleanup runs. */
export function observeSquishTarget(target: SquishTarget): () => void {
  if (typeof ResizeObserver === "undefined") return () => {};
  squishObserver ??= new ResizeObserver(fitSquishTargets);
  const observer = squishObserver;
  // Observing delivers an initial entry before the next paint, so new text
  // fits without a synchronous layout read per instance.
  for (const element of [target.root, target.text]) {
    squishTargets.set(element, target);
    observer.observe(element);
  }
  return () => {
    for (const element of [target.root, target.text]) {
      observer.unobserve(element);
      squishTargets.delete(element);
    }
  };
}

/**
 * Single-line text that squishes horizontally instead of truncating.
 *
 * It lays out at the text's natural width and shrinks like any flex item.
 * Given less room, the glyphs scale on the x axis down to
 * SQUISH_TEXT_MIN_SCALE, then clip. Its min-content width sits at that
 * minimum scale, so an ancestor with `min-w-min` (or the default flex minimum)
 * cannot squeeze it any further. An ancestor with `min-w-0` can, and the text
 * clips.
 */
export function SquishText({
  children,
  className,
  ...props
}: Omit<ComponentProps<"span">, "children" | "ref"> & { children: string }) {
  const rootRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const text = textRef.current;
    if (!root || !text) return;
    return observeSquishTarget({ root, text });
  }, []);

  const [head, tail] = splitSquishTextHalves(children);
  return (
    <span
      ref={rootRef}
      data-squish-text=""
      className={cn("inline-grid min-w-0 overflow-hidden", className)}
      {...props}
    >
      {/* Invisible copy that gives the box its intrinsic widths: the full text
          at max-content, the wider half at min-content. Zero height, so its
          wrapped second line never grows the row. */}
      <span
        aria-hidden="true"
        className="invisible h-0 select-none whitespace-normal [grid-area:1/1]"
      >
        <span data-squish-text-run="" className="inline-block whitespace-pre">
          {head}
        </span>
        <wbr />
        <span data-squish-text-run="" className="inline-block whitespace-pre">
          {tail}
        </span>
      </span>
      {/* Zero width, so the visible text sets the row height without adding
          to the intrinsic widths. It overflows to the right and the root clips
          whatever the minimum scale cannot fit. */}
      <span className="w-0 [grid-area:1/1]">
        <span
          ref={textRef}
          data-squish-text-content=""
          className="inline-block origin-left whitespace-pre"
        >
          {children}
        </span>
      </span>
    </span>
  );
}
