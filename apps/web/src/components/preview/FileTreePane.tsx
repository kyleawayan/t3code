import { type CSSProperties, type ReactNode, useLayoutEffect, useRef, useState } from "react";

import { RESIZABLE_WIDTH_PROPERTY, useResizableWidth } from "~/hooks/useResizableWidth";
import { observeResize } from "~/lib/observeResize";
import { cn } from "~/lib/utils";
import { RightPanelResizeHandle } from "./RightPanelResizeHandle";

/** Room kept for the diff or preview column beside the tree. */
const SIBLING_COLUMN_MIN_WIDTH = 240;
/** Above zero so a drag can never leave the tree open but invisible. */
const MIN_WIDTH = 48;

interface Props {
  storageKey: string;
  defaultWidth: number;
  /** Off leaves sizing to `className`, e.g. a tree that fills its row. */
  resizable?: boolean;
  className?: string;
  children: ReactNode;
}

export function FileTreePane({
  storageKey,
  defaultWidth,
  resizable = true,
  className,
  children,
}: Props) {
  const hostRef = useRef<HTMLElement>(null);
  const [maxWidth, setMaxWidth] = useState(Number.POSITIVE_INFINITY);
  // Measured before paint so a saved width never flashes wider than the row allows.
  // oxlint-disable-next-line t3code/react-effect-budget -- observes the row's width.
  useLayoutEffect(() => {
    const row = resizable ? hostRef.current?.parentElement : null;
    if (!row) return;
    const measure = () => {
      setMaxWidth(Math.max(MIN_WIDTH, row.clientWidth - SIBLING_COLUMN_MIN_WIDTH));
    };
    measure();
    return observeResize(row, measure);
  }, [resizable]);
  const { width, handlers } = useResizableWidth({
    storageKey,
    defaultWidth,
    minWidth: MIN_WIDTH,
    maxWidth,
    edge: "left",
  });

  return (
    <aside
      ref={hostRef}
      className={cn("relative flex min-h-0 shrink-0", className)}
      style={
        resizable
          ? ({
              [RESIZABLE_WIDTH_PROPERTY]: `${width}px`,
              width: `var(${RESIZABLE_WIDTH_PROPERTY})`,
            } as CSSProperties)
          : undefined
      }
    >
      {/* A fixed slot, so toggling `resizable` keeps the tree mounted with its expanded folders. */}
      {resizable ? <RightPanelResizeHandle handlers={handlers} /> : null}
      {/* Clips here rather than on the aside, which would cut off the handle's outer half. */}
      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden *:min-w-0">{children}</div>
    </aside>
  );
}
