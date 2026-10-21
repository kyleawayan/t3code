import { registerCustomTheme, type DiffsTheme } from "@pierre/diffs";

type Theme = NonNullable<DiffsTheme["zed"]>;

export const XCODE_THEME_NAMES = {
  light: "xcode-hc-light",
  dark: "xcode-hc-dark",
} as const;

interface XcodePalette {
  readonly background: string;
  readonly foreground: string;
  readonly selection: string;
  readonly comment: string;
  readonly string: string;
  readonly number: string;
  readonly keyword: string;
  readonly function: string;
  readonly method: string;
  readonly type: string;
  readonly attribute: string;
  readonly link: string;
  readonly emphasis: string;
}

const LIGHT: XcodePalette = {
  background: "#ffffff",
  foreground: "#000000",
  selection: "#b3d7ff",
  comment: "#1f6300",
  string: "#ad1705",
  number: "#272ad8",
  keyword: "#9a218f",
  function: "#355d61",
  method: "#703daa",
  type: "#441ea1",
  attribute: "#6e5400",
  link: "#004fc9",
  emphasis: "#9f3325",
};

const DARK: XcodePalette = {
  background: "#1f1f24",
  foreground: "#ffffff",
  selection: "#3f638b",
  comment: "#8dbf67",
  string: "#ff8a7a",
  number: "#d9c668",
  keyword: "#ff85b8",
  function: "#83c9bc",
  method: "#cda1ff",
  type: "#e5cfff",
  attribute: "#e8b68b",
  link: "#63b7ff",
  emphasis: "#ff877a",
};

// Highlights resolves a scope by its longest registered prefix, so `keyword` also styles
// `keyword.control` and `keyword.import`. Operators stay plain, as in Xcode.
function xcodeTheme(name: string, appearance: "light" | "dark", p: XcodePalette): Theme {
  const keyword = { color: p.keyword, font_weight: 700 };
  return {
    name,
    appearance,
    style: {
      background: p.background,
      text: p.foreground,
      "editor.background": p.background,
      "editor.foreground": p.foreground,
      players: [{ cursor: p.foreground, selection: p.selection, background: p.foreground }],
      syntax: {
        comment: { color: p.comment },
        string: { color: p.string },
        "string.special.symbol": { color: p.string },
        number: { color: p.number },
        keyword,
        "keyword.operator": { color: p.foreground },
        operator: { color: p.foreground },
        boolean: keyword,
        "constant.builtin": keyword,
        "variable.special": keyword,
        tag: keyword,
        "tag.component.jsx": { color: p.type },
        function: { color: p.function },
        constant: { color: p.function },
        "function.method": { color: p.method },
        type: { color: p.type },
        constructor: { color: p.type },
        namespace: { color: p.type },
        enum: { color: p.type },
        attribute: { color: p.attribute },
        link_text: { color: p.link },
        link_uri: { color: p.link },
        "text.literal": { color: p.link },
        emphasis: { color: p.emphasis, font_style: "italic" },
        "emphasis.strong": { color: p.emphasis, font_weight: 700 },
      },
    },
  };
}

// Themes resolve on the main thread and reach the diff workers already resolved.
registerCustomTheme(
  XCODE_THEME_NAMES.light,
  async () => xcodeTheme(XCODE_THEME_NAMES.light, "light", LIGHT),
  "zed",
);
registerCustomTheme(
  XCODE_THEME_NAMES.dark,
  async () => xcodeTheme(XCODE_THEME_NAMES.dark, "dark", DARK),
  "zed",
);
