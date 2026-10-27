import type { ScopedThreadRef } from "@t3tools/contracts";

import ChatMarkdown from "~/components/ChatMarkdown";
import { resolvePathLinkTarget } from "@t3tools/shared/fileLinks";

export function FileMarkdownPreview(props: {
  readonly cwd: string;
  readonly relativePath: string;
  readonly text: string;
  readonly threadRef: ScopedThreadRef;
  readonly workspaceMutationId: string | null;
  /** Fork: Obsidian's inline title, shown above the note because its name is usually its title. */
  readonly title?: string | null | undefined;
  readonly onTaskListChange?:
    | ((input: { readonly markerOffset: number; readonly checked: boolean }) => void)
    | undefined;
}) {
  const lastSeparator = Math.max(
    props.relativePath.lastIndexOf("/"),
    props.relativePath.lastIndexOf("\\"),
  );
  const imageBaseDir =
    lastSeparator >= 0
      ? resolvePathLinkTarget(props.relativePath.slice(0, lastSeparator), props.cwd)
      : props.cwd;

  const markdown = (
    <ChatMarkdown
      text={props.text}
      cwd={props.cwd}
      imageBaseDir={imageBaseDir}
      threadRef={props.threadRef}
      workspaceMutationId={props.workspaceMutationId}
      {...(props.title ? {} : { className: "mx-auto max-w-4xl px-6 py-5" })}
      onTaskListChange={props.onTaskListChange}
    />
  );
  if (!props.title) return markdown;
  return (
    <div className="mx-auto max-w-4xl px-6 py-5">
      {/* Kept out of the markdown source, whose offsets the task checkboxes write back to. */}
      <div className="chat-markdown">
        <h1 dir="auto">{props.title}</h1>
      </div>
      {markdown}
    </div>
  );
}
