import { THREAD_SIDEBAR_DEFAULT_WIDTH } from "./components/threadSidebarWidth";
import {
  PREVIEW_PANEL_MIN_WIDTH,
  SIBLING_COLUMN_MIN_WIDTH,
} from "./hooks/usePreviewPanelInlineSize";

// Fork: the right panel stays inline whenever it fits beside the chat column at both minimums,
// and the thread sidebar floats wherever docking it at its default width would break that.
const RIGHT_PANEL_INLINE_MIN_WIDTH = PREVIEW_PANEL_MIN_WIDTH + SIBLING_COLUMN_MIN_WIDTH;
export const RIGHT_PANEL_INLINE_LAYOUT_MEDIA_QUERY = `(max-width: ${RIGHT_PANEL_INLINE_MIN_WIDTH - 1}px)`;
export const THREAD_SIDEBAR_FLOATING_MEDIA_QUERY = `(max-width: ${
  RIGHT_PANEL_INLINE_MIN_WIDTH + THREAD_SIDEBAR_DEFAULT_WIDTH - 1
}px)`;

export type ThreadPanelPresentation = "inline" | "popover";
