import { DiffModel, LineDiffRangeCache, lineDiffRangesFor, parsePatchFiles } from "@pierre/diffs";
import { describe, expect, it } from "vite-plus/test";

// Fork: patches/@pierre__diffs@*.patch gates word diffs like Zed. This fails when a library bump
// drops that hunk.
function wordRanges(removed: readonly string[], added: readonly string[]) {
  const patch = [
    "diff --git a/file.ts b/file.ts",
    "--- a/file.ts",
    "+++ b/file.ts",
    `@@ -1,${removed.length + 1} +1,${added.length + 1} @@`,
    " context",
    ...removed.map((line) => `-${line}`),
    ...added.map((line) => `+${line}`),
    "",
  ].join("\n");
  const file = parsePatchFiles(patch)[0]!.files[0]!;
  const model = DiffModel.fromDiff(file);
  const cache = new LineDiffRangeCache("word", 1_000);
  const hunk = file.hunks[0]!;
  return [
    ...removed.map((_, offset) =>
      lineDiffRangesFor(model, "deletions", hunk.deletionLineIndex + 1 + offset, cache),
    ),
    ...added.map((_, offset) =>
      lineDiffRangesFor(model, "additions", hunk.additionLineIndex + 1 + offset, cache),
    ),
  ];
}

const lines = (count: number, word: string) =>
  Array.from({ length: count }, (_, index) => `const value${index} = ${word};`);

describe("word diffs in the patched @pierre/diffs", () => {
  it("marks changes that swap up to five lines for as many lines", () => {
    expect(wordRanges(lines(1, "before"), lines(1, "after")).every((r) => r.length > 0)).toBe(true);
    expect(wordRanges(lines(5, "before"), lines(5, "after")).every((r) => r.length > 0)).toBe(true);
  });

  it("leaves changes that add or drop lines, or swap more than five, unmarked", () => {
    expect(wordRanges(lines(3, "before"), lines(1, "after")).flat()).toHaveLength(0);
    expect(wordRanges(lines(1, "before"), lines(3, "after")).flat()).toHaveLength(0);
    expect(wordRanges(lines(6, "before"), lines(6, "after")).flat()).toHaveLength(0);
  });
});
