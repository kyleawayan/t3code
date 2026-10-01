import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
  getCustomNotificationSound,
  parseCustomNotificationSound,
  readNotificationSound,
  saveCustomNotificationSound,
} from "./customNotificationSound";

afterEach(() => vi.unstubAllGlobals());

describe("custom notification sounds", () => {
  it("persists one custom sound and restores defaults on reset", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    });
    vi.stubGlobal("window", new EventTarget());
    const completion = { name: "done.wav", url: "data:audio/wav;base64,AAAA" };
    saveCustomNotificationSound(completion);
    expect(parseCustomNotificationSound(getCustomNotificationSound())).toEqual(completion);
    saveCustomNotificationSound(null);
    expect(getCustomNotificationSound()).toBeNull();
  });

  it.each([null, "broken", "null", "{}", '{"name":"bad","url":"https://example.com/audio.mp3"}'])(
    "falls back to the default for invalid storage: %s",
    (value) => {
      expect(parseCustomNotificationSound(value)).toBeNull();
    },
  );

  it("rejects empty, oversized, and non-audio files", async () => {
    await expect(
      readNotificationSound(new File([], "empty.mp3", { type: "audio/mpeg" })),
    ).rejects.toThrow("non-empty");
    await expect(
      readNotificationSound(
        new File([new Uint8Array(1024 * 1024 + 1)], "large.wav", { type: "audio/wav" }),
      ),
    ).rejects.toThrow("1 MB");
    await expect(
      readNotificationSound(new File(["text"], "file.txt", { type: "text/plain" })),
    ).rejects.toThrow("audio file");
  });

  it("falls back when storage cannot be read and reports write failures", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("Storage blocked");
      },
      setItem: () => {
        throw new Error("Storage full");
      },
    });
    expect(getCustomNotificationSound()).toBeNull();
    expect(() =>
      saveCustomNotificationSound({
        name: "sound.wav",
        url: "data:audio/wav;base64,AAAA",
      }),
    ).toThrow("Storage full");
  });
});
