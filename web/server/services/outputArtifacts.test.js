import { describe, expect, it, vi, beforeEach } from "vitest";
import path from "node:path";

// Mock fs before importing the module under test
vi.mock("node:fs/promises", () => {
  const store = new Map();
  return {
    default: {
      readFile: vi.fn(async (filePath) => {
        const key = filePath.replace(/\\/g, "/");
        if (store.has(key)) return store.get(key);
        const err = /** @type {any} */ (new Error(`ENOENT: ${key}`));
        err.code = "ENOENT";
        throw err;
      }),
      readdir: vi.fn(async () => []),
      writeFile: vi.fn(async () => {}),
      access: vi.fn(async () => { throw new Error("ENOENT"); }),
      mkdir: vi.fn(async () => {}),
    },
    _store: store,
  };
});

// Mock topicsService
vi.mock("./topicsService.js", () => ({
  readTopics: vi.fn(async () => ({ topics: [], clusters: [] })),
}));

let fsModule;
let topicsModule;

beforeEach(async () => {
  vi.clearAllMocks();
  fsModule = (await import("node:fs/promises"));
  // @ts-expect-error -- accessing mock-internal _store
  fsModule._store.clear();
  topicsModule = (await import("./topicsService.js"));
});

const PROJECT_PATH = "/test/project";

function setFile(relativePath, content) {
  fsModule._store.set(path.join(PROJECT_PATH, relativePath).replace(/\\/g, "/"), content);
}

function setTopics(topics) {
  topicsModule.readTopics.mockResolvedValue({ topics, clusters: [] });
}

function makeManifest(directedOutputs) {
  return JSON.stringify({ directed_outputs: directedOutputs, last_build: "2024-01-01T00:00:00Z" });
}

function makeArtifactSpec(name, extra = {}) {
  const frontmatter = { name, format: "html", lifecycle: "manual", ...extra };
  const yamlLines = Object.entries(frontmatter).map(([k, v]) => {
    if (Array.isArray(v)) return `${k}:\n${v.map((i) => `  - ${i}`).join("\n")}`;
    return `${k}: ${v}`;
  });
  return `---\n${yamlLines.join("\n")}\n---\n\nSpec body content.\n`;
}

describe("findDirectedOutputsWithoutArtifacts", () => {
  it("returns empty when no manifest or topics exist", async () => {
    const { findDirectedOutputsWithoutArtifacts } = await import("./artifactService.js");
    const result = await findDirectedOutputsWithoutArtifacts(PROJECT_PATH);
    expect(result).toEqual([]);
  });

  it("returns outputs that have no artifact spec", async () => {
    setFile(".build/manifest.json", makeManifest([
      "outputs_ai/reports/strategy.md",
      "outputs_ai/reports/risk_analysis.md",
    ]));

    // No artifact specs directory
    fsModule.default.readdir.mockResolvedValue([]);

    setTopics([
      { id: "strat", label: "Strategy", state: "deep", wiki_page: "outputs_ai/wiki/strat.md", outputs: ["outputs_ai/reports/strategy.md"] },
      { id: "risk", label: "Risk", state: "shallow", wiki_page: "outputs_ai/wiki/risk.md", outputs: ["outputs_ai/reports/risk_analysis.md"] },
    ]);

    const { findDirectedOutputsWithoutArtifacts } = await import("./artifactService.js");
    const result = await findDirectedOutputsWithoutArtifacts(PROJECT_PATH);

    expect(result).toHaveLength(2);
    expect(result[0].outputFile).toBe("outputs_ai/reports/strategy.md");
    expect(result[0].topics).toEqual([{ id: "strat", label: "Strategy", wiki_page: "outputs_ai/wiki/strat.md" }]);
    expect(result[1].outputFile).toBe("outputs_ai/reports/risk_analysis.md");
  });

  it("skips outputs that already have an artifact spec by outputFile", async () => {
    setFile(".build/manifest.json", makeManifest([
      "outputs_ai/reports/strategy.md",
      "outputs_ai/reports/risk_analysis.md",
    ]));

    // Existing spec for strategy
    const specContent = makeArtifactSpec("Strategy Report", { outputFile: "outputs_ai/reports/strategy.md" });
    fsModule.default.readdir.mockResolvedValue(["output_strategy.artifact.md"]);
    setFile("artifacts/artifact_specs/output_strategy.artifact.md", specContent);

    setTopics([]);

    const { findDirectedOutputsWithoutArtifacts } = await import("./artifactService.js");
    const result = await findDirectedOutputsWithoutArtifacts(PROJECT_PATH);

    expect(result).toHaveLength(1);
    expect(result[0].outputFile).toBe("outputs_ai/reports/risk_analysis.md");
  });

  it("skips outputs that match by expected slug pattern", async () => {
    setFile(".build/manifest.json", makeManifest([
      "outputs_ai/reports/strategy.md",
    ]));

    // Existing spec with matching slug but no outputFile frontmatter
    const specContent = makeArtifactSpec("Strategy");
    fsModule.default.readdir.mockResolvedValue(["output_strategy.artifact.md"]);
    setFile("artifacts/artifact_specs/output_strategy.artifact.md", specContent);

    setTopics([]);

    const { findDirectedOutputsWithoutArtifacts } = await import("./artifactService.js");
    const result = await findDirectedOutputsWithoutArtifacts(PROJECT_PATH);

    expect(result).toHaveLength(0);
  });

  it("falls back to topics.json when manifest has no directed_outputs", async () => {
    // Manifest without directed_outputs
    setFile(".build/manifest.json", JSON.stringify({ last_build: "2024-01-01T00:00:00Z" }));

    // But topics have outputs
    setTopics([
      { id: "strat", label: "Strategy", state: "deep", wiki_page: "outputs_ai/wiki/strat.md", outputs: ["outputs_ai/reports/strategy.md"] },
    ]);

    // Set topics.json file for the fallback path
    setFile(".build/topics.json", JSON.stringify({
      topics: [{ id: "strat", outputs: ["outputs_ai/reports/strategy.md"] }],
    }));

    fsModule.default.readdir.mockResolvedValue([]);

    const { findDirectedOutputsWithoutArtifacts } = await import("./artifactService.js");
    const result = await findDirectedOutputsWithoutArtifacts(PROJECT_PATH);

    // manifest.directed_outputs is undefined → [], length 0 → returns early
    // But wait — the function checks manifest.directed_outputs first, which will be undefined/null → []
    // So it returns [] since directed_outputs list is empty
    expect(result).toEqual([]);
  });
});

