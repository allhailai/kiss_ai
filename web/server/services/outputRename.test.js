import { describe, expect, it, vi, beforeEach } from "vitest";
import path from "node:path";

// Mock fs and gray-matter before importing the module under test
vi.mock("node:fs/promises", () => {
  const store = new Map();
  return {
    default: {
      readFile: vi.fn(async (filePath) => {
        const content = store.get(filePath);
        if (content === undefined) {
          const err = /** @type {any} */ (new Error(`ENOENT: no such file or directory, open '${filePath}'`));
          err.code = "ENOENT";
          throw err;
        }
        return content;
      }),
      writeFile: vi.fn(async (filePath, content) => {
        store.set(filePath, content);
      }),
      readdir: vi.fn(async (dirPath, options) => {
        const typedKey = `__dir_typed__${dirPath}`;
        if (options?.withFileTypes && store.has(typedKey)) {
          return store.get(typedKey);
        }
        const entries = store.get(`__dir__${dirPath}`);
        if (!entries) {
          const err = /** @type {any} */ (new Error(`ENOENT: no such file or directory, scandir '${dirPath}'`));
          err.code = "ENOENT";
          throw err;
        }
        return entries;
      }),
      access: vi.fn(async (filePath) => {
        if (!store.has(filePath)) {
          const err = /** @type {any} */ (new Error(`ENOENT: no such file or directory, access '${filePath}'`));
          err.code = "ENOENT";
          throw err;
        }
      }),
      rename: vi.fn(async (oldPath, newPath) => {
        const content = store.get(oldPath);
        if (content === undefined) {
          const err = /** @type {any} */ (new Error(`ENOENT: ${oldPath}`));
          err.code = "ENOENT";
          throw err;
        }
        store.set(newPath, content);
        store.delete(oldPath);
      }),
      mkdir: vi.fn(),
    },
    __store: store,
  };
});

// @ts-expect-error -- accessing mock-internal __store
const { __store: store } = await import("node:fs/promises");
const { renameOutput } = await import("./outputRename.js");

function setFile(filePath, content) {
  store.set(filePath, typeof content === "string" ? content : JSON.stringify(content, null, 2));
}

function setDir(dirPath, entries) {
  store.set(`__dir__${dirPath}`, entries);
}

function setDirWithTypes(dirPath, entries) {
  store.set(`__dir_typed__${dirPath}`, entries.map((e) => ({
    name: e.name,
    isDirectory: () => e.isDirectory,
    isFile: () => !e.isDirectory,
  })));
}

function getFile(filePath) {
  return store.get(filePath);
}

function getJson(filePath) {
  const raw = store.get(filePath);
  return raw ? JSON.parse(raw) : null;
}

const projectPath = "/test-project";
const buildDir = path.join(projectPath, ".build");
const reportsDir = path.join(projectPath, "outputs_ai", "reports");
const specsDir = path.join(projectPath, "artifacts", "artifact_specs");

