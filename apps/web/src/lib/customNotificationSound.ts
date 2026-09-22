const MAX_SOUND_BYTES = 1024 * 1024;
const CHANGE_EVENT = "t3-custom-notification-sound-change";
const STORAGE_KEY = "t3:notification-sound";

export function getCustomNotificationSound(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function parseCustomNotificationSound(value: string | null) {
  if (!value) return null;
  try {
    const sound: unknown = JSON.parse(value);
    if (
      typeof sound === "object" &&
      sound !== null &&
      "name" in sound &&
      typeof sound.name === "string" &&
      "url" in sound &&
      typeof sound.url === "string" &&
      /^data:audio\/[a-z0-9.+-]+;base64,/i.test(sound.url)
    )
      return { name: sound.name, url: sound.url };
  } catch {
    // A damaged local preference should fall back to the bundled sound.
  }
  return null;
}

export function subscribeCustomNotificationSound(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener(CHANGE_EVENT, listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener(CHANGE_EVENT, listener);
  };
}

export function saveCustomNotificationSound(sound: { name: string; url: string } | null) {
  if (sound) localStorage.setItem(STORAGE_KEY, JSON.stringify(sound));
  else localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export async function readNotificationSound(file: File) {
  if (file.size === 0 || file.size > MAX_SOUND_BYTES) {
    throw new Error("Choose a non-empty audio file up to 1 MB.");
  }
  if (!file.type.startsWith("audio/")) {
    throw new Error("Choose an audio file, such as MP3, WAV, or OGG.");
  }
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("error", () => reject(new Error("Could not read this audio file.")), {
      once: true,
    });
    reader.addEventListener(
      "load",
      () => {
        if (typeof reader.result === "string") resolve(reader.result);
        else reject(new Error("Could not read this audio file."));
      },
      { once: true },
    );
    reader.readAsDataURL(file);
  });
}
