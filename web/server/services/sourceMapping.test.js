import { describe, expect, it, vi, beforeEach } from "vitest";
import path from "node:path";

// Mock fs before importing the module under test
vi.mock("node:fs/promises", () => {
  const store = new Map();
  return {
    default: {
      readFile: vi.fn(async (filePath) => {
        const content = store.get(filePath);
        if (content === undefined) {
          const err = new Error(`ENOENT: no such file or directory, open '${filePath}'`);
          err.code = "ENOENT";
          throw err;
        }
        return content;
      }),
      readdir: vi.fn(async (dirPath, options) => {
        const entries = store.get(`__dir__${dirPath}`) ?? [];
        if (entries.length === 0 && !store.has(`__dir__${dirPath}`)) {
          const err = new Error(`ENOENT: no such file or directory, scandir '${dirPath}'`);
          err.code = "ENOENT";
          throw err;
        }
        return entries;
      }),
      writeFile: vi.fn(async (filePath, content) => {
        store.set(filePath, content);
      }),
      mkdir: vi.fn(),
      stat: vi.fn(),
    },
    // Expose for test setup
    __store: store,
  };
});

const { __store: store } = await import("node:fs/promises");
const { buildSourceMapping, discoverDirectedOutputs } = await import("./sourceMapping.js");

function setFile(filePath, content) {
  store.set(filePath, typeof content === "string" ? content : JSON.stringify(content));
}

function setDir(dirPath, entries) {
  store.set(`__dir__${dirPath}`, entries);
}

