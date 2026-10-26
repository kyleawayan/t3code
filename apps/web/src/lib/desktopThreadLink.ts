import type { ScopedThreadRef } from "@t3tools/contracts";
import { promptLinkAppPath, promptLinkDeepLink } from "@t3tools/shared/promptLinks";

import { copyLinkWithToast } from "../components/promptLinks/copyPromptLink";

/**
 * A link that reopens the thread in the desktop app. The desktop renderer is served from
 * the scheme that build registers with the OS (`t3code-dev` for dev builds), so reuse the
 * page's own scheme there; anywhere else, target the installed app. Whether the page's
 * scheme is an app scheme is asked of `promptLinkAppPath`, which owns that list.
 */
export function desktopThreadLink(threadRef: ScopedThreadRef): string {
  const { protocol } = window.location;
  const scheme = promptLinkAppPath(`${protocol}//new`) === null ? "t3code" : protocol.slice(0, -1);
  return promptLinkDeepLink(
    `/${encodeURIComponent(threadRef.environmentId)}/${encodeURIComponent(threadRef.threadId)}`,
    scheme,
  );
}

export function copyDesktopThreadLink(link: string): Promise<void> {
  return copyLinkWithToast(
    link,
    { copied: "Thread link copied", failed: "Could not copy the thread link" },
    link,
  );
}
