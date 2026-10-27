import { describe, expect, it } from "vite-plus/test";

import { isObsidianVaultCandidate, obsidianNoteTitle } from "./obsidianPath";

describe("isObsidianVaultCandidate", () => {
  it("accepts markdown in Obsidian's iCloud folder and in general iCloud Drive", () => {
    expect(
      isObsidianVaultCandidate(
        "/Users/me/Library/Mobile Documents/iCloud~md~obsidian/Documents/Work/Plan.md",
      ),
    ).toBe(true);
    expect(
      isObsidianVaultCandidate(
        "/Users/me/Library/Mobile Documents/com~apple~CloudDocs/Notes/Ideas.md",
      ),
    ).toBe(true);
  });

  it("leaves files outside iCloud to the preferred editor", () => {
    expect(isObsidianVaultCandidate("/Users/me/Documents/Projects/app/README.md")).toBe(false);
    expect(isObsidianVaultCandidate("C:\\Users\\me\\notes.md")).toBe(false);
  });
});

describe("obsidianNoteTitle", () => {
  it("names the note after its file, without the extension", () => {
    expect(
      obsidianNoteTitle(
        "/Users/me/Library/Mobile Documents/iCloud~md~obsidian/Documents/Work/Weekly review.md",
      ),
    ).toBe("Weekly review");
    expect(obsidianNoteTitle("/Users/me/Library/Mobile Documents/x/Notes.v2.MD")).toBe("Notes.v2");
  });
});
