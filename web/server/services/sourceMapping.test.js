import { describe, it, expect, vi, beforeEach } from "vitest";
import { discoverDirectedOutputs, buildSourceMapping } from "./sourceMapping.js";
import fs from "node:fs/promises";
import path from "node:path";

vi.mock("node:fs/promises");

const PROJECT_PATH = "/fake/project";

function mockReadFile(fileMap) {
  fs.readFile.mockImplementation(async (filePath) => {
    const key = path.relative(PROJECT_PATH, filePath).replace(/\\/g, "/");
    if (fileMap[key] !== undefined) {
      return typeof fileMap[key] === "string" ? fileMap[key] : JSON.stringify(fileMap[key]);
    }
    throw Object.assign(new Error(`ENOENT: ${filePath}`), { code: "ENOENT" });
  });
}

function mockReaddir(dirMap) {
  fs.readdir.mockImplementation(async (dirPath, opts) => {
    const key = path.relative(PROJECT_PATH, dirPath).replace(/\\/g, "/");
    if (dirMap[key]) {
      return dirMap[key].map((name) => ({
        name,
        isDirectory: () => name.indexOf(".") === -1,
        isFile: () => name.indexOf(".") !== -1,
      }));
    }
    throw Object.assign(new Error(`ENOENT: ${dirPath}`), { code: "ENOENT" });
  });
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("discoverDirectedOutputs", () => {
  it("uses manifest.directed_outputs when populated", async () => {
    mockReadFile({
      ".build/manifest.json": {
        directed_outputs: ["outputs_ai/report_a.md", "outputs_ai/report_b.md"],
      },
    });

    const result = await discoverDirectedOutputs(PROJECT_PATH);

    expect(result.source).toBe("manifest");
    expect(result.outputs).toEqual(["outputs_ai/report_a.md", "outputs_ai/report_b.md"]);
  });

  it("falls back to topics.json when manifest.directed_outputs is empty", async () => {
    mockReadFile({
      ".build/manifest.json": { directed_outputs: [] },
      ".build/topics.json": {
        topics: [
          { id: "topic_a", outputs: ["outputs_ai/reports/dashboard.md"] },
          { id: "topic_b", outputs: ["outputs_ai/reports/tracker.md", "outputs_ai/reports/dashboard.md"] },
          { id: "topic_c", outputs: [] },
        ],
      },
    });

    const result = await discoverDirectedOutputs(PROJECT_PATH);

    expect(result.source).toBe("topics");
    expect(result.outputs).toEqual([
      "outputs_ai/reports/dashboard.md",
      "outputs_ai/reports/tracker.md",
    ]);
  });

  it("deduplicates outputs from topics.json", async () => {
    mockReadFile({
      ".build/manifest.json": { directed_outputs: [] },
      ".build/topics.json": {
        topics: [
          { id: "t1", outputs: ["outputs_ai/reports/rbi.md"] },
          { id: "t2", outputs: ["outputs_ai/reports/rbi.md"] },
          { id: "t3", outputs: ["outputs_ai/reports/rbi.md", "outputs_ai/reports/tracker.md"] },
        ],
      },
    });

    const result = await discoverDirectedOutputs(PROJECT_PATH);

    expect(result.source).toBe("topics");
    expect(result.outputs).toEqual([
      "outputs_ai/reports/rbi.md",
      "outputs_ai/reports/tracker.md",
    ]);
  });

  it("falls back to disk scan when both manifest and topics are empty", async () => {
    mockReadFile({
      ".build/manifest.json": { directed_outputs: [] },
      ".build/topics.json": { topics: [] },
    });
    mockReaddir({
      "outputs_ai": [{ name: "wiki" }, { name: "strategy_report.md" }],
    });
    // Override readdir to return proper dirent-like objects
    fs.readdir.mockImplementation(async (dirPath) => {
      const key = path.relative(PROJECT_PATH, dirPath).replace(/\\/g, "/");
      if (key === "outputs_ai") {
        return [
          { name: "wiki", isDirectory: () => true, isFile: () => false },
          { name: "strategy_report.md", isDirectory: () => false, isFile: () => true },
        ];
      }
      if (key === "outputs_ai/wiki") {
        return [
          { name: "_index.md", isDirectory: () => false, isFile: () => true },
        ];
      }
      throw Object.assign(new Error(`ENOENT`), { code: "ENOENT" });
    });

    const result = await discoverDirectedOutputs(PROJECT_PATH);

    expect(result.source).toBe("disk");
    expect(result.outputs).toEqual(["outputs_ai/strategy_report.md"]);
  });

  it("returns empty when no sources have outputs", async () => {
    mockReadFile({
      ".build/manifest.json": { directed_outputs: [] },
      ".build/topics.json": { topics: [{ id: "t1", outputs: [] }] },
    });
    fs.readdir.mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));

    const result = await discoverDirectedOutputs(PROJECT_PATH);

    expect(result.outputs).toEqual([]);
  });

  it("handles missing manifest gracefully", async () => {
    fs.readFile.mockImplementation(async (filePath) => {
      const key = path.relative(PROJECT_PATH, filePath).replace(/\\/g, "/");
      if (key === ".build/topics.json") {
        return JSON.stringify({
          topics: [{ id: "t1", outputs: ["outputs_ai/report.md"] }],
        });
      }
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    });

    const result = await discoverDirectedOutputs(PROJECT_PATH);

    expect(result.source).toBe("topics");
    expect(result.outputs).toEqual(["outputs_ai/report.md"]);
  });

  it("skips blank/whitespace output strings from topics", async () => {
    mockReadFile({
      ".build/manifest.json": { directed_outputs: [] },
      ".build/topics.json": {
        topics: [
          { id: "t1", outputs: ["outputs_ai/real.md", "", "  ", null] },
        ],
      },
    });

    const result = await discoverDirectedOutputs(PROJECT_PATH);

    expect(result.source).toBe("topics");
    expect(result.outputs).toEqual(["outputs_ai/real.md"]);
  });
});

