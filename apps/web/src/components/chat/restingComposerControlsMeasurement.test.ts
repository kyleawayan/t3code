import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  resolveRestingComposerControlsLayout,
  resolveRestingComposerControlsNaturalWidth,
} from "../composerFooterLayout";
import {
  measureComposerFooterControls,
  measureRestingComposerControls,
} from "./restingComposerControlsMeasurement";

// A 100px picker whose label is squished into 40px. At full scale the label
// is 90px; its widest sizer run, the floor it squishes down to, is 46px.
function measurePicker(input: { minWidth?: string; maxWidth?: string } = {}) {
  const squishText = {
    offsetWidth: 40,
    querySelector: () => ({ offsetWidth: 90 }),
    querySelectorAll: () => [{ offsetWidth: 44 }, { offsetWidth: 46 }],
  };
  const label = { matches: () => false, querySelector: () => squishText };
  const picker = {
    getBoundingClientRect: () => ({ width: 100 }),
    querySelector: () => label,
  };
  const controls = {
    querySelector: (selector: string) => {
      if (selector === "[data-chat-provider-model-picker]") return picker;
      if (selector === "[data-resting-controls-overflow]") {
        return { getBoundingClientRect: () => ({ width: 24 }) };
      }
      return null;
    },
    querySelectorAll: () => [{ getBoundingClientRect: () => ({ width: 140 }) }],
  };
  vi.stubGlobal("getComputedStyle", (element: unknown) => {
    if (element === picker) {
      return { minWidth: input.minWidth ?? "min-content", maxWidth: input.maxWidth ?? "none" };
    }
    return { columnGap: "4px" };
  });
  return measureRestingComposerControls(controls as unknown as HTMLElement)!;
}

afterEach(() => vi.unstubAllGlobals());

describe("measureRestingComposerControls", () => {
  it("recovers the full and squished widths of the model label", () => {
    const measurement = measurePicker();

    // 60px of icon, padding, and chevron, plus the label at each extreme.
    expect(measurement.naturalFixedWidth).toBe(150);
    expect(measurement.minimumFixedWidth).toBe(106);
    expect(resolveRestingComposerControlsNaturalWidth(measurement)).toBe(294);
  });

  it("moves blocks into overflow before hiding a picker that can still squish", () => {
    const measurement = measurePicker();

    expect(resolveRestingComposerControlsLayout({ ...measurement, hostWidth: 200 })).toEqual({
      hiddenCount: 1,
      visible: true,
    });
    // 106 + 24 + 4 = 134: the squished picker and the overflow menu no longer fit.
    expect(resolveRestingComposerControlsLayout({ ...measurement, hostWidth: 120 })).toEqual({
      hiddenCount: 1,
      visible: false,
    });
  });

  it("caps recovered text at the model picker's maximum width", () => {
    const measurement = measurePicker({ maxWidth: "120px" });

    expect(measurement.naturalFixedWidth).toBe(120);
    expect(measurement.minimumFixedWidth).toBe(106);
  });

  it("keeps a length min-width that holds the picker wider than its squished label", () => {
    expect(measurePicker({ minWidth: "110px" }).minimumFixedWidth).toBe(110);
  });
});

describe("measureComposerFooterControls", () => {
  // Each probed variant is two halves; its floor is the wider half.
  const variant = (...halves: number[]) => ({
    children: halves.map((offsetWidth) => ({ offsetWidth })),
  });
  const probe = (control: string, ...variants: ReturnType<typeof variant>[]) => ({
    dataset: { composerFooterLabel: control },
    querySelectorAll: () => variants,
  });
  const squishText = (rendered: number, natural: number) => ({
    matches: () => true,
    offsetWidth: rendered,
    querySelector: () => ({ offsetWidth: natural }),
    querySelectorAll: () => [],
  });

  it("reads each row control's width and the floors of its label variants", () => {
    const picker = {
      offsetWidth: 100,
      querySelector: (selector: string) =>
        selector === "[data-composer-footer-label]"
          ? probe("model", variant(44, 46), variant(26, 24))
          : squishText(40, 90),
    };
    const hiddenSeparator = { offsetWidth: 0 };
    const planToggle = { offsetWidth: 28, querySelector: () => null };
    const row = { clientWidth: 218, children: [picker, hiddenSeparator, planToggle] };
    vi.stubGlobal("getComputedStyle", (element: unknown) =>
      element === row
        ? { columnGap: "4px", paddingInlineStart: "14px", paddingInlineEnd: "4px" }
        : element === picker
          ? { position: "static", columnGap: "4px", marginInlineStart: "-6px" }
          : { position: "static" },
    );

    expect(measureComposerFooterControls(row as unknown as HTMLElement, null)).toEqual({
      availableWidth: 200,
      gap: 4,
      actionsGap: 0,
      controls: [
        { width: 94, label: { control: "model", rendered: 40, gap: 4, floors: [46, 26] } },
        { width: 28 },
      ],
    });
  });

  it("counts the icon-only runtime mode among the actions as the row's room", () => {
    const modeProbe = probe("mode", variant(14, 12), variant(0, 0));
    const runtimeMode = {
      offsetWidth: 30,
      querySelector: (selector: string) =>
        selector.startsWith("[data-composer-footer-label") ? modeProbe : null,
    };
    const attach = { offsetWidth: 32, querySelector: () => null };
    const actions = { children: [runtimeMode, attach] };
    const row = { clientWidth: 160, children: [] };
    vi.stubGlobal("getComputedStyle", (element: unknown) =>
      element === actions
        ? { columnGap: "8px" }
        : element === row
          ? { columnGap: "4px" }
          : { position: "static", columnGap: "4px" },
    );

    expect(
      measureComposerFooterControls(
        row as unknown as HTMLElement,
        actions as unknown as HTMLElement,
      ),
    ).toEqual({
      availableWidth: 198,
      gap: 4,
      actionsGap: 8,
      controls: [{ width: 30, label: { control: "mode", rendered: 0, gap: 4, floors: [14, 0] } }],
    });
  });
});
