import { describe, expect, it } from "vite-plus/test";

import { decodeOsc52Payload, Osc52ClipboardWatcher } from "./osc52";

const base64 = (text: string) => btoa(String.fromCharCode(...new TextEncoder().encode(text)));

const osc52 = (text: string, targets = "c", terminator = "\x07") =>
  `\x1b]52;${targets};${base64(text)}${terminator}`;

describe("decodeOsc52Payload", () => {
  it("decodes UTF-8 base64", () => {
    expect(decodeOsc52Payload(base64("héllo → 世界"))).toBe("héllo → 世界");
  });

  it("accepts unpadded base64", () => {
    expect(decodeOsc52Payload("YWI")).toBe("ab");
  });

  it("returns null for invalid base64", () => {
    expect(decodeOsc52Payload("not valid !!")).toBeNull();
  });
});

describe("Osc52ClipboardWatcher", () => {
  const collect = () => {
    const texts: string[] = [];
    return { texts, watcher: new Osc52ClipboardWatcher((text) => texts.push(text)) };
  };

  it("reports BEL- and ST-terminated sequences", () => {
    const { texts, watcher } = collect();
    watcher.scan(osc52("hello world"));
    watcher.scan(osc52("via ST", "c", "\x1b\\"));
    expect(texts).toEqual(["hello world", "via ST"]);
  });

  it("reassembles a sequence split across chunks", () => {
    const { texts, watcher } = collect();
    const sequence = osc52("fragmented tmux output");
    for (let index = 0; index < sequence.length; index += 3) {
      watcher.scan(sequence.slice(index, index + 3));
    }
    expect(texts).toEqual(["fragmented tmux output"]);
  });

  it("handles several sequences in one chunk and an empty target", () => {
    const { texts, watcher } = collect();
    watcher.scan(`${osc52("first")}${osc52("second", "")}`);
    expect(texts).toEqual(["first", "second"]);
  });

  it("ignores other OSC sequences, read queries, and empty payloads", () => {
    const { texts, watcher } = collect();
    watcher.scan("\x1b]0;window title\x07\x1b]52;c;?\x07\x1b]52;c;\x07");
    expect(texts).toEqual([]);
  });

  it("drops a payload over the size cap", () => {
    const { texts, watcher } = collect();
    watcher.scan(`\x1b]52;c;${"A".repeat(2_000_000)}\x07`);
    expect(texts).toEqual([]);
  });

  it("discards partial state on reset", () => {
    const { texts, watcher } = collect();
    watcher.scan("\x1b]52;c;aGVs");
    watcher.reset();
    watcher.scan("bG8=\x07");
    expect(texts).toEqual([]);
  });
});
