import type { CSSProperties } from "react";

export const PIERRE_TREE_UNSAFE_CSS = `
  :host {
    --trees-bg-override: transparent;
    --trees-selected-bg-override: color-mix(in srgb, currentColor 12%, transparent);
    --trees-hover-bg-override: color-mix(in srgb, currentColor 7%, transparent);
    --trees-border-color-override: color-mix(in srgb, currentColor 14%, transparent);
    --trees-font-family-override: var(--font-sans);
    --trees-font-size-override: 0.75rem;
  }
  [data-truncate-content='visible'] { overflow: hidden; text-overflow: ellipsis; }
  [data-truncate-marker] { display: none; }
  /* The head's ellipsis already marks the cut; a second one on the tail read "p……he". */
  [data-truncate-group-container='middle'] [data-truncate-container='fruncate']
    [data-truncate-content='visible'] {
    text-overflow: clip;
  }
  [data-item-section='content'] > * { transform-origin: left center; }
  /* The name cell takes the row's free space, so its width is the room a name has; the
     squish fit reads it without first undoing an earlier fit. */
  [data-item-section='content'] { flex: 1 1 0; }
  [data-item-section='decoration'] { flex: 0 1 auto; }
  /* Pierre shows indent guides only while the tree is hovered. */
  [data-item-section='spacing-item'] { opacity: 0.75; }
  /* Git status letters squish to half width, like names do: a bold M was the widest thing in
     a narrow tree. The cell narrows with them and the centered letter overflows it evenly. */
  [data-item-section='git'] { width: 0.45em; margin-left: -2px; overflow: visible; }
  /* An empty decoration slot still costs a row gap between the name and its status. */
  [data-item-section='decoration']:empty { display: none; }
  [data-item-section='git'] > span[title^='Git status'] {
    display: inline-block;
    flex: none;
    transform: scaleX(0.5);
  }
  :host { container-type: inline-size; }
  /* A narrow tree gives names the room: tight gutters, no empty git lane, and about 6px
     of indent a level, which the always-on guides keep readable. */
  @container (max-width: 240px) {
    [data-file-tree-virtualized-scroll='true'] {
      --trees-padding-inline: 2px;
      --trees-item-padding-x: 3px;
      --trees-item-margin-x: 0px;
      --trees-item-row-gap: 3px;
      --trees-level-gap: 2px;
      scrollbar-gutter: auto;
    }
    [data-item-section='spacing'] { padding-left: 3px; }
    [data-item-section='spacing-item'] + [data-item-section='spacing-item'] { margin-left: 4px; }
    [data-item-section='git']:empty { display: none; }
  }
  button[data-type='item'], button[data-type='item']::before { border-radius: var(--radius-md); }
  svg[data-icon-name='t3-tree-icon-loading'] { opacity: 0.6; }
  @media (prefers-reduced-motion: no-preference) {
    svg[data-icon-name='t3-tree-icon-loading'] { animation: t3-tree-spin 1s linear infinite; }
  }
  @keyframes t3-tree-spin { to { transform: rotate(360deg); } }
`;

export function pierreTreeStyle(colorScheme: "light" | "dark"): CSSProperties {
  return {
    colorScheme,
    ["--trees-fg-override" as string]: "var(--contrast-foreground)",
  };
}
