import { settlePromise } from "@t3tools/client-runtime/state/runtime";
import { T, useGT, useMessages } from "gt-react";
import { PlayIcon } from "lucide-react";
import { useRef, useState } from "react";

import {
  addNotificationSoundFile,
  BUNDLED_SOUND_LABELS,
  checkNotificationSoundFile,
  defaultNotificationSound,
  NOTIFICATION_SOUND_EVENT_IDS,
  NOTIFICATION_SOUND_EVENTS,
  type NotificationSoundChoice,
  type NotificationSoundEvent,
  type NotificationSoundFile,
  resetNotificationSounds,
  setNotificationSoundChoice,
  useNotificationSoundChoices,
} from "../../notificationSounds";
import {
  checkNotificationSoundDuration,
  hasDesktopNotifications,
  hasNotificationSound,
  NOTIFICATION_MODE_LABELS,
  playNotificationSound,
  unlockNotificationAudio,
} from "../../threadNotifications";
import { Button } from "../ui/button";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { SettingResetButton, SettingsRow } from "./settingsLayout";
import { useSearchableSetting } from "./settingsSearch";
import { useScopedSettings, useUpdateScopedSettings } from "./useScopedSettings";

export function NotificationSettings() {
  const searchableSetting = useSearchableSetting();
  const gt = useGT();
  const m = useMessages();
  const mode = useScopedSettings((settings) => settings.notificationMode);
  const updateSettings = useUpdateScopedSettings();
  const [permissionMessage, setPermissionMessage] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);

  return (
    <SettingsRow
      {...searchableSetting("thread-notifications")}
      description={
        permissionMessage ??
        gt(
          "System alerts when a thread finishes, fails, or needs input or approval. Applies to this device while T3 Code is open.",
        )
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
            if (hasNotificationSound(value)) void unlockNotificationAudio();
            if (hasDesktopNotifications(value)) {
              if (typeof Notification === "undefined" || !window.isSecureContext) {
                setPermissionMessage(
                  gt(
                    "Notifications need a supported browser over HTTPS, or the desktop app. Sound only is still available.",
                  ),
                );
                return;
              }
              setRequesting(true);
              const permission = await settlePromise(() => Notification.requestPermission());
              setRequesting(false);
              if (permission._tag === "Failure") {
                setPermissionMessage(
                  gt(
                    "Notifications are unavailable in this browser. Sound only is still available.",
                  ),
                );
                return;
              }
              if (permission.value !== "granted") {
                setPermissionMessage(
                  gt(
                    "Allow notifications in your browser or system settings, then choose this option again. Sound only is still available.",
                  ),
                );
                return;
              }
            }
            updateSettings({ notificationMode: value });
          }}
        >
          <SelectTrigger
            size="sm"
            className="w-full sm:w-56"
            aria-label={gt("Thread notifications")}
          >
            <SelectValue>{m(NOTIFICATION_MODE_LABELS[mode])}</SelectValue>
          </SelectTrigger>
          <SelectPopup align="end" alignItemWithTrigger={false}>
            {Object.entries(NOTIFICATION_MODE_LABELS).map(([value, label]) => (
              <SelectItem key={value} hideIndicator value={value}>
                {m(label)}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
      }
    />
  );
}

const CHOOSE_FILE = "choose-file";

function soundValue(choice: NotificationSoundChoice) {
  return typeof choice === "string" ? choice : `file:${choice.file}`;
}

function soundLabel(choice: NotificationSoundChoice, gt: ReturnType<typeof useGT>) {
  if (choice === "none") return gt("Silent");
  return typeof choice === "string" ? BUNDLED_SOUND_LABELS[choice] : choice.name;
}

