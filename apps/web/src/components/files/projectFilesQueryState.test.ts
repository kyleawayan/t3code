import type { ProjectReadFileResult } from "@t3tools/contracts";
import { EnvironmentId } from "@t3tools/contracts";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  clearProjectFileQueryData,
  confirmProjectFileQueryData,
  getOptimisticProjectFileQueryData,
  resolveProjectFileQueryData,
  setProjectFileQueryData,
  shouldRefreshOpenFile,
} from "./projectFilesQueryState";

const environmentId = EnvironmentId.make("environment-project-files-query-test");

describe("project files queries", () => {
  afterEach(() => {
    clearProjectFileQueryData(environmentId, "/repo", "convex.json");
    vi.unstubAllGlobals();
  });

  it("keeps the latest optimistic draft when an older write finishes", () => {
    vi.stubGlobal("window", {});
    const initial = {
      relativePath: "convex.json",
      contents: '{"nodeVersion":"20"}',
      byteLength: 20,
      truncated: false,
    } satisfies ProjectReadFileResult;
    setProjectFileQueryData(environmentId, "/repo", "convex.json", '{"nodeVersion":"220"}');
    setProjectFileQueryData(environmentId, "/repo", "convex.json", '{"nodeVersion":"22"}');

    expect(getOptimisticProjectFileQueryData(environmentId, "/repo", "convex.json")?.contents).toBe(
      '{"nodeVersion":"22"}',
    );

    expect(
      confirmProjectFileQueryData(environmentId, "/repo", "convex.json", '{"nodeVersion":"220"}'),
    ).toBe(false);

    expect(resolveProjectFileQueryData(environmentId, "/repo", "convex.json", initial)).toEqual({
      relativePath: "convex.json",
      contents: '{"nodeVersion":"22"}',
      byteLength: 20,
      truncated: false,
    });

    expect(
      confirmProjectFileQueryData(environmentId, "/repo", "convex.json", '{"nodeVersion":"22"}'),
    ).toBe(true);
  });
});

describe("shouldRefreshOpenFile", () => {
  it("refreshes when the open file is among the turn's changed paths", () => {
    expect(
      shouldRefreshOpenFile({
        openPath: "src/app.ts",
        isDirty: false,
        changedPaths: ["src/app.ts", "README.md"],
      }),
    ).toBe(true);
  });

  it("does not refresh when the open file was not changed", () => {
    expect(
      shouldRefreshOpenFile({
        openPath: "src/app.ts",
        isDirty: false,
        changedPaths: ["README.md"],
      }),
    ).toBe(false);
  });

  it("does not refresh while the open file has an unsaved edit", () => {
    expect(
      shouldRefreshOpenFile({
        openPath: "src/app.ts",
        isDirty: true,
        changedPaths: ["src/app.ts"],
      }),
    ).toBe(false);
  });

  it("does not refresh when no file is open", () => {
    expect(
      shouldRefreshOpenFile({ openPath: null, isDirty: false, changedPaths: ["src/app.ts"] }),
    ).toBe(false);
  });
});
