import { useEffect } from "react";

const MOUSE_BACK_BUTTON = 3;
const MOUSE_FORWARD_BUTTON = 4;

/**
 * Fork: a mouse's side buttons arrive as buttons 3 (back) and 4 (forward). Browsers already
 * navigate on them, so this runs only in the desktop app, where Electron doesn't.
 */
export function useMouseNavigationButtons(): void {
  useEffect(() => {
    if (window.desktopBridge === undefined) return;
    const onMouseUp = (event: MouseEvent) => {
      if (event.defaultPrevented) return;
      if (event.button !== MOUSE_BACK_BUTTON && event.button !== MOUSE_FORWARD_BUTTON) return;
      event.preventDefault();
      if (event.button === MOUSE_BACK_BUTTON) window.history.back();
      else window.history.forward();
    };
    window.addEventListener("mouseup", onMouseUp);
    return () => window.removeEventListener("mouseup", onMouseUp);
  }, []);
}
