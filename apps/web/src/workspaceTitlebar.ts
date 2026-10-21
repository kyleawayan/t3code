/**
 * Clears the native window controls at the top left of the window, which the
 * right-docked sidebar never covers. Important because the surfaces that use it
 * also set their own left padding, and the controls overlap content if the
 * smaller one wins.
 */
export const TITLEBAR_CONTROLS_INSET_CLASS = "pl-[var(--workspace-titlebar-content-left)]!";
