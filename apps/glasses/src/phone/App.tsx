import { useAtomValue } from "@effect/atom-react";
import {
  AVAILABLE_CONNECTION_STATE,
  connectionStatusText,
  presentConnectionState,
} from "@t3tools/client-runtime/connection";
import type { EnvironmentId } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as Option from "effect/Option";
import { AsyncResult } from "effect/unstable/reactivity";
import { type CSSProperties, useEffect, useState } from "react";

import { connectPairing } from "../connection/onboarding";
import { appAtomRegistry } from "../connection/runtime";
import { evenAppBridge, glassesStatusAtom } from "../glasses/controller";
import {
  DEFAULT_REVEAL_SPEED,
  REVEAL_SPEED_MAX,
  REVEAL_SPEED_MIN,
  REVEAL_SPEED_STEP,
  revealSpeedAtom,
  setRevealSpeed,
} from "../glasses/revealSpeed";
import { decodeQrFromBase64, pairingUrlFromQrPayload } from "../pairing/qr";
import { environmentCatalog } from "../state";

function failureMessage(cause: Cause.Cause<unknown>): string {
  const error = Cause.squash(cause);
  return error instanceof Error ? error.message : String(error);
}

function EnvironmentRow({ environmentId, label }: { environmentId: EnvironmentId; label: string }) {
  const state = Option.getOrElse(
    AsyncResult.value(useAtomValue(environmentCatalog.stateAtom(environmentId))),
    () => AVAILABLE_CONNECTION_STATE,
  );
  return (
    <li style={styles.row}>
      <div>
        <div style={styles.rowTitle}>{label}</div>
        <div style={styles.muted}>{connectionStatusText(presentConnectionState(state))}</div>
      </div>
      <button
        type="button"
        style={styles.secondaryButton}
        onClick={() => void environmentCatalog.remove.run(appAtomRegistry, environmentId)}
      >
        Forget
      </button>
    </li>
  );
}

function TypingSpeedSection() {
  const speed = useAtomValue(revealSpeedAtom);
  // The slider keeps its last position while "instant" is on so switching
  // back lands on the speed the reader had before.
  const [sliderSpeed, setSliderSpeed] = useState(speed ?? DEFAULT_REVEAL_SPEED);
  const instant = speed === null;
  return (
    <section>
      <h2 style={styles.h2}>Typing speed</h2>
      <p style={styles.muted}>How fast agent replies type out on the glasses.</p>
      <label style={styles.label}>
        <span style={styles.sliderCaption}>
          <span>Slower</span>
          <span style={instant ? styles.mutedInline : undefined}>
            {instant ? "Instant" : `${speed} characters per second`}
          </span>
          <span>Faster</span>
        </span>
        <input
          style={styles.slider}
          type="range"
          min={REVEAL_SPEED_MIN}
          max={REVEAL_SPEED_MAX}
          step={REVEAL_SPEED_STEP}
          value={sliderSpeed}
          disabled={instant}
          onChange={(event) => {
            const next = Number(event.target.value);
            setSliderSpeed(next);
            setRevealSpeed(next);
          }}
        />
      </label>
      <label style={styles.checkbox}>
        <input
          type="checkbox"
          checked={instant}
          onChange={(event) => setRevealSpeed(event.target.checked ? null : sliderSpeed)}
        />
        Show new text at once
      </label>
    </section>
  );
}

