import { createContext, use, type CSSProperties } from "react";

import { cn } from "~/lib/utils";

import { brightenForDark } from "./linearModel";
import type { LinearState, LinearUser } from "./linearTypes";

/** Started-state fill fractions for the issue on screen; see `startedStateFractions`. */
export const LinearStateFractionsContext = createContext<ReadonlyMap<string, number>>(new Map());

/** A pie from 12 o'clock, clockwise, inside a 14×14 box. */
function piePath(fraction: number, radius: number): string {
  const angle = 2 * Math.PI * Math.min(Math.max(fraction, 0), 0.9999);
  const x = 7 + radius * Math.sin(angle);
  const y = 7 - radius * Math.cos(angle);
  return `M7 7 L7 ${7 - radius} A${radius} ${radius} 0 ${angle > Math.PI ? 1 : 0} 1 ${x.toFixed(3)} ${y.toFixed(3)} Z`;
}

/** Linear's status glyphs: dashed, empty, part-filled, or filled with a check or a cross. */
export function LinearStatusIcon(props: {
  readonly state: Pick<LinearState, "type" | "color" | "name">;
  readonly fraction?: number | undefined;
  readonly className?: string;
}) {
  const fractions = use(LinearStateFractionsContext);
  const { type, color, name } = props.state;
  const ring = { fill: "none", stroke: "currentColor", strokeWidth: 1.5 } as const;
  let glyph;
  if (type === "completed" || type === "canceled" || type === "duplicate") {
    glyph = (
      <>
        <circle cx="7" cy="7" r="7" fill="currentColor" />
        <path
          d={type === "completed" ? "M4.3 7.2 6.2 9 9.8 5.3" : "M4.9 4.9 9.1 9.1M9.1 4.9 4.9 9.1"}
          className="stroke-background"
          fill="none"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </>
    );
  } else if (type === "started") {
    glyph = (
      <>
        <circle cx="7" cy="7" r="6" {...ring} />
        <path d={piePath(props.fraction ?? fractions.get(name) ?? 0.5, 3.5)} fill="currentColor" />
      </>
    );
  } else if (type === "backlog" || type === "triage") {
    glyph = <circle cx="7" cy="7" r="6" {...ring} strokeDasharray="1.4 1.74" />;
  } else {
    glyph = <circle cx="7" cy="7" r="6" {...ring} />;
  }
  return (
    <svg
      viewBox="0 0 14 14"
      role="img"
      aria-label={name}
      className={cn(
        "size-3.5 shrink-0 text-(--state-color) dark:text-(--state-color-dark)",
        props.className,
      )}
      style={
        { "--state-color": color, "--state-color-dark": brightenForDark(color) } as CSSProperties
      }
    >
      {glyph}
    </svg>
  );
}

// Lit bars per priority: High 3, Medium 2, Low 1.
const LIT_BARS: Readonly<Record<number, number>> = { 2: 3, 3: 2, 4: 1 };

