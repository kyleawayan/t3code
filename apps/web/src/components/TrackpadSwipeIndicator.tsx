import { ArrowLeftIcon } from "lucide-react";
import { useRef } from "react";

import { useTrackpadSwipeNavigation } from "../hooks/useTrackpadSwipeNavigation";

/** Fork: Chrome-style back/forward bubble that follows a two-finger history swipe. */
export function TrackpadSwipeIndicator() {
  const indicator = useRef<HTMLDivElement>(null);
  useTrackpadSwipeNavigation(indicator);
  return (
    <div
      ref={indicator}
      aria-hidden
      className="group pointer-events-none fixed top-1/2 z-50 flex size-32 items-center rounded-full bg-foreground/75 px-5 text-background opacity-0 data-[side=left]:left-0 data-[side=left]:justify-end data-[side=right]:right-0 data-[side=right]:justify-start"
    >
      <ArrowLeftIcon className="size-7 group-data-[side=right]:rotate-180" strokeWidth={3} />
    </div>
  );
}
