import { describe, expect, it } from "vite-plus/test";

import { buildDiffChangesTreeModel } from "./diffChangesTree";

describe("buildDiffChangesTreeModel", () => {
  it("maps each entry's path to its viewer key", () => {
    const { fileKeyByPath } = buildDiffChangesTreeModel([
      { path: "src/app.ts", fileKey: "key-app", additions: 3, deletions: 1 },
      { path: "README.md", fileKey: "key-readme", additions: 0, deletions: 2 },
    ]);

    expect(fileKeyByPath.get("src/app.ts")).toBe("key-app");
    expect(fileKeyByPath.get("README.md")).toBe("key-readme");
  });

  it("carries per-file stats onto the file nodes", () => {
    const { nodes } = buildDiffChangesTreeModel([
      { path: "app.ts", fileKey: "key-app", additions: 5, deletions: 2 },
    ]);

    const fileNode = nodes.find((node) => node.kind === "file" && node.path === "app.ts");
    expect(fileNode?.kind).toBe("file");
    expect(fileNode?.stat).toEqual({ additions: 5, deletions: 2 });
  });

  it("groups nested paths under a directory whose key resolves for scrolling", () => {
    const { nodes, fileKeyByPath } = buildDiffChangesTreeModel([
      { path: "src/a.ts", fileKey: "key-a", additions: 1, deletions: 0 },
      { path: "src/b.ts", fileKey: "key-b", additions: 1, deletions: 0 },
    ]);

    const directory = nodes.find((node) => node.kind === "directory");
    expect(directory?.kind).toBe("directory");
    expect(directory && directory.kind === "directory" ? directory.children.length : 0).toBe(2);
    expect(fileKeyByPath.get("src/a.ts")).toBe("key-a");
    expect(fileKeyByPath.get("src/b.ts")).toBe("key-b");
  });
});
