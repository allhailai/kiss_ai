import { describe, expect, it } from "vitest";
import type { ProjectFile } from "../contracts/api";
import {
  buildFileTree,
  fileBasename,
  getAncestorDirectoryKeys,
  humanizeFilePath,
  humanizePathSegment,
  labeledFileDisplayName,
  projectFileDisplayName,
  uniqueByPathPreserveFirst,
  uniqueFiles,
} from "./files";

function makeFile(path: string, overrides?: Partial<ProjectFile>): ProjectFile {
  return {
    path,
    name: path,
    kind: "human",
    editable: true,
    annotation: false,
    ...overrides,
  };
}

describe("buildFileTree", () => {
  it("builds a flat list from root-level files", () => {
    const tree = buildFileTree([makeFile("readme.md"), makeFile("project.md")]);
    expect(tree).toHaveLength(2);
    expect(tree.every((node) => node.type === "file")).toBe(true);
  });

  it("nests files in directories", () => {
    const tree = buildFileTree([makeFile("inputs_human/notes.md", { name: "inputs_human/notes.md" })]);
    expect(tree).toHaveLength(1);
    expect(tree[0].type).toBe("directory");
    if (tree[0].type === "directory") {
      expect(tree[0].name).toBe("inputs_human");
      expect(tree[0].children).toHaveLength(1);
      expect(tree[0].children[0].name).toBe("notes.md");
    }
  });

  it("sorts directories before files", () => {
    const tree = buildFileTree([
      makeFile("zzz.md"),
      makeFile("aaa/file.md", { name: "aaa/file.md" }),
    ]);
    expect(tree[0].type).toBe("directory");
    expect(tree[1].type).toBe("file");
  });

  it("injects empty directories", () => {
    const emptyDirectories = [
      { path: "inputs_human/a", name: "a" },
      { path: "inputs_human/b", name: "b" }
    ];
    const tree = buildFileTree([], emptyDirectories);

    expect(tree).toEqual([
      {
        type: "directory",
        key: "a",
        name: "a",
        fullPath: "inputs_human/a",
        children: [],
      },
      {
        type: "directory",
        key: "b",
        name: "b",
        fullPath: "inputs_human/b",
        children: [],
      },
    ]);
  });

  it("does not duplicate existing directories from empty directories list", () => {
    const tree = buildFileTree(
      [makeFile("mydir/file.md", { name: "mydir/file.md" })],
      [{ path: "mydir", name: "mydir" }],
    );
    const dirs = tree.filter((n) => n.type === "directory" && n.name === "mydir");
    expect(dirs).toHaveLength(1);
  });
});

describe("getAncestorDirectoryKeys", () => {
  it("returns empty for root-level files", () => {
    expect(getAncestorDirectoryKeys("file.md")).toEqual([]);
  });

  it("returns ancestor keys for nested files", () => {
    expect(getAncestorDirectoryKeys("a/b/c/file.md")).toEqual(["a", "a/b", "a/b/c"]);
  });
});

describe("uniqueFiles", () => {
  it("deduplicates by path, sorted", () => {
    const result = uniqueFiles([makeFile("b.md"), makeFile("a.md"), makeFile("b.md")]);
    expect(result).toHaveLength(2);
    expect(result[0].path).toBe("a.md");
    expect(result[1].path).toBe("b.md");
  });
});

describe("uniqueByPathPreserveFirst", () => {
  it("keeps the first occurrence", () => {
    const result = uniqueByPathPreserveFirst([
      { path: "a.md", label: "first" },
      { path: "a.md", label: "second" },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe("first");
  });
});

describe("fileBasename", () => {
  it("extracts filename from path", () => {
    expect(fileBasename("a/b/file.md")).toBe("file.md");
  });

  it("returns the input for root-level files", () => {
    expect(fileBasename("readme.md")).toBe("readme.md");
  });
});

describe("projectFileDisplayName", () => {
  it("uses name when available", () => {
    expect(projectFileDisplayName({ name: "My File", path: "path.md" })).toBe("My File");
  });

  it("falls back to basename of path", () => {
    expect(projectFileDisplayName({ name: "", path: "dir/file.md" })).toBe("file.md");
  });
});

describe("labeledFileDisplayName", () => {
  it("uses label when available", () => {
    expect(labeledFileDisplayName({ label: "Custom Label", path: "p.md" })).toBe("Custom Label");
  });

  it("falls back to path", () => {
    expect(labeledFileDisplayName({ path: "dir/file.md" })).toBe("dir/file.md");
  });
});

describe("humanizePathSegment", () => {
  it("replaces underscores with spaces and capitalizes", () => {
    expect(humanizePathSegment("my_file_name.md")).toBe("MY File Name");
  });

  it("handles camelCase", () => {
    expect(humanizePathSegment("myFileName")).toBe("MY File Name");
  });

  it("returns original for empty after processing", () => {
    expect(humanizePathSegment(".md")).toBe(".md");
  });
});

describe("humanizeFilePath", () => {
  it("humanizes each segment and joins with /", () => {
    const result = humanizeFilePath("outputs_ai/reports/my_report.md");
    expect(result).toContain(" / ");
  });
});