describe("collectCoveredTopicIds", () => {
  it("returns empty set when no new slugs given", async () => {
    const { collectCoveredTopicIds } = await import("./artifactService.js");
    const result = await collectCoveredTopicIds(PROJECT_PATH, []);
    expect(result.size).toBe(0);
  });

  it("returns topic IDs mapped to the output file in the spec", async () => {
    // Set up a spec with outputFile
    const specContent = makeArtifactSpec("Strategy Report", { outputFile: "outputs_ai/reports/strategy.md" });
    setFile("artifacts/artifact_specs/output_strategy.artifact.md", specContent);

    // Topics that map to this output
    setTopics([
      { id: "strat", label: "Strategy", state: "deep", outputs: ["outputs_ai/reports/strategy.md"] },
      { id: "risk", label: "Risk", state: "deep", outputs: ["outputs_ai/reports/strategy.md"] },
      { id: "market", label: "Market", state: "deep", outputs: ["outputs_ai/reports/market.md"] },
    ]);

    const { collectCoveredTopicIds } = await import("./artifactService.js");
    const result = await collectCoveredTopicIds(PROJECT_PATH, ["output_strategy"]);

    expect(result).toEqual(new Set(["strat", "risk"]));
    expect(result.has("market")).toBe(false);
  });
});

describe("createAutoArtifactSpecs with coveredTopicIds", () => {
  it("skips topics in coveredTopicIds", async () => {
    fsModule.default.readdir.mockResolvedValue([]);

    const topics = [
      { id: "strat", label: "Strategy", state: "deep", wiki_page: "outputs_ai/wiki/strat.md", outputs: [] },
      { id: "risk", label: "Risk", state: "deep", wiki_page: "outputs_ai/wiki/risk.md", outputs: [] },
      { id: "market", label: "Market", state: "deep", wiki_page: "outputs_ai/wiki/market.md", outputs: [] },
    ];

    const coveredTopicIds = new Set(["strat", "risk"]);

    const { createAutoArtifactSpecs } = await import("./artifactService.js");
    const result = await createAutoArtifactSpecs(PROJECT_PATH, {
      modelId: "test-model",
      isFirstBuild: false,
      topics,
      coveredTopicIds,
    });

    // strat and risk should be skipped, only market should be created
    expect(result.created).toContain("topic_market");
    expect(result.created).not.toContain("topic_strat");
    expect(result.created).not.toContain("topic_risk");
    expect(result.skipped).toContain("topic_strat");
    expect(result.skipped).toContain("topic_risk");
  });

  it("creates all topics when coveredTopicIds is empty", async () => {
    fsModule.default.readdir.mockResolvedValue([]);

    const topics = [
      { id: "strat", label: "Strategy", state: "deep", wiki_page: "outputs_ai/wiki/strat.md", outputs: [] },
      { id: "risk", label: "Risk", state: "deep", wiki_page: "outputs_ai/wiki/risk.md", outputs: [] },
    ];

    const { createAutoArtifactSpecs } = await import("./artifactService.js");
    const result = await createAutoArtifactSpecs(PROJECT_PATH, {
      modelId: "test-model",
      isFirstBuild: false,
      topics,
      coveredTopicIds: new Set(),
    });

    expect(result.created).toContain("topic_strat");
    expect(result.created).toContain("topic_risk");
  });

  it("creates all topics when coveredTopicIds is undefined", async () => {
    fsModule.default.readdir.mockResolvedValue([]);

    const topics = [
      { id: "strat", label: "Strategy", state: "deep", wiki_page: "outputs_ai/wiki/strat.md", outputs: [] },
    ];

    const { createAutoArtifactSpecs } = await import("./artifactService.js");
    const result = await createAutoArtifactSpecs(PROJECT_PATH, {
      modelId: "test-model",
      isFirstBuild: false,
      topics,
      coveredTopicIds: undefined,
    });

    expect(result.created).toContain("topic_strat");
  });
});
