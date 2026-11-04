import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const SOUND_SECONDS = 0.6;

const audio = { currentTime: 0, started: 0 };

class FakeAudioContext {
  state = "running";
  destination = {};
  get currentTime() {
    return audio.currentTime;
  }
  resume() {
    return Promise.resolve();
  }
  decodeAudioData() {
    return Promise.resolve({ duration: SOUND_SECONDS });
  }
  createBufferSource() {
    return {
      buffer: null,
      connect() {},
      start() {
        audio.started += 1;
      },
    };
  }
}

async function loadUnlocked() {
  const notifications = await import("./threadNotifications");
  await notifications.unlockNotificationAudio();
  return { ...notifications, ...(await import("./notificationSounds")) };
}

const fetchedSounds = () =>
  vi.mocked(fetch).mock.calls.map(([url]) => String(url).match(/notification-(\w+)/)?.[1]);

beforeEach(() => {
  vi.resetModules();
  audio.currentTime = 0;
  audio.started = 0;
  vi.stubGlobal("AudioContext", FakeAudioContext);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ arrayBuffer: async () => new ArrayBuffer(0) })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("playNotificationSound", () => {
  it("plays one sound for threads that complete together", async () => {
    const { playNotificationSound } = await loadUnlocked();

    await Promise.all(
      Array.from({ length: 4 }, () => playNotificationSound("completion", () => true)),
    );

    expect(audio.started).toBe(1);
  });

  it("still plays an input alert over a completion sound", async () => {
    const { playNotificationSound } = await loadUnlocked();
    await playNotificationSound("completion", () => true);

    await playNotificationSound("input", () => true);

    expect(audio.started).toBe(2);
  });

  it("leaves the slot free when a sound is turned off before it plays", async () => {
    const { playNotificationSound } = await loadUnlocked();
    await playNotificationSound("completion", () => false);

    await playNotificationSound("completion", () => true);

    expect(audio.started).toBe(1);
  });

  it("plays the sound chosen for each event", async () => {
    const { playNotificationSound, setNotificationSoundChoice } = await loadUnlocked();
    await setNotificationSoundChoice("approval", "chime");

    await playNotificationSound("approval", () => true);
    await playNotificationSound("failed", () => true);

    expect(fetchedSounds()).toEqual(["completion", "input"]);
    expect(audio.started).toBe(2);
  });

  it("keeps a silenced event quiet without muting the others", async () => {
    const { playNotificationSound, setNotificationSoundChoice } = await loadUnlocked();
    await setNotificationSoundChoice("completion", "none");

    await playNotificationSound("completion", () => true);
    await playNotificationSound("input", () => true);

    expect(fetchedSounds()).toEqual(["input"]);
    expect(audio.started).toBe(1);
  });

  it("falls back to the event's default when its custom file is gone", async () => {
    const { playNotificationSound, setNotificationSoundChoice } = await loadUnlocked();
    await setNotificationSoundChoice("limited", { file: 7, name: "deleted.wav" });

    await playNotificationSound("limited", () => true);

    expect(fetchedSounds()).toEqual(["input"]);
    expect(audio.started).toBe(1);
  });
});
