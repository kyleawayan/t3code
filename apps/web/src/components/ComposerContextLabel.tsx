import type { ReactNode } from "react";

import { cn } from "../lib/utils";
import { THREAD_DETAILS_PANEL_LABEL_CLASS } from "./chat/threadDetailsPanelStyles";
import { SQUISH_TEXT_MIN_SCALE, SquishText } from "./SquishText";

export function ComposerContextLabel({
  children,
  displayMode = "toolbar",
}: {
  children: ReactNode;
  displayMode?: "toolbar" | "panel";
}) {
  return (
    <span
      data-composer-label
      className={cn(
        "min-w-0",
        displayMode === "panel"
          ? "flex-1 overflow-x-clip overflow-y-visible text-left"
          : "max-w-[240px]",
      )}
    >
      <span
        data-composer-label-motion
        className={cn(
          "block w-full min-w-0 truncate",
          displayMode === "panel" && THREAD_DETAILS_PANEL_LABEL_CLASS,
          displayMode === "toolbar" && "max-w-[240px]",
        )}
      >
        {/* In the toolbar, a long name squishes to fit, then ends in "…". */}
        {displayMode === "toolbar" && typeof children === "string" ? (
          <SquishText ellipsisScale={SQUISH_TEXT_MIN_SCALE} className="w-full">
            {children}
          </SquishText>
        ) : (
          children
        )}
      </span>
    </span>
  );
}
