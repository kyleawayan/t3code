/**
 * Clears the sidebar toggle that sits at the top left of the window. Important
 * because the surfaces that use it also set their own left padding, and the
 * toggle overlaps native window controls if the smaller one wins.
 */
export const TITLEBAR_CONTROLS_INSET_CLASS = "pl-[var(--workspace-titlebar-content-left)]!";