describe("buildSourceMapping", () => {
  const projectPath = "/test-project";
  const buildDir = path.join(projectPath, ".build");
  const wikiDir = path.join(projectPath, "outputs_ai", "wiki");
  const digestsDir = path.join(projectPath, "sources", "digests");

  beforeEach(() => {
    store.clear();
  });

  it("creates topic-aware mapping with related wiki pages and digests", async () => {
    // Set up manifest with wiki pages and directed outputs
    setFile(path.join(buildDir, "manifest.json"), {
      wiki_pages: ["outputs_ai/wiki/topic_a.md", "outputs_ai/wiki/topic_b.md", "outputs_ai/wiki/topic_c.md", "outputs_ai/wiki/_index.md"],
      directed_outputs: ["outputs_ai/reports/report_a.md", "outputs_ai/reports/report_b.md"],
    });

    // Set up topics.json with topic-to-output mapping
    setFile(path.join(buildDir, "topics.json"), {
      topics: [
        {
          id: "topic-a",
          label: "Topic A",
          wiki_page: "outputs_ai/wiki/topic_a.md",
          sources: [{ path: "sources/web_research/source_a1.md", relevance: 0.9 }],
          outputs: ["outputs_ai/reports/report_a.md"],
          depends_on: [],
        },
        {
          id: "topic-b",
          label: "Topic B",
          wiki_page: "outputs_ai/wiki/topic_b.md",
          sources: [{ path: "sources/web_research/source_b1.md", relevance: 0.8 }],
          outputs: ["outputs_ai/reports/report_b.md"],
          depends_on: [],
        },
        {
          id: "topic-c",
          label: "Topic C",
          wiki_page: "outputs_ai/wiki/topic_c.md",
          sources: [],
          outputs: [],
          depends_on: [],
        },
      ],
    });

    // Set up digest files on disk
    setDir(digestsDir, [
      { name: "source_a1.md", isDirectory: () => false },
      { name: "source_b1.md", isDirectory: () => false },
      { name: "source_c1.md", isDirectory: () => false },
    ]);

    const { mapping } = await buildSourceMapping(projectPath);

    // Report A should get topic_a's wiki page + _index.md, NOT topic_b or topic_c
    expect(mapping["outputs_ai/reports/report_a.md"].wikiPages).toContain("outputs_ai/wiki/topic_a.md");
    expect(mapping["outputs_ai/reports/report_a.md"].wikiPages).toContain("outputs_ai/wiki/_index.md");
    expect(mapping["outputs_ai/reports/report_a.md"].wikiPages).not.toContain("outputs_ai/wiki/topic_b.md");
    expect(mapping["outputs_ai/reports/report_a.md"].wikiPages).not.toContain("outputs_ai/wiki/topic_c.md");

    // Report A should get source_a1's digest, NOT source_b1
    const reportADigests = mapping["outputs_ai/reports/report_a.md"].digestFiles;
    expect(reportADigests.some((d) => d.endsWith("source_a1.md"))).toBe(true);
    expect(reportADigests.some((d) => d.endsWith("source_b1.md"))).toBe(false);

    // Report A should have topic metadata
    expect(mapping["outputs_ai/reports/report_a.md"].topicCount).toBe(1);
    expect(mapping["outputs_ai/reports/report_a.md"].topicIds).toEqual(["topic-a"]);

    // Report B should get topic_b's wiki page
    expect(mapping["outputs_ai/reports/report_b.md"].wikiPages).toContain("outputs_ai/wiki/topic_b.md");
    expect(mapping["outputs_ai/reports/report_b.md"].wikiPages).not.toContain("outputs_ai/wiki/topic_a.md");
  });

  it("includes discovery wiki pages for non-primary pages", async () => {
    setFile(path.join(buildDir, "manifest.json"), {
      wiki_pages: ["outputs_ai/wiki/topic_a.md", "outputs_ai/wiki/topic_b.md", "outputs_ai/wiki/_index.md"],
      directed_outputs: ["outputs_ai/reports/report_a.md"],
    });

    setFile(path.join(buildDir, "topics.json"), {
      topics: [
        {
          id: "topic-a",
          wiki_page: "outputs_ai/wiki/topic_a.md",
          sources: [],
          outputs: ["outputs_ai/reports/report_a.md"],
          depends_on: [],
        },
      ],
    });

    setDir(digestsDir, []);

    const { mapping } = await buildSourceMapping(projectPath);

    // topic_b should be in discovery inventory, not primary
    expect(mapping["outputs_ai/reports/report_a.md"].discoveryWikiPages).toContain("outputs_ai/wiki/topic_b.md");
    expect(mapping["outputs_ai/reports/report_a.md"].wikiPages).not.toContain("outputs_ai/wiki/topic_b.md");
  });

  it("includes dependency wiki pages in primary mapping", async () => {
    setFile(path.join(buildDir, "manifest.json"), {
      wiki_pages: ["outputs_ai/wiki/topic_a.md", "outputs_ai/wiki/topic_b.md", "outputs_ai/wiki/_index.md"],
      directed_outputs: ["outputs_ai/reports/report_a.md"],
    });

    setFile(path.join(buildDir, "topics.json"), {
      topics: [
        {
          id: "topic-a",
          wiki_page: "outputs_ai/wiki/topic_a.md",
          sources: [],
          outputs: ["outputs_ai/reports/report_a.md"],
          depends_on: ["topic-b"],
        },
        {
          id: "topic-b",
          wiki_page: "outputs_ai/wiki/topic_b.md",
          sources: [],
          outputs: [],
          depends_on: [],
        },
      ],
    });

    setDir(digestsDir, []);

    const { mapping } = await buildSourceMapping(projectPath);

    // topic_b's wiki page should be in primary (not discovery) because topic_a depends on it
    expect(mapping["outputs_ai/reports/report_a.md"].wikiPages).toContain("outputs_ai/wiki/topic_b.md");
    expect(mapping["outputs_ai/reports/report_a.md"].discoveryWikiPages).not.toContain("outputs_ai/wiki/topic_b.md");
  });

  it("always includes _index.md in primary mapping", async () => {
    setFile(path.join(buildDir, "manifest.json"), {
      wiki_pages: ["outputs_ai/wiki/topic_a.md", "outputs_ai/wiki/_index.md"],
      directed_outputs: ["outputs_ai/reports/report_a.md"],
    });

    setFile(path.join(buildDir, "topics.json"), {
      topics: [
        {
          id: "topic-a",
          wiki_page: "outputs_ai/wiki/topic_a.md",
          sources: [],
          outputs: ["outputs_ai/reports/report_a.md"],
          depends_on: [],
        },
      ],
    });

    setDir(digestsDir, []);

    const { mapping } = await buildSourceMapping(projectPath);

    expect(mapping["outputs_ai/reports/report_a.md"].wikiPages).toContain("outputs_ai/wiki/_index.md");
    expect(mapping["outputs_ai/reports/report_a.md"].discoveryWikiPages).not.toContain("outputs_ai/wiki/_index.md");
  });

  it("falls back to full context when no topic mapping exists", async () => {
    setFile(path.join(buildDir, "manifest.json"), {
      wiki_pages: ["outputs_ai/wiki/topic_a.md", "outputs_ai/wiki/_index.md"],
      directed_outputs: ["outputs_ai/reports/orphan_report.md"],
    });

    // topics.json exists but no topic maps to orphan_report.md
    setFile(path.join(buildDir, "topics.json"), {
      topics: [
        {
          id: "topic-a",
          wiki_page: "outputs_ai/wiki/topic_a.md",
          sources: [],
          outputs: ["outputs_ai/reports/other_report.md"],
          depends_on: [],
        },
      ],
    });

    setDir(digestsDir, [
      { name: "source_a.md", isDirectory: () => false },
    ]);

    const { mapping } = await buildSourceMapping(projectPath);

    // Orphan report should get ALL wiki pages and ALL digests
    expect(mapping["outputs_ai/reports/orphan_report.md"].wikiPages).toContain("outputs_ai/wiki/topic_a.md");
    expect(mapping["outputs_ai/reports/orphan_report.md"].wikiPages).toContain("outputs_ai/wiki/_index.md");
    expect(mapping["outputs_ai/reports/orphan_report.md"].digestFiles.length).toBe(1);
    // No discovery pages in fallback mode (everything is primary)
    expect(mapping["outputs_ai/reports/orphan_report.md"].discoveryWikiPages).toEqual([]);
  });

  it("falls back to full context when topics.json is missing", async () => {
    setFile(path.join(buildDir, "manifest.json"), {
      wiki_pages: ["outputs_ai/wiki/topic_a.md", "outputs_ai/wiki/_index.md"],
      directed_outputs: ["outputs_ai/reports/report_a.md"],
    });

    // No topics.json at all
    setDir(digestsDir, []);

    const { mapping } = await buildSourceMapping(projectPath);

    // Should get everything since no topic mapping is possible
    expect(mapping["outputs_ai/reports/report_a.md"].wikiPages).toContain("outputs_ai/wiki/topic_a.md");
    expect(mapping["outputs_ai/reports/report_a.md"].wikiPages).toContain("outputs_ai/wiki/_index.md");
    expect(mapping["outputs_ai/reports/report_a.md"].discoveryWikiPages).toEqual([]);
  });
});
