import { useId } from "react";

import { Label } from "../ui/label";
import { Switch } from "../ui/switch";
import { useDevSubscriptionPreview } from "./subscriptionPreview";

export function DevSubscriptionPreviewSwitch() {
  const [enabled, setEnabled] = useDevSubscriptionPreview();
  const id = useId();
  if (!import.meta.env.DEV) return null;
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-border p-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor={id} className="text-xs">
          Show sample subscription bars
        </Label>
        <p className="text-xs text-muted-foreground">
          Development only. Preview Claude and Codex quotas on Usage and in the sidebar.
        </p>
      </div>
      <Switch id={id} size="sm" checked={enabled} onCheckedChange={setEnabled} />
    </div>
  );
}