export function App() {
  const catalog = useAtomValue(environmentCatalog.catalogValueAtom);
  const glassesStatus = useAtomValue(glassesStatusAtom);
  const [pairingUrl, setPairingUrl] = useState("");
  const [busy, setBusy] = useState<"scan" | "paste" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pair = async (url: string) => {
    const result = await connectPairing.run(appAtomRegistry, url);
    if (result._tag === "Failure") {
      setError(failureMessage(result.cause));
      return;
    }
    setError(null);
    setPairingUrl("");
  };

  // Dev-only automation hook, mirroring mobile's deep-link prefill: the
  // simulator has no way to type into the page, so the pairing URL rides on
  // the page URL. Never honored in a production build.
  useEffect(() => {
    if (!import.meta.env.DEV || !catalog.isReady) {
      return;
    }
    const prefill = new URL(window.location.href).searchParams.get("pairingUrl")?.trim() ?? "";
    const lastPrefillKey = "t3code-glasses:dev-last-prefill";
    if (prefill.length > 0 && window.localStorage.getItem(lastPrefillKey) !== prefill) {
      window.localStorage.setItem(lastPrefillKey, prefill);
      setPairingUrl(prefill);
      void pair(prefill);
    }
  }, [catalog.isReady]);

  const scan = async () => {
    setBusy("scan");
    setError(null);
    try {
      const bridge = await evenAppBridge();
      if (bridge === null) {
        setError(
          "The camera is only available inside the Even App. Paste the pairing URL instead.",
        );
        return;
      }
      const photo = await bridge.captureImageFromCamera();
      if (photo === null) {
        return;
      }
      const payload = await decodeQrFromBase64(photo.base64, photo.mimeType);
      if (payload === null) {
        setError(
          "No QR code found. Fill the frame with the QR from Settings > Connections and retry.",
        );
        return;
      }
      await pair(pairingUrlFromQrPayload(payload));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(null);
    }
  };

  const paste = async () => {
    setBusy("paste");
    try {
      await pair(pairingUrl.trim());
    } finally {
      setBusy(null);
    }
  };

  return (
    <main style={styles.main}>
      <h1 style={styles.h1}>T3 Code for Even G2</h1>
      <p style={styles.muted}>{glassesStatus}</p>

      <section>
        <h2 style={styles.h2}>Servers</h2>
        {!catalog.isReady ? (
          <p style={styles.muted}>Loading...</p>
        ) : catalog.entries.size === 0 ? (
          <p style={styles.muted}>None paired yet.</p>
        ) : (
          <ul style={styles.list}>
            {[...catalog.entries].map(([environmentId, entry]) => (
              <EnvironmentRow
                key={environmentId}
                environmentId={environmentId}
                label={entry.target.label}
              />
            ))}
          </ul>
        )}
      </section>

      <TypingSpeedSection />

      <section>
        <h2 style={styles.h2}>Pair a server</h2>
        <p style={styles.muted}>
          In T3 Code on your computer, open Settings, then Connections, and show the pairing QR.
        </p>
        <button
          type="button"
          style={styles.primaryButton}
          disabled={busy !== null}
          onClick={() => void scan()}
        >
          {busy === "scan" ? "Reading photo..." : "Take a photo of the QR"}
        </button>
        <label style={styles.label}>
          Or paste the pairing URL
          <input
            style={styles.input}
            type="url"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            placeholder="http://192.168.1.20:13773/#token=..."
            value={pairingUrl}
            onChange={(event) => setPairingUrl(event.target.value)}
          />
        </label>
        <button
          type="button"
          style={styles.secondaryButton}
          disabled={busy !== null || pairingUrl.trim().length === 0}
          onClick={() => void paste()}
        >
          {busy === "paste" ? "Connecting..." : "Connect"}
        </button>
        {error !== null ? <p style={styles.error}>{error}</p> : null}
      </section>
    </main>
  );
}

const styles = {
  main: { display: "grid", gap: 20 },
  h1: { margin: 0, fontSize: 20 },
  h2: { margin: "0 0 8px", fontSize: 16 },
  muted: { margin: "4px 0", color: "#a3a3a3", fontSize: 14 },
  error: { margin: "8px 0 0", color: "#f87171", fontSize: 14 },
  list: { listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 },
  row: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: 12,
    borderRadius: 10,
    background: "#2e2e2e",
  },
  rowTitle: { fontWeight: 600 },
  label: { display: "grid", gap: 6, marginTop: 12, fontSize: 14, color: "#a3a3a3" },
  sliderCaption: { display: "flex", justifyContent: "space-between", fontSize: 13 },
  mutedInline: { color: "#737373" },
  slider: { width: "100%", margin: 0, accentColor: "#e5e5e5" },
  checkbox: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
    fontSize: 14,
    color: "#e5e5e5",
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    padding: 10,
    borderRadius: 8,
    border: "1px solid #444",
    background: "#1a1a1a",
    color: "#e5e5e5",
    fontSize: 15,
  },
  primaryButton: {
    width: "100%",
    padding: 12,
    borderRadius: 10,
    border: "none",
    background: "#e5e5e5",
    color: "#111",
    fontSize: 15,
    fontWeight: 600,
  },
  secondaryButton: {
    marginTop: 8,
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid #555",
    background: "transparent",
    color: "#e5e5e5",
    fontSize: 14,
  },
} satisfies Record<string, CSSProperties>;
