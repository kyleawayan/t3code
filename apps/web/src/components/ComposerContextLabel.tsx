import type { ReactNode } from "react";

import { cn } from "../lib/utils";
import { THREAD_DETAILS_PANEL_LABEL_CLASS } from "./chat/threadDetailsPanelStyles";
import { SquishText } from "./SquishText";

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
          : "max-w-[240px] group-data-[compact]/composer-context:max-w-0",
      )}
    >
      <span
        data-composer-label-motion
        className={cn(
          "block w-full min-w-0 truncate",
          displayMode === "panel" && THREAD_DETAILS_PANEL_LABEL_CLASS,
          displayMode === "toolbar" &&
            "max-w-[240px] transition-opacity duration-180 ease-drawer group-data-[compact]/composer-context:opacity-0 motion-reduce:transition-none",
        )}
      >
        {/* In the toolbar, a long name squishes to fit before it clips. */}
        {displayMode === "toolbar" && typeof children === "string" ? (
          <SquishText className="w-full">{children}</SquishText>
        ) : (
          children
        )}
      </span>
    </span>
  );
}
