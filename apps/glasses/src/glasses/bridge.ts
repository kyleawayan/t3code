import { type EvenAppBridge, waitForEvenAppBridge } from "@evenrealities/even_hub_sdk";

const BRIDGE_WAIT_MS = 5_000;
// A flaky BLE hop can hang a bridge call for ~30s; cap it so the queue moves.
const BRIDGE_CALL_TIMEOUT_MS = 8_000;

let bridgeResolution: Promise<EvenAppBridge | null> | null = null;

/** Resolves null when the page runs outside the Even App (plain browser). */
export function evenAppBridge(): Promise<EvenAppBridge | null> {
  bridgeResolution ??= Promise.race([
    waitForEvenAppBridge(),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), BRIDGE_WAIT_MS)),
  ]);
  return bridgeResolution;
}

let bridgeQueue: Promise<unknown> = Promise.resolve();

/**
 * Bridge calls share one BLE link; overlapping render and storage calls can
 * drop the connection, so every call in the app waits for the previous one.
 * Failures and timeouts resolve to undefined so the queue never stalls.
 */
export function bridgeCall<T>(label: string, run: () => Promise<T>): Promise<T | undefined> {
  const settled = bridgeQueue
    .then(() =>
      Promise.race([
        run(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`${label} timed out`)), BRIDGE_CALL_TIMEOUT_MS),
        ),
      ]),
    )
    .then(
      (result) => {
        if (import.meta.env.DEV) {
          console.log(`[glasses] ${label} -> ${String(result)}`);
        }
        return result;
      },
      (cause: unknown) => {
        console.warn(`[glasses] ${label} failed`, cause);
        return undefined;
      },
    );
  bridgeQueue = settled;
  return settled;
}

/** Settles once every bridge call queued so far has finished. */
export function bridgeIdle(): Promise<void> {
  return bridgeQueue.then(() => undefined);
}
