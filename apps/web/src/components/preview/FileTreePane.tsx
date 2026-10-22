import { type CSSProperties, type ReactNode, useLayoutEffect, useRef, useState } from "react";

import { RESIZABLE_WIDTH_PROPERTY, useResizableWidth } from "~/hooks/useResizableWidth";
import { observeResize } from "~/lib/observeResize";
import { cn } from "~/lib/utils";
import { RightPanelResizeHandle } from "./RightPanelResizeHandle";

/** Room kept for the diff or preview column beside the tree. */
const SIBLING_COLUMN_MIN_WIDTH = 240;

interface Props {
  storageKey: string;
  defaultWidth: number;
  minWidth: number;
  /** Off leaves sizing to `className`, e.g. a tree that fills its row. */
  resizable?: boolean;
  className?: string;
  children: ReactNode;
}

export function FileTreePane({
  storageKey,
  defaultWidth,
  minWidth,
  resizable = true,
  className,
  children,
}: Props) {
  const hostRef = useRef<HTMLElement>(null);
  const [maxWidth, setMaxWidth] = useState(Number.POSITIVE_INFINITY);
  // Measured before paint so a saved width never flashes wider than the row allows.
  useLayoutEffect(() => {
    const row = resizable ? hostRef.current?.parentElement : null;
    if (!row) return;
    const measure = () => {
      setMaxWidth(Math.max(minWidth, row.clientWidth - SIBLING_COLUMN_MIN_WIDTH));
    };
    measure();
    return observeResize(row, measure);
  }, [minWidth, resizable]);
  const { width, handlers } = useResizableWidth({
    storageKey,
    defaultWidth,
    minWidth,
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
      {children}
    </aside>
  );
}
