import { Link2 } from "lucide-react";

import { LinearStatusIcon } from "./LinearIcons";
import { useLinearIssueStore } from "./linearIssueStore";
import { startedStateFractions } from "./linearModel";
import { linearSurfaceIssue, type LinearSurface } from "./linearSurface";

/** The tab strip's title: the issue on screen. */
export function linearTabTitle(surface: LinearSurface): string {
  return linearSurfaceIssue(surface) || "Linear search";
}

/** The tab strip's icon: the status of the issue on screen, once loaded. */
export function LinearTabIcon(props: { readonly surface: LinearSurface }) {
  const issue = useLinearIssueStore(
    (state) => state.entries[linearSurfaceIssue(props.surface)]?.issue,
  );
  return issue ? (
    <LinearStatusIcon
      state={issue.state}
      fraction={startedStateFractions(issue.team.states.nodes).get(issue.state.name)}
      className="size-3"
    />
  ) : (
    <Link2 aria-hidden="true" className="size-3 shrink-0" />
  );
}

/** The surface launchers' icon for "Linear issue": a half-filled status glyph. */
function LinearLauncherIcon(props: { readonly className?: string }) {
  return (
    <LinearStatusIcon
      state={{ type: "started", color: "currentColor", name: "Linear issue" }}
      fraction={0.5}
      {...(props.className ? { className: props.className } : {})}
    />
  );
}

/** Fork: Linear tab. The "Linear issue" entry for both surface launchers, when offered. */
export function linearLauncherActions(onAddLinear: (() => void) | undefined) {
  return onAddLinear
    ? [
        {
          label: "Linear issue",
          icon: LinearLauncherIcon,
          shortcut: "I",
          available: true,
          disabledReason: "",
          onClick: onAddLinear,
        },
      ]
    : [];
}
