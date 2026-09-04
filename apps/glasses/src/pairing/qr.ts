import jsQR from "jsqr";

const MAX_DECODE_EDGE = 1200;

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", () => reject(new Error("Could not read the captured photo.")));
    image.src = dataUrl;
  });
}

/**
 * The Even App exposes a camera capture but no barcode scanner, so the desktop
 * pairing QR is decoded here from the photo. Downscaled to keep jsQR quick on
 * the phone; a pairing QR is large enough that 1200px still resolves it.
 */
export async function decodeQrFromBase64(base64: string, mimeType: string): Promise<string | null> {
  const image = await loadImage(`data:${mimeType};base64,${base64}`);
  const scale = Math.min(1, MAX_DECODE_EDGE / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (context === null) {
    throw new Error("Canvas is unavailable in this WebView.");
  }
  context.drawImage(image, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height);
  const result = jsQR(pixels.data, width, height, { inversionAttempts: "attemptBoth" });
  return result?.data ?? null;
}

/**
 * Mirrors the mobile scanner: a `t3code://` deep link wraps the pairing URL in
 * a `pairingUrl` query param; anything else is treated as the pairing URL itself.
 */
export function pairingUrlFromQrPayload(payload: string): string {
  const trimmed = payload.trim();
  try {
    const url = new URL(trimmed);
    if (url.protocol === "t3code:") {
      const pairingUrl = url.searchParams.get("pairingUrl")?.trim() ?? "";
      if (pairingUrl.length > 0) {
        return pairingUrl;
      }
    }
  } catch {
    // Not a URL; let the pairing validation report it.
  }
  return trimmed;
}
