import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reconcileTopicSources, getResearchPlanDigestMapping, readTopics, writeTopics } from "./topicsService.js";

// ── Helpers ──────────────────────────────────────────────────────────

async function createTestProject() {
  const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "kiss-ai-reconcile-"));
  await fs.mkdir(path.join(projectPath, ".build"), { recursive: true });
  await fs.mkdir(path.join(projectPath, "sources", "web_research"), { recursive: true });
  await fs.mkdir(path.join(projectPath, "sources", "digests"), { recursive: true });
  return projectPath;
}

function makeTopics(topics) {
  return {
    version: 2,
    last_updated: new Date().toISOString(),
    topics,
    clusters: [],
  };
}

function makeResearchPlan(queries) {
  return { queries };
}

async function writeResearchPlan(projectPath, plan) {
  await fs.writeFile(
    path.join(projectPath, "sources", "research_plan.json"),
    JSON.stringify(plan, null, 2),
    "utf-8",
  );
}

async function writeTopicsFile(projectPath, topicsData) {
  await fs.writeFile(
    path.join(projectPath, ".build", "topics.json"),
    JSON.stringify(topicsData, null, 2),
    "utf-8",
  );
}

async function touchSourceFile(projectPath, slug) {
  await fs.writeFile(
    path.join(projectPath, "sources", "web_research", `${slug}.md`),
    `# Test Source\n\n- URL: https://example.com/${slug}\n- Type: trade_press\n`,
    "utf-8",
  );
}

// ── Tests ────────────────────────────────────────────────────────────

describe("reconcileTopicSources", () => {
  let projectPath;

  beforeEach(async () => {
    projectPath = await createTestProject();
  });

  afterEach(async () => {
    await fs.rm(projectPath, { recursive: true, force: true });
  });

  it("adds new sources from research plan to matching topics", async () => {
    const topics = makeTopics([
      {
        id: "federal_marketing",
        label: "Federal Marketing Rules",
        state: "shallow",
        sources: [],
        wiki_page: "outputs_ai/wiki/federal-marketing-rules.md",
        metrics: { source_count: 0 },
      },
    ]);
    await writeTopicsFile(projectPath, topics);

    const plan = makeResearchPlan([
      {
        topic: "Federal Marketing Rules",
        query: "federal marketing regulations",
        urls: [
          { url: "https://example.com/fed-rules", type: "government", relevance: "Direct regulations" },
          { url: "https://example.com/fed-analysis", type: "trade_press", relevance: "Industry analysis" },
        ],
      },
    ]);
    await writeResearchPlan(projectPath, plan);

    // Create the actual source files on disk
    await touchSourceFile(projectPath, "example_com__fed_rules");
    await touchSourceFile(projectPath, "example_com__fed_analysis");

    const result = await reconcileTopicSources(projectPath);

    expect(result.reconciledTopics).toBe(1);
    expect(result.newSourcesAdded).toBe(2);
    expect(result.details[0].topicLabel).toBe("Federal Marketing Rules");
    expect(result.details[0].sourceTypes).toContain("government");
    expect(result.details[0].sourceTypes).toContain("trade_press");

    // Verify topics.json was updated
    const updated = await readTopics(projectPath);
    const topic = updated.topics[0];
    expect(topic.sources).toHaveLength(2);
    expect(topic.metrics.source_count).toBe(2);
    expect(topic.metrics.source_types).toContain("government");
  });

  it("deduplicates sources that already exist", async () => {
    const topics = makeTopics([
      {
        id: "federal_marketing",
        label: "Federal Marketing Rules",
        state: "shallow",
        sources: [
          { path: "sources/web_research/example_com__fed_rules.md", relevance: 0.9 },
        ],
        wiki_page: "outputs_ai/wiki/federal-marketing-rules.md",
        metrics: { source_count: 1 },
      },
    ]);
    await writeTopicsFile(projectPath, topics);

    const plan = makeResearchPlan([
      {
        topic: "Federal Marketing Rules",
        query: "federal marketing regulations",
        urls: [
          { url: "https://example.com/fed-rules", type: "government", relevance: "Already have this" },
          { url: "https://example.com/new-source", type: "academic", relevance: "New evidence" },
        ],
      },
    ]);
    await writeResearchPlan(projectPath, plan);

    await touchSourceFile(projectPath, "example_com__fed_rules");
    await touchSourceFile(projectPath, "example_com__new_source");

    const result = await reconcileTopicSources(projectPath);

    expect(result.newSourcesAdded).toBe(1); // Only the new one
    const updated = await readTopics(projectPath);
    expect(updated.topics[0].sources).toHaveLength(2);
  });

  it("fuzzy-matches deepen-suffixed topic names", async () => {
    const topics = makeTopics([
      {
        id: "state_regulations",
        label: "State Cannabis Regulations",
        state: "shallow",
        sources: [],
        wiki_page: "outputs_ai/wiki/state-regulations.md",
        metrics: { source_count: 0 },
      },
    ]);
    await writeTopicsFile(projectPath, topics);

    const plan = makeResearchPlan([
      {
        topic: "State Cannabis Regulations — deeper research",
        query: "state cannabis law updates",
        urls: [
          { url: "https://example.com/state-law", type: "government", relevance: "State law" },
        ],
      },
    ]);
    await writeResearchPlan(projectPath, plan);
    await touchSourceFile(projectPath, "example_com__state_law");

    const result = await reconcileTopicSources(projectPath);

    expect(result.reconciledTopics).toBe(1);
    expect(result.details[0].topicId).toBe("state_regulations");
  });

  it("skips sources whose files don't exist on disk", async () => {
    const topics = makeTopics([
      {
        id: "topic_a",
        label: "Topic A",
        state: "shallow",
        sources: [],
        wiki_page: "outputs_ai/wiki/topic-a.md",
        metrics: { source_count: 0 },
      },
    ]);
    await writeTopicsFile(projectPath, topics);

    const plan = makeResearchPlan([
      {
        topic: "Topic A",
        query: "topic a search",
        urls: [
          { url: "https://example.com/missing-source", type: "news", relevance: "Relevant" },
        ],
      },
    ]);
    await writeResearchPlan(projectPath, plan);
    // Intentionally NOT creating the source file

    const result = await reconcileTopicSources(projectPath);
    expect(result.newSourcesAdded).toBe(0);
  });

  it("returns empty result when no research plan exists", async () => {
    const topics = makeTopics([
      { id: "t1", label: "Test", state: "shallow", sources: [], metrics: {} },
    ]);
    await writeTopicsFile(projectPath, topics);

    const result = await reconcileTopicSources(projectPath);
    expect(result.reconciledTopics).toBe(0);
    expect(result.newSourcesAdded).toBe(0);
  });

  it("returns empty result when no topics exist", async () => {
    await writeTopicsFile(projectPath, makeTopics([]));
    await writeResearchPlan(projectPath, makeResearchPlan([
      { topic: "Orphan", query: "test", urls: [{ url: "https://example.com/x", type: "news" }] },
    ]));

    const result = await reconcileTopicSources(projectPath);
    expect(result.reconciledTopics).toBe(0);
  });
});

