import { cn } from "~/lib/utils";
import { SquishText } from "./ui/squish-text";

/** Matches the label's `max-w-[240px]`. Longer text squishes to fit it. */
export const COMPOSER_CONTEXT_LABEL_MAX_WIDTH_PX = 240;

/**
 * Floor for the controls around a pinned label. The label holds its minimum
 * scale until the strip cannot fit even that, then the floor lifts so the
 * label clips instead of pushing the strip past its edge.
 */
export const COMPOSER_CONTEXT_PINNED_CONTROL_CLASS_NAME =
  "min-w-min group-data-[squeezed]/composer-context:min-w-0";

/**
 * Text label for a composer context strip control. It squishes when the strip
 * is tight (see BranchToolbar). A collapsible label also hides when the strip
 * compacts; the project and branch names stay pinned. Put a collapsible label
 * in a control with `min-w-min`, and a pinned one in a control with
 * COMPOSER_CONTEXT_PINNED_CONTROL_CLASS_NAME, so the strip cannot squeeze it
 * past its minimum scale.
 */
export function ComposerContextLabel({
  children,
  collapsible = false,
}: {
  children: string;
  collapsible?: boolean;
}) {
  return (
    <SquishText
      data-composer-label={collapsible ? "collapsible" : "pinned"}
      className={cn(
        "max-w-[240px]",
        collapsible &&
          "transition-opacity duration-180 ease-[cubic-bezier(0.32,0.72,0,1)] group-data-[compact]/composer-context:max-w-0 group-data-[compact]/composer-context:opacity-0 motion-reduce:transition-none",
      )}
    >
      {children}
    </SquishText>
  );
}