describe("buildSourceMapping", () => {
  it("returns discoverySource alongside the mapping", async () => {
    mockReadFile({
      ".build/manifest.json": {
        directed_outputs: ["outputs_ai/report.md"],
        wiki_pages: ["page_a.md"],
      },
      ".build/topics.json": { topics: [] },
    });
    fs.readdir.mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));

    const result = await buildSourceMapping(PROJECT_PATH);

    expect(result.discoverySource).toBe("manifest");
    expect(result.mapping).toHaveProperty("outputs_ai/report.md");
    expect(result.mapping["outputs_ai/report.md"].wikiPages).toEqual(["page_a.md"]);
  });

  it("populates mapping from topics.json fallback", async () => {
    mockReadFile({
      ".build/manifest.json": { directed_outputs: [], wiki_pages: [] },
      ".build/topics.json": {
        topics: [{ id: "t1", outputs: ["outputs_ai/reports/dash.md"] }],
      },
    });
    fs.readdir.mockImplementation(async (dirPath) => {
      const key = path.relative(PROJECT_PATH, dirPath).replace(/\\/g, "/");
      if (key === "outputs_ai/wiki") {
        return [{ name: "topic.md", isDirectory: () => false, isFile: () => true }];
      }
      if (key === "sources/digests") {
        return [{ name: "src1.md", isDirectory: () => false, isFile: () => true }];
      }
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    });

    const result = await buildSourceMapping(PROJECT_PATH);

    expect(result.discoverySource).toBe("topics");
    expect(Object.keys(result.mapping)).toEqual(["outputs_ai/reports/dash.md"]);
    expect(result.mapping["outputs_ai/reports/dash.md"].wikiPages).toContain("outputs_ai/wiki/topic.md");
  });
});
