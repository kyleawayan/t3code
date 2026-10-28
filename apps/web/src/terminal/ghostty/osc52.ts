// tmux with `set-clipboard on` copies by emitting OSC 52 (ESC ] 52 ; <targets> ; <base64>,
// ended by BEL or ST). The Ghostty WASM parses it without exposing the payload, so the
// pty stream is scanned here.
const OSC52_MAX_PAYLOAD = 1_048_576; // about 768 KiB of text; larger payloads are dropped, never truncated

export function decodeOsc52Payload(payload: string): string | null {
  // Some emitters omit the "=" padding, which atob rejects.
  const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
  try {
    const bytes = Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

export class Osc52ClipboardWatcher {
  private state: "ground" | "esc" | "osc" | "oscEsc" = "ground";
  private buffer = "";
  private dropped = false;

  constructor(private readonly onClipboardText: (text: string) => void) {}

  reset(): void {
    this.state = "ground";
    this.buffer = "";
    this.dropped = false;
  }

  scan(data: string): void {
    for (let index = 0; index < data.length; index += 1) {
      const code = data.charCodeAt(index);
      switch (this.state) {
        case "ground":
          if (code === 0x1b) this.state = "esc";
          break;
        case "esc":
          if (code === 0x5d) {
            this.state = "osc";
            this.buffer = "";
            this.dropped = false;
          } else {
            this.state = code === 0x1b ? "esc" : "ground";
          }
          break;
        case "osc":
          if (code === 0x07) this.finish();
          else if (code === 0x1b) this.state = "oscEsc";
          else this.collect(data[index]!);
          break;
        case "oscEsc":
          if (code === 0x5c) this.finish();
          else this.state = code === 0x1b ? "esc" : "ground";
          break;
      }
    }
  }

  private collect(char: string): void {
    if (this.dropped) return;
    // Checks only the short prefix: startsWith on the growing buffer would be O(n²) over a paste.
    if (this.buffer.length < 3) {
      this.buffer += char;
      if (!"52;".startsWith(this.buffer)) {
        this.buffer = "";
        this.dropped = true;
      }
      return;
    }
    if (this.buffer.length >= OSC52_MAX_PAYLOAD) {
      this.buffer = "";
      this.dropped = true;
      return;
    }
    this.buffer += char;
  }

  private finish(): void {
    const buffer = this.buffer;
    this.state = "ground";
    this.buffer = "";
    if (this.dropped || !buffer.startsWith("52;")) return;
    const payloadStart = buffer.indexOf(";", 3);
    if (payloadStart === -1) return;
    const payload = buffer.slice(payloadStart + 1);
    // "?" asks to read the clipboard; answering would leak it to the running program.
    if (payload === "?" || payload.length === 0) return;
    const text = decodeOsc52Payload(payload);
    if (text !== null && text.length > 0) this.onClipboardText(text);
  }
}
