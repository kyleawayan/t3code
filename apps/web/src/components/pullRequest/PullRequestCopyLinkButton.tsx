// oxlint-disable t3code/no-untranslated-copy -- Fork-only English copy, kept out of upstream's translation catalogs.
import { CheckIcon, LinkIcon } from "lucide-react";

import { useCopyToClipboard } from "~/hooks/useCopyToClipboard";

import { Button } from "../ui/button";
import { toastManager } from "../ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

/** Fork: copies the pull request's link in one click, beside the header's actions menu. */
export function PullRequestCopyLinkButton(props: { readonly url: string }) {
  const { copyToClipboard, isCopied } = useCopyToClipboard({
    timeout: 1200,
    target: {
      target: "pull request link",
      unavailableMessage: "Clipboard API is unavailable while copying the link.",
      failureMessage: "Failed to copy the link to the clipboard.",
    },
    onError: (error) =>
      toastManager.add({
        type: "error",
        title: "Could not copy the link",
        description: error.message,
      }),
  });
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={isCopied ? "Link copied" : "Copy link"}
            size="icon-xs"
            variant="ghost-muted"
            onClick={() => copyToClipboard(props.url)}
          />
        }
      >
        {isCopied ? <CheckIcon className="size-4" /> : <LinkIcon className="size-4" />}
      </TooltipTrigger>
      <TooltipPopup side="top">{isCopied ? "Copied" : "Copy link"}</TooltipPopup>
    </Tooltip>
  );
}
