import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { computeBuildScope } from "./buildScope.js";

const TEST_ROOT = path.resolve("test-project-scope");

async function createProject(files = {}) {
  await fs.rm(TEST_ROOT, { recursive: true, force: true });
  await fs.mkdir(path.join(TEST_ROOT, ".build"), { recursive: true });
  await fs.mkdir(path.join(TEST_ROOT, "sources"), { recursive: true });
  await fs.mkdir(path.join(TEST_ROOT, "outputs_ai"), { recursive: true });
  await fs.mkdir(path.join(TEST_ROOT, "inputs_human"), { recursive: true });

  for (const [filePath, content] of Object.entries(files)) {
    const absolute = path.join(TEST_ROOT, filePath);
    await fs.mkdir(path.dirname(absolute), { recursive: true });
    await fs.writeFile(absolute, content, "utf-8");
  }
}

describe("buildScope", () => {
  afterEach(async () => {
    await fs.rm(TEST_ROOT, { recursive: true, force: true });
  });

  it("detects first build when no manifest exists", async () => {
    await createProject({
      "project.md": "# Test Project\n\nGoal: test\n",
    });

    const scope = await computeBuildScope(TEST_ROOT);
    expect(scope.isFirstBuild).toBe(true);
    expect(scope.skipResearchPlan).toBe(false);
  });

  it("detects project.md changed when hash differs", async () => {
    await createProject({
      "project.md": "# Test Project\n\nUpdated goal\n",
      ".build/manifest.json": JSON.stringify({
        version: 1,
        last_build: "2026-05-17T00:00:00Z",
        project_md_hash: "old_hash_that_wont_match",
        directed_outputs: ["outputs_ai/report.md"],
        wiki_pages: [],
        inputs_human_inventory: [],
      }),
    });

    const scope = await computeBuildScope(TEST_ROOT);
    expect(scope.isFirstBuild).toBe(false);
    expect(scope.projectMdChanged).toBe(true);
    expect(scope.skipResearchPlan).toBe(false);
  });

  it("detects no changes when hash matches", async () => {
    const content = "# Test Project\n\nSame goal\n";
    // Compute the actual hash to make it match
    const { createHash } = await import("node:crypto");
    const hash = createHash("sha256").update(content).digest("hex");

    await createProject({
      "project.md": content,
      ".build/manifest.json": JSON.stringify({
        version: 1,
        last_build: "2026-05-17T00:00:00Z",
        project_md_hash: hash,
        directed_outputs: [],
        wiki_pages: [],
        inputs_human_inventory: [],
      }),
    });

    const scope = await computeBuildScope(TEST_ROOT);
    expect(scope.isFirstBuild).toBe(false);
    expect(scope.projectMdChanged).toBe(false);
    expect(scope.skipResearchPlan).toBe(true);
  });

  it("finds FEEDBACK markers in source files", async () => {
    const content = "# Test Project\n\nSame goal\n";
    const { createHash } = await import("node:crypto");
    const hash = createHash("sha256").update(content).digest("hex");

    await createProject({
      "project.md": content,
      ".build/manifest.json": JSON.stringify({
        version: 1,
        last_build: "2026-05-17T00:00:00Z",
        project_md_hash: hash,
        directed_outputs: [],
        wiki_pages: [],
        inputs_human_inventory: [],
      }),
      "sources/wiki/test.md": "# Test\n\n<!-- FEEDBACK: Fix this section -->\n\nContent here\n",
    });

    const scope = await computeBuildScope(TEST_ROOT);
    expect(scope.feedbackMarkers).toEqual(["sources/wiki/test.md"]);
    expect(scope.skipResearchPlan).toBe(false); // FEEDBACK markers prevent skip
  });

  it("detects affected wiki pages from Topics section changes", async () => {
    const { detectAffectedOutputs } = await import("./buildScope.js");

    const manifest = {
      wiki_pages: ["outputs_ai/wiki/supply_chain.md", "outputs_ai/wiki/pricing.md"],
    };

    // Topics section changed → all wiki pages affected
    const diffWithTopics = `
@@ -5,0 +6,2 @@
+## Topics
+- Supply chain analysis
`;

    const affected = detectAffectedOutputs(diffWithTopics, manifest);
    expect(affected).toContain("outputs_ai/wiki/supply_chain.md");
    expect(affected).toContain("outputs_ai/wiki/pricing.md");

    // Non-Topics diff → no wiki pages affected
    const diffWithoutTopics = `
@@ -5,0 +6,2 @@
+Each generated report should also include a Reagent Brittleness Confidence Score.
`;

    const notAffected = detectAffectedOutputs(diffWithoutTopics, manifest);
    expect(notAffected).toHaveLength(0);
  });

  it("detects human input changes and prevents Phase 1 skip", async () => {
    const content = "# Test Project\n\nSame goal\n";
    const { createHash } = await import("node:crypto");
    const hash = createHash("sha256").update(content).digest("hex");

    await createProject({
      "project.md": content,
      ".build/manifest.json": JSON.stringify({
        version: 1,
        last_build: "2026-05-17T00:00:00Z",
        project_md_hash: hash,
        directed_outputs: [],
        wiki_pages: [],
      }),
      "inputs_human/new_data.md": "# New data\n",
    });

    const scope = await computeBuildScope(TEST_ROOT);
    // Early detection: file exists in inputs_human/ but ledger has no record
    expect(scope.humanInputsChanged).toBe(true);
    // Phase 1 should NOT be skipped when human inputs changed
    expect(scope.skipResearchPlan).toBe(false);
  });

  it("does not skip Phase 1 when topics have zero sources", async () => {
    const content = "# Test Project\n\nSame goal\n";
    const { createHash } = await import("node:crypto");
    const hash = createHash("sha256").update(content).digest("hex");

    await createProject({
      "project.md": content,
      ".build/manifest.json": JSON.stringify({
        version: 1,
        last_build: "2026-05-17T00:00:00Z",
        project_md_hash: hash,
        directed_outputs: [],
        wiki_pages: [],
      }),
      ".build/topics.json": JSON.stringify({
        version: 2,
        last_updated: "2026-05-17T00:00:00Z",
        topics: [
          {
            id: "topic_with_sources",
            label: "Topic With Sources",
            state: "deep",
            sources: [{ path: "sources/web_research/some_source.md", relevance: 0.9 }],
          },
          {
            id: "topic_without_sources",
            label: "Topic Without Sources",
            state: "shallow",
            sources: [],
          },
        ],
      }),
    });

    const scope = await computeBuildScope(TEST_ROOT);
    expect(scope.skipResearchPlan).toBe(false);
    expect(scope.hasUnsourcedTopics).toBe(true);
    expect(scope.unsourcedTopicCount).toBe(1);
  });

  it("does not skip Phase 1 when topics are queued for deepen", async () => {
    const content = "# Test Project\n\nSame goal\n";
    const { createHash } = await import("node:crypto");
    const hash = createHash("sha256").update(content).digest("hex");

    await createProject({
      "project.md": content,
      ".build/manifest.json": JSON.stringify({
        version: 1,
        last_build: "2026-05-17T00:00:00Z",
        project_md_hash: hash,
        directed_outputs: [],
        wiki_pages: [],
      }),
      ".build/topics.json": JSON.stringify({
        version: 2,
        last_updated: "2026-05-17T00:00:00Z",
        topics: [
          {
            id: "topic_queued",
            label: "Topic Queued",
            state: "shallow",
            sources: [{ path: "sources/web_research/old.md", relevance: 0.8 }],
            queued_for_deepen: true,
          },
        ],
      }),
    });

    const scope = await computeBuildScope(TEST_ROOT);
    expect(scope.skipResearchPlan).toBe(false);
    expect(scope.hasDeepenQueue).toBe(true);
    expect(scope.deepenQueueCount).toBe(1);
  });

  it("skips Phase 1 when all topics have sources and none are queued", async () => {
    const content = "# Test Project\n\nSame goal\n";
    const { createHash } = await import("node:crypto");
    const hash = createHash("sha256").update(content).digest("hex");

    await createProject({
      "project.md": content,
      ".build/manifest.json": JSON.stringify({
        version: 1,
        last_build: "2026-05-17T00:00:00Z",
        project_md_hash: hash,
        directed_outputs: [],
        wiki_pages: [],
      }),
      ".build/topics.json": JSON.stringify({
        version: 2,
        last_updated: "2026-05-17T00:00:00Z",
        topics: [
          {
            id: "topic_good",
            label: "Fully Sourced Topic",
            state: "deep",
            sources: [{ path: "sources/web_research/a.md", relevance: 0.9 }],
            queued_for_deepen: false,
          },
        ],
      }),
    });

    const scope = await computeBuildScope(TEST_ROOT);
    expect(scope.skipResearchPlan).toBe(true);
    expect(scope.hasUnsourcedTopics).toBe(false);
    expect(scope.hasDeepenQueue).toBe(false);
  });

  it("ignores deprecated and seed topics for unsourced check", async () => {
    const content = "# Test Project\n\nSame goal\n";
    const { createHash } = await import("node:crypto");
    const hash = createHash("sha256").update(content).digest("hex");

    await createProject({
      "project.md": content,
      ".build/manifest.json": JSON.stringify({
        version: 1,
        last_build: "2026-05-17T00:00:00Z",
        project_md_hash: hash,
        directed_outputs: [],
        wiki_pages: [],
      }),
      ".build/topics.json": JSON.stringify({
        version: 2,
        last_updated: "2026-05-17T00:00:00Z",
        topics: [
          {
            id: "deprecated_topic",
            label: "Old Topic",
            state: "deprecated",
            sources: [],
          },
          {
            id: "seed_topic",
            label: "Seed Topic",
            state: "seed",
            sources: [],
          },
        ],
      }),
    });

    const scope = await computeBuildScope(TEST_ROOT);
    // Deprecated and seed topics should not trigger research
    expect(scope.skipResearchPlan).toBe(true);
    expect(scope.hasUnsourcedTopics).toBe(false);
  });
});