describe("getResearchPlanDigestMapping", () => {
  let projectPath;

  beforeEach(async () => {
    projectPath = await createTestProject();
  });

  afterEach(async () => {
    await fs.rm(projectPath, { recursive: true, force: true });
  });

  it("maps research plan URLs to topic digest paths", async () => {
    const topics = [
      { id: "topic_a", label: "Topic A", state: "shallow", sources: [] },
      { id: "topic_b", label: "Topic B", state: "shallow", sources: [] },
    ];

    const plan = makeResearchPlan([
      {
        topic: "Topic A",
        query: "search A",
        urls: [
          { url: "https://example.com/source-a1", type: "news" },
          { url: "https://example.com/source-a2", type: "academic" },
        ],
      },
      {
        topic: "Topic B",
        query: "search B",
        urls: [
          { url: "https://example.com/source-b1", type: "government" },
        ],
      },
    ]);
    await writeResearchPlan(projectPath, plan);

    const mapping = await getResearchPlanDigestMapping(projectPath, topics);

    expect(mapping.has("topic_a")).toBe(true);
    expect(mapping.get("topic_a")).toHaveLength(2);
    expect(mapping.get("topic_a")[0]).toMatch(/^sources\/digests\//);

    expect(mapping.has("topic_b")).toBe(true);
    expect(mapping.get("topic_b")).toHaveLength(1);
  });

  it("returns empty map when no research plan exists", async () => {
    const mapping = await getResearchPlanDigestMapping(projectPath, [
      { id: "t1", label: "Test", state: "shallow", sources: [] },
    ]);
    expect(mapping.size).toBe(0);
  });
});
