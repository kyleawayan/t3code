import type { EnvironmentId, ScopedThreadRef } from "@t3tools/contracts";
import { ChevronRight } from "lucide-react";

import ChatMarkdown from "~/components/ChatMarkdown";

import { segmentMarkdown } from "./linearModel";

export function LinearMarkdown(props: {
  readonly text: string;
  readonly threadRef: ScopedThreadRef;
  readonly environmentId: EnvironmentId;
}) {
  const segments = segmentMarkdown(props.text);
  const markdown = (text: string) => (
    <ChatMarkdown
      text={text}
      cwd={undefined}
      threadRef={props.threadRef}
      environmentId={props.environmentId}
    />
  );
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {segments.map((segment) =>
        segment.kind === "markdown" ? (
          <div key={segment.line}>{markdown(segment.text)}</div>
        ) : (
          <details key={segment.line} className="group/linear-details">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 py-1 text-sm font-medium select-none [&::-webkit-details-marker]:hidden">
              <ChevronRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-open/linear-details:rotate-90" />
              {segment.title}
            </summary>
            <div className="ps-5">{markdown(segment.text)}</div>
          </details>
        ),
      )}
    </div>
  );
}