/** Linear's priority glyphs: dashes for none, a filled "!" square for urgent, else rising bars. */
export function LinearPriorityIcon(props: {
  readonly priority: number;
  readonly className?: string;
}) {
  const className = cn("size-3.5 shrink-0", props.className);
  if (props.priority === 1) {
    return (
      // Linear's urgent orange; no theme token matches it.
      <svg
        viewBox="0 0 14 14"
        aria-hidden="true"
        className={className}
        style={{ color: "#fc7840" }}
      >
        <rect x="1.25" y="1.25" width="11.5" height="11.5" rx="2.5" fill="currentColor" />
        <path
          d="M7 3.9v3.9"
          className="stroke-background"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <circle cx="7" cy="10" r="0.95" className="fill-background" />
      </svg>
    );
  }
  const lit = LIT_BARS[props.priority];
  if (lit === undefined) {
    return (
      <svg
        viewBox="0 0 14 14"
        aria-hidden="true"
        className={cn(className, "text-muted-foreground")}
      >
        <path
          d="M1.5 7h2.4M5.8 7h2.4M10.1 7h2.4"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 14 14" aria-hidden="true" className={cn(className, "text-muted-foreground")}>
      {[7.5, 4.75, 2].map((top, index) => (
        <rect
          key={top}
          x={1.5 + index * 4}
          y={top}
          width="2.75"
          height={12.5 - top}
          rx="0.9"
          fill="currentColor"
          opacity={index < lit ? 1 : 0.35}
        />
      ))}
    </svg>
  );
}

/** A steady color per name, for users Linear sent without their own avatar color. */
function fallbackAvatarColor(name: string): string {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return `hsl(${hash % 360} 45% 45%)`;
}

export function LinearAvatar(props: {
  readonly user: Pick<LinearUser, "displayName" | "avatarUrl" | "avatarBackgroundColor"> | null;
  readonly className?: string;
}) {
  const name = props.user?.displayName ?? "";
  const className = cn("size-4 shrink-0 rounded-full", props.className);
  if (props.user?.avatarUrl) {
    return (
      <img
        src={props.user.avatarUrl}
        alt=""
        aria-hidden="true"
        referrerPolicy="no-referrer"
        className={cn(className, "object-cover")}
      />
    );
  }
  if (name === "") {
    return (
      <span
        aria-hidden="true"
        className={cn(className, "border border-dashed border-muted-foreground/50")}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={cn(
        className,
        "inline-flex items-center justify-center text-4xs font-medium text-white uppercase",
      )}
      style={{ backgroundColor: props.user?.avatarBackgroundColor || fallbackAvatarColor(name) }}
    >
      {name.slice(0, 1)}
    </span>
  );
}

/** Linear's mark, for changes Linear made itself rather than a person. */
export function LinearLogo(props: { readonly className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={cn("size-4 shrink-0 text-foreground/80", props.className)}
    >
      <path
        fill="currentColor"
        d="M2.886 4.18A11.982 11.982 0 0 1 11.99 0C18.624 0 24 5.376 24 12.009c0 3.64-1.62 6.903-4.18 9.105L2.887 4.18ZM1.817 5.626l16.556 16.556c-.524.33-1.075.62-1.65.866L.951 7.277c.247-.575.537-1.126.866-1.65ZM.322 9.163l14.515 14.515c-.71.172-1.443.282-2.195.322L0 11.358a12 12 0 0 1 .322-2.195Zm-.17 4.862 9.823 9.824a12.02 12.02 0 0 1-9.824-9.824Z"
      />
    </svg>
  );
}

export function LinearColorDot(props: { readonly color: string; readonly className?: string }) {
  const style: CSSProperties = { backgroundColor: props.color };
  return (
    <span
      aria-hidden="true"
      className={cn("size-2 shrink-0 rounded-full", props.className)}
      style={style}
    />
  );
}

// Linear's ring, measured from its SVG: the done arc starts 14° past the top, two 24.5° gaps
// split it from the track, and the two share what is left. Even 0 done shows a 4° dot.
const RING_ARC_START = 14 / 360;
const RING_GAP = 24.5 / 360;
const RING_SHARED = 1 - 2 * RING_GAP;
const RING_MIN_ARC = 4 / 360;

/**
 * Linear's progress ring: the done share clockwise from the top, the rest as a light gray track,
 * with a gap at each seam. The track mixes the text color into the page, so it stays light in
 * high-contrast themes, where the muted color is black and would hide the arc.
 */
export function LinearProgressRing(props: {
  readonly done: number;
  readonly total: number;
  readonly className?: string;
}) {
  const radius = 5.25;
  const circumference = 2 * Math.PI * radius;
  const fraction = props.total === 0 ? 0 : Math.min(props.done / props.total, 1);
  const arc = Math.max(RING_MIN_ARC, fraction * RING_SHARED);
  // Dash lengths and offsets in the ring's own length, from the top (the svg turns -90°).
  const segment = (start: number, length: number) => ({
    strokeDasharray: `${length * circumference} ${circumference}`,
    strokeDashoffset: -start * circumference,
  });
  return (
    <svg
      viewBox="0 0 14 14"
      aria-hidden="true"
      className={cn("size-3.5 shrink-0 -rotate-90 text-primary", props.className)}
    >
      {fraction < 1 ? (
        <circle
          cx="7"
          cy="7"
          r={radius}
          fill="none"
          style={{ stroke: "color-mix(in srgb, var(--foreground) 15%, var(--background))" }}
          strokeWidth="1.5"
          {...segment(RING_ARC_START + arc + RING_GAP, RING_SHARED - arc)}
        />
      ) : null}
      <circle
        cx="7"
        cy="7"
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        {...(fraction < 1 ? segment(RING_ARC_START, arc) : {})}
      />
    </svg>
  );
}

/** Blocked by another issue: a filled disc with a bar, like a no-entry sign. */
export function LinearBlockedIcon(props: { readonly className?: string }) {
  return (
    <svg
      viewBox="0 0 14 14"
      aria-hidden="true"
      className={cn("size-3.5 shrink-0 text-destructive", props.className)}
    >
      <circle cx="7" cy="7" r="6.5" fill="currentColor" />
      <path d="M4.2 7h5.6" className="stroke-background" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/** Blocking other issues: an issue card with a no-entry badge on its corner. */
export function LinearBlockingIcon(props: { readonly className?: string }) {
  return (
    <svg
      viewBox="0 0 14 14"
      aria-hidden="true"
      className={cn("size-3.5 shrink-0 text-destructive", props.className)}
    >
      <path
        d="M7.5 12.25H3.5a1.75 1.75 0 0 1-1.75-1.75v-7A1.75 1.75 0 0 1 3.5 1.75h7a1.75 1.75 0 0 1 1.75 1.75V7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <circle cx="10.75" cy="10.75" r="3" fill="currentColor" />
      <path
        d="M9.4 10.75h2.7"
        className="stroke-background"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Linear's estimate glyph: a triangle with its left half filled. */
export function LinearEstimateIcon(props: { readonly className?: string }) {
  return (
    <svg
      viewBox="0 0 14 14"
      aria-hidden="true"
      className={cn("size-3.5 shrink-0 text-muted-foreground", props.className)}
    >
      <path
        d="M7 1.75 12.6 11.5a.6.6 0 0 1-.52.9H1.92a.6.6 0 0 1-.52-.9Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path d="M7 1.75v10.65H1.92a.6.6 0 0 1-.52-.9Z" fill="currentColor" />
    </svg>
  );
}

/** Linear's milestone glyph: a rounded diamond, taller than wide (its progress arc left out). */
export function LinearMilestoneIcon(props: { readonly className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className={cn("size-3.5 shrink-0 text-muted-foreground", props.className)}
    >
      <path
        d="M7.3406 2.32C7.68741 1.89333 8.31259 1.89333 8.6594 2.32L12.7903 7.402C13.0699 7.74597 13.0699 8.25403 12.7903 8.598L8.6594 13.68C8.31259 14.1067 7.68741 14.1067 7.3406 13.68L3.2097 8.598C2.9301 8.25403 2.9301 7.74597 3.2097 7.402L7.3406 2.32Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}
