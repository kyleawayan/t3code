import { expect, it } from "vite-plus/test";

import {
  addNotificationSoundFile,
  notificationSoundChoice,
  notificationSoundFor,
  resetNotificationSounds,
  setNotificationSoundChoice,
} from "./notificationSounds";

const sound = (name: string) => new File([new Uint8Array([1, 2, 3])], name, { type: "audio/wav" });

async function loadedBytes(event: Parameters<typeof notificationSoundFor>[0]) {
  return (await notificationSoundFor(event)!.load()).byteLength;
}

it("keeps a custom file while any event still plays it", async () => {
  try {
    await addNotificationSoundFile("completion", sound("done.wav"));
    const done = notificationSoundChoice("completion");
    await setNotificationSoundChoice("input", done);
    await setNotificationSoundChoice("completion", "chime");
    expect(await loadedBytes("input")).toBe(3);

    await setNotificationSoundChoice("input", "alert");
    await setNotificationSoundChoice("input", done);
    expect(await loadedBytes("input")).toBeGreaterThan(3);
  } finally {
    await resetNotificationSounds();
  }
});

it("keeps an upload when another event changes at the same time", async () => {
  try {
    await Promise.all([
      addNotificationSoundFile("approval", sound("approve.wav")),
      setNotificationSoundChoice("failed", "none"),
    ]);
    expect(notificationSoundChoice("approval")).toMatchObject({ name: "approve.wav" });
    expect(await loadedBytes("approval")).toBe(3);
  } finally {
    await resetNotificationSounds();
  }
});
