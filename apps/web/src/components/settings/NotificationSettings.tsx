import { useRef, useState, useSyncExternalStore } from "react";
import { NotificationPosition } from "@t3tools/contracts/settings";
import * as Schema from "effect/Schema";

import {
  getCustomNotificationSound,
  parseCustomNotificationSound,
  readNotificationSound,
  saveCustomNotificationSound,
  subscribeCustomNotificationSound,
} from "../../lib/customNotificationSound";
import {
  hasDesktopNotifications,
  hasNotificationSound,
  NOTIFICATION_MODE_LABELS,
  unlockNotificationAudio,
  playNotificationSound,
  validateNotificationSound,
} from "../../threadNotifications";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Button } from "../ui/button";
import { Tooltip, TooltipTrigger, TooltipPopup } from "../ui/tooltip";
import { toastManager } from "../ui/toast";
import { SettingsRow } from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";
import { useScopedSettings, useUpdateScopedSettings } from "./useScopedSettings";

const NOTIFICATION_POSITION_LABELS = {
  "top-left": "Top left",
  "top-center": "Top center",
  "top-right": "Top right",
  "bottom-left": "Bottom left",
  "bottom-center": "Bottom center",
  "bottom-right": "Bottom right",
  "command-menu": "Command menu",
} satisfies Record<NotificationPosition, string>;
const isNotificationPosition = Schema.is(NotificationPosition);

export function NotificationPositionSettings() {
  const position = useScopedSettings((settings) => settings.notificationPosition);
  const updateSettings = useUpdateScopedSettings();

  return (
    <SettingsRow
      {...searchableSetting("notification-position")}
      description="Where in-app notifications appear on this device. Command menu places them near the top center, like the command palette."
      control={
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              toastManager.add({
                title: "Test notification",
                description: "Notifications will appear here.",
                type: "info",
              })
            }
          >
            Test notification
          </Button>
          <Select
            value={position}
            onValueChange={(value) => {
              if (isNotificationPosition(value)) {
                updateSettings({ notificationPosition: value });
              }
            }}
          >
            <SelectTrigger size="sm" className="w-full sm:w-44" aria-label="Notification position">
              <SelectValue>{NOTIFICATION_POSITION_LABELS[position]}</SelectValue>
            </SelectTrigger>
            <SelectPopup align="end" alignItemWithTrigger={false}>
              {Object.entries(NOTIFICATION_POSITION_LABELS).map(([value, label]) => (
                <SelectItem key={value} hideIndicator value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        </div>
      }
    />
  );
}

export function NotificationSettings() {
  const mode = useScopedSettings((settings) => settings.notificationMode);
  const updateSettings = useUpdateScopedSettings();
  const [permissionMessage, setPermissionMessage] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);

  return (
    <SettingsRow
      {...searchableSetting("thread-notifications")}
      description={
        permissionMessage ??
        "System alerts when a thread finishes, fails, or needs input or approval. Applies to this device while T3 Code is open."
      }
      control={
        <Select
          value={mode}
          disabled={requesting}
          onValueChange={async (value) => {
            if (
              value !== "off" &&
              value !== "notifications" &&
              value !== "sound" &&
              value !== "notifications-and-sound"
            )
              return;
            setPermissionMessage(null);
            if (hasNotificationSound(value)) unlockNotificationAudio();
            if (hasDesktopNotifications(value)) {
              if (typeof Notification === "undefined" || !window.isSecureContext) {
                setPermissionMessage(
                  "Notifications need a supported browser over HTTPS, or the desktop app. Sound only is still available.",
                );
                return;
              }
              setRequesting(true);
              try {
                const permission = await Notification.requestPermission();
                if (permission !== "granted") {
                  setPermissionMessage(
                    "Allow notifications in your browser or system settings, then choose this option again. Sound only is still available.",
                  );
                  return;
                }
              } catch {
                setPermissionMessage(
                  "Notifications are unavailable in this browser. Sound only is still available.",
                );
                return;
              } finally {
                setRequesting(false);
              }
            }
            updateSettings({ notificationMode: value });
          }}
        >
          <SelectTrigger size="sm" className="w-full sm:w-56" aria-label="Thread notifications">
            <SelectValue>{NOTIFICATION_MODE_LABELS[mode]}</SelectValue>
          </SelectTrigger>
          <SelectPopup align="end" alignItemWithTrigger={false}>
            {Object.entries(NOTIFICATION_MODE_LABELS).map(([value, label]) => (
              <SelectItem key={value} hideIndicator value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
      }
    />
  );
}

export function NotificationSoundSettings() {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stored = useSyncExternalStore(
    subscribeCustomNotificationSound,
    getCustomNotificationSound,
    () => null,
  );
  const sound = parseCustomNotificationSound(stored);

  return (
    <SettingsRow
      {...searchableSetting("notification-sound")}
      description={
        <>
          <span>
            Use one audio file for all thread alerts, up to 1 MB and 30 seconds. Saved in this
            desktop app. Enable sound in Thread notifications.
          </span>
          {error && (
            <span role="alert" className="block text-destructive">
              {error}
            </span>
          )}
        </>
      }
      control={
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Tooltip>
            <TooltipTrigger
              render={<span className="max-w-40 truncate text-xs text-muted-foreground" />}
            >
              {sound?.name ?? "Default"}
            </TooltipTrigger>
            <TooltipPopup>{sound?.name ?? "Default"}</TooltipPopup>
          </Tooltip>
          <input
            ref={input}
            type="file"
            accept="audio/*"
            aria-label="Choose notification sound"
            className="hidden"
            disabled={busy}
            onChange={async (event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              if (!file) return;
              setBusy(true);
              setError(null);
              try {
                const url = await readNotificationSound(file);
                await validateNotificationSound(url);
                saveCustomNotificationSound({ name: file.name, url });
              } catch (cause) {
                setError(cause instanceof Error ? cause.message : "Could not save this sound.");
              } finally {
                setBusy(false);
              }
            }}
          />
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            aria-label="Choose notification sound"
            onClick={() => input.current?.click()}
          >
            {busy ? "Loading…" : "Choose file"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            aria-label="Preview notification sound"
            onClick={async () => {
              await unlockNotificationAudio();
              void playNotificationSound("completion", () => true);
            }}
          >
            Preview
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={busy || !sound}
            aria-label="Reset notification sound"
            onClick={() => {
              try {
                saveCustomNotificationSound(null);
                setError(null);
              } catch {
                setError("Could not reset this sound. Try restarting the desktop app.");
              }
            }}
          >
            Reset
          </Button>
        </div>
      }
    />
  );
}