export function NotificationSoundSettings() {
  const gt = useGT();
  const searchableSetting = useSearchableSetting();
  const choices = useNotificationSoundChoices();
  const fileInput = useRef<HTMLInputElement>(null);
  const fileTarget = useRef<NotificationSoundEvent | null>(null);
  const [loading, setLoading] = useState<NotificationSoundEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const files = [
    ...new Map(
      Object.values(choices).flatMap((choice) =>
        typeof choice === "object" ? [[choice.file, choice] as const] : [],
      ),
    ).values(),
  ] satisfies NotificationSoundFile[];
  const customized = NOTIFICATION_SOUND_EVENT_IDS.some(
    (event) => choices[event] !== defaultNotificationSound(event),
  );

  return (
    <SettingsRow
      {...searchableSetting("notification-sounds")}
      description={
        <>
          <T>
            The sound for each alert when Thread notifications include sound. Custom files up to 1
            MB and 30 seconds stay on this device.
          </T>
          {error && (
            <span role="alert" className="block text-destructive">
              {error}
            </span>
          )}
        </>
      }
      resetAction={
        customized ? (
          <SettingResetButton
            ariaLabel={gt("Reset notification sounds to default")}
            onClick={() => {
              setError(null);
              void resetNotificationSounds();
            }}
          />
        ) : null
      }
    >
      <input
        ref={fileInput}
        type="file"
        accept="audio/*"
        hidden
        onChange={async (change) => {
          const file = change.currentTarget.files?.[0];
          change.currentTarget.value = "";
          const event = fileTarget.current;
          if (!file || !event) return;
          setLoading(event);
          setError(null);
          try {
            checkNotificationSoundFile(file);
            await checkNotificationSoundDuration(file);
            await addNotificationSoundFile(event, file);
          } catch (cause) {
            setError(
              `${NOTIFICATION_SOUND_EVENTS[event]}: ${
                cause instanceof Error ? cause.message : "Could not save this sound."
              }`,
            );
          } finally {
            setLoading(null);
          }
        }}
      />
      <ul className="divide-y divide-border/40 pt-2 pb-1">
        {NOTIFICATION_SOUND_EVENT_IDS.map((event) => {
          const label = NOTIFICATION_SOUND_EVENTS[event];
          const choice = choices[event];
          return (
            <li key={event} className="flex items-center justify-between gap-3 py-1.5 text-sm">
              <span className="min-w-0 truncate">{label}</span>
              <div className="flex shrink-0 items-center gap-1">
                <Select
                  value={soundValue(choice)}
                  disabled={loading === event}
                  onValueChange={(value) => {
                    setError(null);
                    if (value === CHOOSE_FILE) {
                      fileTarget.current = event;
                      fileInput.current?.click();
                      return;
                    }
                    const next =
                      value === "chime" || value === "alert" || value === "none"
                        ? value
                        : files.find((file) => soundValue(file) === value);
                    if (next) void setNotificationSoundChoice(event, next);
                  }}
                >
                  <SelectTrigger
                    size="sm"
                    className="w-40"
                    aria-label={gt("{label} sound", { label })}
                  >
                    <SelectValue>
                      {loading === event ? gt("Loading…") : soundLabel(choice, gt)}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectPopup align="end" alignItemWithTrigger={false}>
                    <SelectItem value="chime">{BUNDLED_SOUND_LABELS.chime}</SelectItem>
                    <SelectItem value="alert">{BUNDLED_SOUND_LABELS.alert}</SelectItem>
                    {files.map((file) => (
                      <SelectItem key={file.file} value={soundValue(file)}>
                        {file.name}
                      </SelectItem>
                    ))}
                    <SelectItem value="none">
                      <T>Silent</T>
                    </SelectItem>
                    <SelectItem value={CHOOSE_FILE}>
                      <T>Choose file…</T>
                    </SelectItem>
                  </SelectPopup>
                </Select>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={gt("Preview {label} sound", { label })}
                  disabled={choice === "none" || loading === event}
                  onClick={async () => {
                    await unlockNotificationAudio();
                    void playNotificationSound(event, () => true);
                  }}
                >
                  <PlayIcon />
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </SettingsRow>
  );
}
