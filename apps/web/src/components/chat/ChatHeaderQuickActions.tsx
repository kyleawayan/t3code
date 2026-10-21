import type {
  EditorId,
  EnvironmentId,
  ProjectScript,
  ResolvedKeybindingsConfig,
  ThreadId,
} from "@t3tools/contracts";
import { memo } from "react";

import type { DraftId } from "../../composerDraftStore";
import { useT3ProjectFileScripts } from "../../hooks/useT3ProjectFileScripts";
import BaseGitActionsControl from "../GitActionsControl";
import ProjectScriptsControl, {
  type NewProjectScriptInput,
  type ProjectScriptActionResult,
} from "../ProjectScriptsControl";
import { OpenInPicker } from "./OpenInPicker";

const GitActionsControl = memo(BaseGitActionsControl);

/**
 * Scripts, Open in, and Git in the chat header, one click each. The thread details card holds
 * the same controls, so ChatView shows these only while that card is not open beside the chat.
 */
export function ChatHeaderQuickActions(props: {
  environmentId: EnvironmentId;
  threadId: ThreadId;
  draftId?: DraftId;
  activeProjectName: string | undefined;
  activeProjectScripts: ReadonlyArray<ProjectScript> | undefined;
  preferredScriptId: string | null;
  keybindings: ResolvedKeybindingsConfig;
  availableEditors: ReadonlyArray<EditorId>;
  showOpenInPicker: boolean;
  openInShortcutEnabled: boolean;
  gitCwd: string | null;
  onRequestGitAgentAction?: (prompt: string) => void;
  onRunProjectScript: (script: ProjectScript) => void;
  onAddProjectScript: (input: NewProjectScriptInput) => Promise<ProjectScriptActionResult>;
  onUpdateProjectScript: (
    scriptId: string,
    input: NewProjectScriptInput,
  ) => Promise<ProjectScriptActionResult>;
  onDeleteProjectScript: (scriptId: string) => Promise<ProjectScriptActionResult>;
}) {
  const fileScripts = useT3ProjectFileScripts(
    props.environmentId,
    props.activeProjectScripts ? props.gitCwd : null,
  );
  return (
    <div className="flex shrink-0 items-center gap-2" data-chat-header-actions>
      {props.activeProjectScripts ? (
        <ProjectScriptsControl
          environmentId={props.environmentId}
          scripts={props.activeProjectScripts}
          fileScripts={fileScripts}
          preferredScriptId={props.preferredScriptId}
          onRunScript={props.onRunProjectScript}
          onAddScript={props.onAddProjectScript}
          onUpdateScript={props.onUpdateProjectScript}
          onDeleteScript={props.onDeleteProjectScript}
        />
      ) : null}
      {props.showOpenInPicker ? (
        <OpenInPicker
          keybindings={props.keybindings}
          environmentId={props.environmentId}
          availableEditors={props.availableEditors}
          openInCwd={props.gitCwd}
          enableShortcut={props.openInShortcutEnabled}
        />
      ) : null}
      {props.gitCwd && props.activeProjectName ? (
        <GitActionsControl
          gitCwd={props.gitCwd}
          activeThreadRef={{ environmentId: props.environmentId, threadId: props.threadId }}
          {...(props.draftId ? { draftId: props.draftId } : {})}
          {...(props.onRequestGitAgentAction
            ? { onRequestAgentAction: props.onRequestGitAgentAction }
            : {})}
        />
      ) : null}
    </div>
  );
}
