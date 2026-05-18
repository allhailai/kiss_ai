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

  it("detects affected outputs from diff keywords", async () => {
    const { detectAffectedOutputs } = await import("./buildScope.js");

    const manifest = {
      directed_outputs: [
        "outputs_ai/reagent_brittleness_index_dashboard.md",
        "outputs_ai/price_tracker.md",
        "outputs_ai/triage_monitor.md",
      ],
      wiki_pages: ["outputs_ai/wiki/supply_chain.md"],
    };

    const diffText = `
@@ -5,0 +6,2 @@
+Each generated report should also include a Reagent Brittleness Confidence Score.
+Dashboard releases should also state the current Reagent Brittleness Confidence Score.
`;

    const affected = detectAffectedOutputs(diffText, manifest);
    // "reagent" and "brittleness" and "dashboard" appear in the diff
    expect(affected).toContain("outputs_ai/reagent_brittleness_index_dashboard.md");
    // "triage" does NOT appear in the diff
    expect(affected).not.toContain("outputs_ai/triage_monitor.md");
  });

  it("detects changed human inputs", async () => {
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
      "inputs_human/new_data.md": "# New data\n",
    });

    const scope = await computeBuildScope(TEST_ROOT);
    expect(scope.humanInputsChanged).toBe(true);
    expect(scope.skipResearchPlan).toBe(false); // New inputs prevent skip
  });
});
