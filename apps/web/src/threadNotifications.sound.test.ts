import { afterEach, expect, it, vi } from "vite-plus/test";

const platform = vi.hoisted(() => ({ desktop: true }));
vi.mock("./env", () => ({
  get isElectron() {
    return platform.desktop;
  },
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

async function setup(desktop = true) {
  platform.desktop = desktop;
  const start = vi.fn();
  const context = {
    state: "running",
    resume: vi.fn().mockResolvedValue(undefined),
    decodeAudioData: vi.fn().mockResolvedValue({ duration: 1 }),
    createBufferSource: () => ({ connect: vi.fn(), start, buffer: null }),
    destination: {},
  };
  vi.stubGlobal("AudioContext", function AudioContextMock() {
    return context;
  });
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ arrayBuffer: async () => new ArrayBuffer(1) }),
  );
  vi.stubGlobal("localStorage", {
    getItem: () => JSON.stringify({ name: "custom.wav", url: "data:audio/wav;base64,AAAA" }),
  });
  const sounds = await import("./threadNotifications");
  await sounds.unlockNotificationAudio();
  return { ...sounds, start, context };
}

it("uses the same custom audio for completion and attention alerts on desktop", async () => {
  const sound = await setup();
  await sound.playNotificationSound("completion", () => true);
  expect(fetch).not.toHaveBeenCalled();
  expect(sound.context.decodeAudioData).toHaveBeenCalledWith(new Uint8Array([0, 0, 0]).buffer);
  await sound.playNotificationSound("input", () => true);
  expect(sound.context.decodeAudioData).toHaveBeenCalledOnce();
  expect(sound.start).toHaveBeenCalledTimes(2);
});

it("keeps the bundled sound in web clients", async () => {
  const sound = await setup(false);
  await sound.playNotificationSound("input", () => true);
  expect(fetch).toHaveBeenCalledWith(expect.stringContaining("notification-input.mp3"));
});

it("does not play when the notification is no longer relevant", async () => {
  const sound = await setup();
  await sound.playNotificationSound("completion", () => false);
  expect(sound.start).not.toHaveBeenCalled();
});

it("rejects long and undecodable audio before saving", async () => {
  const sound = await setup();
  sound.context.decodeAudioData.mockResolvedValueOnce({ duration: 31 });
  await expect(sound.validateNotificationSound("data:audio/wav;base64,AAAA")).rejects.toThrow(
    "30 seconds",
  );
  sound.context.decodeAudioData.mockRejectedValueOnce(new Error("Invalid audio"));
  await expect(sound.validateNotificationSound("data:audio/wav;base64,AAAA")).rejects.toThrow(
    "Invalid audio",
  );
});
