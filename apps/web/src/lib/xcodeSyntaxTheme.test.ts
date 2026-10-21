import { disposeHighlighter, getSharedHighlighter } from "@pierre/diffs";
import { afterAll, describe, expect, it } from "vite-plus/test";

import { resolveDiffThemeName } from "./diffRendering";
import { PREFERRED_HIGHLIGHTER } from "./syntaxHighlighting";

describe("Xcode syntax themes", () => {
  afterAll(() => disposeHighlighter());

  it("serve every code surface in both appearances", () => {
    expect(resolveDiffThemeName("light")).toBe("xcode-hc-light");
    expect(resolveDiffThemeName("dark")).toBe("xcode-hc-dark");
  });

  it("color code through the Highlights engine", async () => {
    const highlighter = await getSharedHighlighter({
      themes: [resolveDiffThemeName("light"), resolveDiffThemeName("dark")],
      langs: ["typescript"],
      preferredHighlighter: PREFERRED_HIGHLIGHTER,
    });
    const colorOf = (theme: "light" | "dark", content: string) =>
      highlighter
        .codeToTokens('const name = "x"; // note', {
          lang: "typescript",
          theme: resolveDiffThemeName(theme),
        })
        .tokens.flat()
        .find((token) => token.content.includes(content))
        ?.color?.toLowerCase();

    expect(colorOf("light", "const")).toBe("#9a218f");
    expect(colorOf("light", '"x"')).toBe("#ad1705");
    expect(colorOf("dark", "note")).toBe("#8dbf67");
  });
});