describe("renameOutput", () => {
  beforeEach(() => {
    store.clear();
  });

  it("renames file on disk and updates content_ledger.json", async () => {
    const oldPath = "outputs_ai/reports/old_report.md";
    const newPath = "outputs_ai/reports/new_report.md";

    // File on disk
    setFile(path.join(projectPath, oldPath), "# Old Report");

    // Content ledger
    setFile(path.join(buildDir, "content_ledger.json"), {
      last_knowledge_build: "2026-05-27T10:00:00Z",
      output_builds: {
        [oldPath]: "2026-05-27T14:00:00Z",
        "outputs_ai/reports/other.md": "2026-05-27T12:00:00Z",
      },
    });

    // No other stores
    setDir(specsDir, []);
    setDir(reportsDir, ["new_report.md"]); // after rename

    const result = await renameOutput(projectPath, oldPath, newPath);

    // Disk: old gone, new exists
    expect(store.has(path.join(projectPath, oldPath))).toBe(false);
    expect(store.get(path.join(projectPath, newPath))).toBe("# Old Report");

    // Ledger: key moved, other keys unchanged
    const ledger = getJson(path.join(buildDir, "content_ledger.json"));
    expect(ledger.output_builds[newPath]).toBe("2026-05-27T14:00:00Z");
    expect(ledger.output_builds[oldPath]).toBeUndefined();
    expect(ledger.output_builds["outputs_ai/reports/other.md"]).toBe("2026-05-27T12:00:00Z");

    expect(result.updated.disk).toBe(true);
    expect(result.updated.ledger).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("updates topics.json outputs arrays", async () => {
    const oldPath = "outputs_ai/reports/old_report.md";
    const newPath = "outputs_ai/reports/new_report.md";

    setFile(path.join(projectPath, oldPath), "content");
    setFile(path.join(buildDir, "topics.json"), {
      version: 2,
      topics: [
        { id: "t1", outputs: [oldPath, "outputs_ai/reports/other.md"] },
        { id: "t2", outputs: [oldPath] },
        { id: "t3", outputs: ["outputs_ai/reports/unrelated.md"] },
      ],
    });
    setDir(specsDir, []);
    setDir(reportsDir, ["new_report.md"]);

    const result = await renameOutput(projectPath, oldPath, newPath);

    const topics = getJson(path.join(buildDir, "topics.json"));
    expect(topics.topics[0].outputs).toEqual([newPath, "outputs_ai/reports/other.md"]);
    expect(topics.topics[1].outputs).toEqual([newPath]);
    expect(topics.topics[2].outputs).toEqual(["outputs_ai/reports/unrelated.md"]);
    expect(result.updated.topics).toBe(2);
  });

  it("updates questions.json relatedFiles and appliedTo", async () => {
    const oldPath = "outputs_ai/reports/old_report.md";
    const newPath = "outputs_ai/reports/new_report.md";

    setFile(path.join(projectPath, oldPath), "content");
    setFile(path.join(buildDir, "questions.json"), {
      questions: [
        {
          id: "q1",
          relatedFiles: [oldPath, "other.md"],
          appliedTo: [oldPath],
        },
        {
          id: "q2",
          relatedFiles: ["unrelated.md"],
        },
      ],
    });
    setDir(specsDir, []);
    setDir(reportsDir, ["new_report.md"]);

    const result = await renameOutput(projectPath, oldPath, newPath);

    const questions = getJson(path.join(buildDir, "questions.json"));
    expect(questions.questions[0].relatedFiles).toEqual([newPath, "other.md"]);
    expect(questions.questions[0].appliedTo).toEqual([newPath]);
    expect(questions.questions[1].relatedFiles).toEqual(["unrelated.md"]);
    expect(result.updated.questions).toBe(2);
  });

  it("updates artifact spec sources and outputFile frontmatter", async () => {
    const oldPath = "outputs_ai/reports/old_report.md";
    const newPath = "outputs_ai/reports/new_report.md";

    setFile(path.join(projectPath, oldPath), "content");

    // Create an artifact spec with YAML frontmatter referencing the old path
    const specContent = [
      "---",
      "name: Test Artifact",
      "format: html",
      "sources:",
      `  - ${oldPath}`,
      "  - outputs_ai/wiki/topic.md",
      `outputFile: ${oldPath}`,
      "---",
      "",
      "## Goal",
      "",
      "Build a test artifact.",
      "",
    ].join("\n");

    setFile(path.join(specsDir, "test_artifact.artifact.md"), specContent);
    setDir(specsDir, ["test_artifact.artifact.md"]);
    setDir(reportsDir, ["new_report.md"]);

    const result = await renameOutput(projectPath, oldPath, newPath);

    // Re-read the spec and verify frontmatter was updated
    const updatedSpec = getFile(path.join(specsDir, "test_artifact.artifact.md"));
    expect(updatedSpec).toContain(newPath);
    expect(updatedSpec).not.toContain(oldPath);
    expect(result.updated.artifactSpecs).toEqual(["test_artifact.artifact.md"]);
  });

  it("updates markdown cross-links in sibling files", async () => {
    const oldPath = "outputs_ai/reports/old_report.md";
    const newPath = "outputs_ai/reports/new_report.md";

    setFile(path.join(projectPath, oldPath), "# Old Report");
    setFile(path.join(reportsDir, "sibling.md"), "See [old report](./old_report.md) for details.");
    setFile(path.join(reportsDir, "unrelated.md"), "No links here.");

    setDir(specsDir, []);
    setDir(reportsDir, ["new_report.md", "sibling.md", "unrelated.md"]);

    const result = await renameOutput(projectPath, oldPath, newPath);

    expect(getFile(path.join(reportsDir, "sibling.md"))).toBe("See [old report](./new_report.md) for details.");
    expect(getFile(path.join(reportsDir, "unrelated.md"))).toBe("No links here.");
    expect(result.updated.markdownLinks).toEqual(["sibling.md"]);
  });

  it("errors when old file does not exist", async () => {
    await expect(
      renameOutput(projectPath, "outputs_ai/reports/ghost.md", "outputs_ai/reports/new.md"),
    ).rejects.toThrow("Source file not found");
  });

  it("errors when new file already exists", async () => {
    setFile(path.join(projectPath, "outputs_ai/reports/old.md"), "old");
    setFile(path.join(projectPath, "outputs_ai/reports/existing.md"), "existing");

    await expect(
      renameOutput(projectPath, "outputs_ai/reports/old.md", "outputs_ai/reports/existing.md"),
    ).rejects.toThrow("Target file already exists");
  });

  it("errors when path is outside outputs_ai/", async () => {
    await expect(
      renameOutput(projectPath, "sources/old.md", "sources/new.md"),
    ).rejects.toThrow("Path must be within outputs_ai/");
  });

  it("errors when old and new paths are identical", async () => {
    await expect(
      renameOutput(projectPath, "outputs_ai/reports/same.md", "outputs_ai/reports/same.md"),
    ).rejects.toThrow("Old and new paths are identical");
  });

  it("leaves unrelated artifact specs unchanged", async () => {
    const oldPath = "outputs_ai/reports/old.md";
    const newPath = "outputs_ai/reports/new.md";

    setFile(path.join(projectPath, oldPath), "content");

    const unrelatedSpec = [
      "---",
      "name: Unrelated",
      "sources:",
      "  - outputs_ai/wiki/topic.md",
      "outputFile: outputs_ai/reports/other.md",
      "---",
      "",
      "Unrelated artifact.",
      "",
    ].join("\n");

    setFile(path.join(specsDir, "unrelated.artifact.md"), unrelatedSpec);
    setDir(specsDir, ["unrelated.artifact.md"]);
    setDir(reportsDir, ["new.md"]);

    const result = await renameOutput(projectPath, oldPath, newPath);

    const spec = getFile(path.join(specsDir, "unrelated.artifact.md"));
    expect(spec).toBe(unrelatedSpec);
    expect(result.updated.artifactSpecs).toEqual([]);
  });

  it("handles missing optional stores gracefully", async () => {
    const oldPath = "outputs_ai/reports/old.md";
    const newPath = "outputs_ai/reports/new.md";

    setFile(path.join(projectPath, oldPath), "content");
    // No ledger, no topics, no questions, no specs dir
    setDir(reportsDir, ["new.md"]);

    const result = await renameOutput(projectPath, oldPath, newPath);

    expect(result.updated.disk).toBe(true);
    expect(result.updated.ledger).toBe(false);
    expect(result.updated.topics).toBe(0);
    expect(result.updated.questions).toBe(0);
    expect(result.updated.artifactSpecs).toEqual([]);
    expect(result.updated.buildManifests).toBe(0);
    // Errors for missing stores are collected but don't throw
  });

  it("updates artifact build manifest sourcesUsed arrays", async () => {
    const oldPath = "outputs_ai/reports/old_report.md";
    const newPath = "outputs_ai/reports/new_report.md";

    setFile(path.join(projectPath, oldPath), "content");
    setDir(reportsDir, ["new_report.md"]);
    setDir(specsDir, []);

    const buildsDir = path.join(projectPath, "artifacts", "builds");
    setDirWithTypes(buildsDir, [
      { name: "my_artifact", isDirectory: true },
      { name: "unrelated_artifact", isDirectory: true },
    ]);

    // Manifest that references the old path
    const manifestPath = path.join(buildsDir, "my_artifact", ".artifact-manifest.json");
    setFile(manifestPath, {
      slug: "my_artifact",
      builtAt: "2026-05-27T10:00:00Z",
      sourcesUsed: [oldPath, "outputs_ai/wiki/topic.md"],
      format: "html",
    });

    // Manifest that does NOT reference the old path
    const unrelatedManifestPath = path.join(buildsDir, "unrelated_artifact", ".artifact-manifest.json");
    setFile(unrelatedManifestPath, {
      slug: "unrelated_artifact",
      builtAt: "2026-05-27T10:00:00Z",
      sourcesUsed: ["outputs_ai/wiki/other.md"],
      format: "html",
    });

    const result = await renameOutput(projectPath, oldPath, newPath);

    const updatedManifest = getJson(manifestPath);
    expect(updatedManifest.sourcesUsed).toEqual([newPath, "outputs_ai/wiki/topic.md"]);

    const untouchedManifest = getJson(unrelatedManifestPath);
    expect(untouchedManifest.sourcesUsed).toEqual(["outputs_ai/wiki/other.md"]);

    expect(result.updated.buildManifests).toBe(1);
  });
});
