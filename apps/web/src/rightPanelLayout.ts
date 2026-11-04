import {
  PREVIEW_PANEL_MIN_WIDTH,
  SIBLING_COLUMN_MIN_WIDTH,
} from "./hooks/usePreviewPanelInlineSize";

// Fork: the right panel stays inline whenever it fits beside the chat column at both minimums.
const RIGHT_PANEL_INLINE_MIN_WIDTH = PREVIEW_PANEL_MIN_WIDTH + SIBLING_COLUMN_MIN_WIDTH;
export const RIGHT_PANEL_INLINE_LAYOUT_MEDIA_QUERY = `(max-width: ${RIGHT_PANEL_INLINE_MIN_WIDTH - 1}px)`;

export type ThreadPanelPresentation = "inline" | "popover";
