import * as Schema from "effect/Schema";

import completionUrl from "./assets/notification-completion.mp3";
import inputUrl from "./assets/notification-input.mp3";
import {
  getLocalStorageItem,
  useLocalStorage,
  writeLocalStorageValue,
} from "./hooks/useLocalStorage";

export const NOTIFICATION_SOUND_EVENTS = {
  completion: "Thread completed",
  input: "Input needed",
  approval: "Approval needed",
  failed: "Thread failed",
  limited: "Usage limit reached",
  request: "Guest request",
} as const;
export type NotificationSoundEvent = keyof typeof NOTIFICATION_SOUND_EVENTS;
export const NOTIFICATION_SOUND_EVENT_IDS = Object.keys(
  NOTIFICATION_SOUND_EVENTS,
) as ReadonlyArray<NotificationSoundEvent>;

const BUNDLED_SOUNDS = { chime: completionUrl, alert: inputUrl };
export const BUNDLED_SOUND_LABELS = { chime: "Chime", alert: "Alert" } as const;

const NotificationSoundFile = Schema.Struct({ file: Schema.Number, name: Schema.String });
const NotificationSoundChoice = Schema.Union([
  Schema.Literals(["chime", "alert", "none"]),
  NotificationSoundFile,
]);
export type NotificationSoundChoice = typeof NotificationSoundChoice.Type;
export type NotificationSoundFile = typeof NotificationSoundFile.Type;
const NotificationSoundChoices = Schema.Record(Schema.String, NotificationSoundChoice);
type NotificationSoundChoices = typeof NotificationSoundChoices.Type;

const STORAGE_KEY = "t3code:notification-sounds:v1";
const MAX_SOUND_BYTES = 1024 * 1024;

export function defaultNotificationSound(event: NotificationSoundEvent): "chime" | "alert" {
  return event === "completion" ? "chime" : "alert";
}

function readChoices(): NotificationSoundChoices {
  try {
    return getLocalStorageItem(STORAGE_KEY, NotificationSoundChoices) ?? {};
  } catch {
    return {};
  }
}

export function notificationSoundChoice(
  event: NotificationSoundEvent,
  choices: NotificationSoundChoices = readChoices(),
): NotificationSoundChoice {
  return choices[event] ?? defaultNotificationSound(event);
}

export function useNotificationSoundChoices(): Record<
  NotificationSoundEvent,
  NotificationSoundChoice
> {
  const [choices] = useLocalStorage(STORAGE_KEY, {}, NotificationSoundChoices);
  return Object.fromEntries(
    NOTIFICATION_SOUND_EVENT_IDS.map((event) => [event, notificationSoundChoice(event, choices)]),
  ) as Record<NotificationSoundEvent, NotificationSoundChoice>;
}

// Custom files live in IndexedDB so several of them cannot exhaust localStorage's quota.
const DATABASE_NAME = "t3code:notification-sounds";
const STORE_NAME = "files";
let database: Promise<IDBDatabase> | undefined;

function openDatabase() {
  return (database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.addEventListener("upgradeneeded", () => {
      request.result.createObjectStore(STORE_NAME, { autoIncrement: true });
    });
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => reject(request.error));
    request.addEventListener("blocked", () => reject(new Error("Sound storage is blocked.")));
  }).catch((cause: unknown) => {
    database = undefined;
    throw cause;
  }));
}

async function withStore<A>(
  mode: IDBTransactionMode,
  use: (store: IDBObjectStore) => IDBRequest<A> | void,
) {
  const transaction = (await openDatabase()).transaction(STORE_NAME, mode);
  const request = use(transaction.objectStore(STORE_NAME));
  await new Promise<void>((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve());
    transaction.addEventListener("abort", () => reject(transaction.error));
    transaction.addEventListener("error", () => reject(transaction.error));
  });
  return request?.result;
}

let pendingWrite: Promise<unknown> = Promise.resolve();
/** Uploads and pruning share one queue so a prune never drops a file saved but not yet chosen. */
function serialized<A>(write: () => Promise<A>): Promise<A> {
  const run = pendingWrite.then(write);
  pendingWrite = run.catch(() => undefined);
  return run;
}

async function writeChoices(
  update: (choices: NotificationSoundChoices) => NotificationSoundChoices,
) {
  const choices = update(readChoices());
  writeLocalStorageValue(STORAGE_KEY, choices, {}, NotificationSoundChoices);
  const kept = new Set(
    Object.values(choices).flatMap((choice) => (typeof choice === "object" ? [choice.file] : [])),
  );
  await withStore("readwrite", (store) => {
    const keys = store.getAllKeys();
    keys.addEventListener("success", () => {
      for (const key of keys.result) if (!kept.has(key as number)) store.delete(key);
    });
  }).catch(() => undefined);
}

export function setNotificationSoundChoice(
  event: NotificationSoundEvent,
  choice: NotificationSoundChoice,
) {
  return serialized(() => writeChoices((choices) => ({ ...choices, [event]: choice })));
}

export function resetNotificationSounds() {
  return serialized(() => writeChoices(() => ({})));
}

export function checkNotificationSoundFile(file: File) {
  if (file.size === 0 || file.size > MAX_SOUND_BYTES) {
    throw new Error("Choose a non-empty audio file up to 1 MB.");
  }
  // Some audio files (.opus, .m4a) report no MIME type; the decode check decides those.
  if (file.type !== "" && !file.type.startsWith("audio/")) {
    throw new Error("Choose an audio file, such as MP3, WAV, or OGG.");
  }
}

export function addNotificationSoundFile(event: NotificationSoundEvent, file: File) {
  return serialized(async () => {
    const id = await withStore("readwrite", (store) => store.add(file));
    await writeChoices((choices) => ({
      ...choices,
      [event]: { file: id as number, name: file.name },
    }));
  });
}

async function fetchBundled(sound: keyof typeof BUNDLED_SOUNDS) {
  return (await fetch(BUNDLED_SOUNDS[sound])).arrayBuffer();
}

/** The sound an event plays now, keyed so equal sounds share a decode and a playback slot. */
export function notificationSoundFor(
  event: NotificationSoundEvent,
): { readonly key: string; readonly load: () => Promise<ArrayBuffer> } | null {
  const choice = notificationSoundChoice(event);
  if (choice === "none") return null;
  if (typeof choice === "string") return { key: choice, load: () => fetchBundled(choice) };
  return {
    key: `file:${choice.file}`,
    load: async () => {
      const blob = await withStore<Blob | undefined>("readonly", (store) =>
        store.get(choice.file),
      ).catch(() => undefined);
      return blob ? blob.arrayBuffer() : fetchBundled(defaultNotificationSound(event));
    },
  };
}

export function activeNotificationSoundKeys(): ReadonlySet<string> {
  return new Set(
    NOTIFICATION_SOUND_EVENT_IDS.flatMap((event) => notificationSoundFor(event)?.key ?? []),
  );
}
