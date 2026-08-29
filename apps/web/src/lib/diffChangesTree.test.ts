import { describe, expect, it } from "vite-plus/test";

import { buildDiffChangesTreeModel, diffChangeStatusFromType } from "./diffChangesTree";

describe("diffChangeStatusFromType", () => {
  it("maps @pierre/diffs file types onto git-like statuses", () => {
    expect(diffChangeStatusFromType("new")).toBe("added");
    expect(diffChangeStatusFromType("deleted")).toBe("deleted");
    expect(diffChangeStatusFromType("rename-pure")).toBe("renamed");
    expect(diffChangeStatusFromType("rename-changed")).toBe("renamed");
    expect(diffChangeStatusFromType("change")).toBe("modified");
    expect(diffChangeStatusFromType("anything-else")).toBe("modified");
  });
});

describe("buildDiffChangesTreeModel", () => {
  it("maps each entry's path to its viewer key and status", () => {
    const { fileKeyByPath, statusByPath } = buildDiffChangesTreeModel([
      { path: "src/app.ts", fileKey: "key-app", status: "modified", additions: 3, deletions: 1 },
      { path: "README.md", fileKey: "key-readme", status: "added", additions: 4, deletions: 0 },
    ]);

    expect(fileKeyByPath.get("src/app.ts")).toBe("key-app");
    expect(fileKeyByPath.get("README.md")).toBe("key-readme");
    expect(statusByPath.get("src/app.ts")).toBe("modified");
    expect(statusByPath.get("README.md")).toBe("added");
  });

  it("carries per-file stats onto the file nodes", () => {
    const { nodes } = buildDiffChangesTreeModel([
      { path: "app.ts", fileKey: "key-app", status: "modified", additions: 5, deletions: 2 },
    ]);

    const fileNode = nodes.find((node) => node.kind === "file" && node.path === "app.ts");
    expect(fileNode?.kind).toBe("file");
    expect(fileNode?.stat).toEqual({ additions: 5, deletions: 2 });
  });

  it("groups nested paths under a directory whose key resolves for scrolling", () => {
    const { nodes, fileKeyByPath } = buildDiffChangesTreeModel([
      { path: "src/a.ts", fileKey: "key-a", status: "added", additions: 1, deletions: 0 },
      { path: "src/b.ts", fileKey: "key-b", status: "deleted", additions: 0, deletions: 9 },
    ]);

    const directory = nodes.find((node) => node.kind === "directory");
    expect(directory?.kind).toBe("directory");
    expect(directory && directory.kind === "directory" ? directory.children.length : 0).toBe(2);
    expect(fileKeyByPath.get("src/a.ts")).toBe("key-a");
    expect(fileKeyByPath.get("src/b.ts")).toBe("key-b");
  });
});
