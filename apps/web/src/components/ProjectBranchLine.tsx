import { GitBranchIcon } from "lucide-react";

import { ProjectFavicon, type ProjectFaviconProject } from "./ProjectFavicon";

/** Project icon and name, then the branch. The project name stays whole; a long branch truncates. */
export function ProjectBranchLine({
  project,
  branch,
}: {
  project: ProjectFaviconProject;
  branch: string | null;
}) {
  return (
    <span className="flex h-[1lh] min-w-0 items-center gap-1.5 whitespace-nowrap">
      <ProjectFavicon project={project} className="size-3 shrink-0" />
      <span className="shrink-0">{project.title}</span>
      {branch ? (
        <>
          <span aria-hidden>·</span>
          <GitBranchIcon aria-hidden className="size-3 shrink-0 opacity-70" />
          <span className="min-w-0 truncate">{branch}</span>
        </>
      ) : null}
    </span>
  );
}
