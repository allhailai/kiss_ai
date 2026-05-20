import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { readTopics, writeTopics, resolveTopic, updateTopic, setDisposition, getTopicCounts } from "./topicsService.js";

describe("topicsService", () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "topics-test-"));
    await fs.mkdir(path.join(tmpDir, ".build"), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe("readTopics", () => {
    it("returns empty defaults when no file exists", async () => {
      const result = await readTopics(tmpDir);
      expect(result.topics).toEqual([]);
      expect(result.clusters).toEqual([]);
      expect(result.version).toBe(2);
    });

    it("reads existing topics.json", async () => {
      const data = {
        version: 2,
        last_updated: "2026-01-01T00:00:00Z",
        topics: [{ id: "test-topic", label: "Test", state: "shallow" }],
        clusters: [],
      };
      await fs.writeFile(path.join(tmpDir, ".build/topics.json"), JSON.stringify(data));
      const result = await readTopics(tmpDir);
      expect(result.topics).toHaveLength(1);
      expect(result.topics[0].id).toBe("test-topic");
    });

    it("auto-migrates from legacy topic_graph.json", async () => {
      const legacy = {
        date: "2026-01-01T00:00:00Z",
        topics: [
          { id: "federal-rules", label: "Federal Rules", wiki_page: "outputs_ai/wiki/federal-rules.md", sources: [], depends_on: [], outputs: [] },
          { id: "state-ohio", label: "State Ohio", wiki_page: "outputs_ai/wiki/state-ohio.md", sources: [], depends_on: ["federal-rules"], outputs: [] },
        ],
      };
      await fs.writeFile(path.join(tmpDir, ".build/topic_graph.json"), JSON.stringify(legacy));

      const result = await readTopics(tmpDir);
      expect(result.topics).toHaveLength(2);
      expect(result.topics[0].state).toBe("shallow");
      expect(result.topics[0].confidence).toBe("high");
      expect(result.topics[0].discovery.origin).toBe("legacy_migration");
      expect(result.topics[1].depends_on).toEqual(["federal-rules"]);

      // Should have written topics.json
      const written = JSON.parse(await fs.readFile(path.join(tmpDir, ".build/topics.json"), "utf-8"));
      expect(written.version).toBe(2);
      expect(written.topics).toHaveLength(2);
    });

    it("returns empty if topic_graph.json is malformed", async () => {
      await fs.writeFile(path.join(tmpDir, ".build/topic_graph.json"), "not json");
      const result = await readTopics(tmpDir);
      expect(result.topics).toEqual([]);
    });
  });

  describe("resolveTopic", () => {
    beforeEach(async () => {
      const data = {
        version: 2,
        last_updated: "2026-01-01T00:00:00Z",
        topics: [
          { id: "seed-topic", label: "Seed Topic", state: "seed", confidence: "high" },
          { id: "deep-topic", label: "Deep Topic", state: "deep", confidence: "high" },
        ],
        clusters: [],
      };
      await fs.writeFile(path.join(tmpDir, ".build/topics.json"), JSON.stringify(data));
    });

    it("accepts a seed topic → shallow", async () => {
      const result = await resolveTopic(tmpDir, "seed-topic", "accept");
      expect(result.state).toBe("shallow");
    });

    it("dismisses a topic → deprecated", async () => {
      const result = await resolveTopic(tmpDir, "seed-topic", "dismiss");
      expect(result.state).toBe("deprecated");
      expect(result.deprecation.reason).toBe("user_dismissed");
    });

    it("returns null for unknown topic", async () => {
      const result = await resolveTopic(tmpDir, "nonexistent", "accept");
      expect(result).toBeNull();
    });

    it("returns null for unknown action", async () => {
      const result = await resolveTopic(tmpDir, "seed-topic", "unknown_action");
      expect(result).toBeNull();
    });

    it("deprecates with custom reason", async () => {
      const result = await resolveTopic(tmpDir, "deep-topic", "deprecate", { reason: "obsolete", notes: "Superseded by new regulation" });
      expect(result.state).toBe("deprecated");
      expect(result.deprecation.reason).toBe("obsolete");
      expect(result.deprecation.notes).toBe("Superseded by new regulation");
    });
  });

  describe("updateTopic", () => {
    beforeEach(async () => {
      const data = {
        version: 2,
        topics: [{ id: "t1", label: "Original", state: "shallow", confidence: "low" }],
        clusters: [],
      };
      await fs.writeFile(path.join(tmpDir, ".build/topics.json"), JSON.stringify(data));
    });

    it("updates label", async () => {
      const result = await updateTopic(tmpDir, "t1", { label: "Updated Label" });
      expect(result.label).toBe("Updated Label");
    });

    it("updates confidence", async () => {
      const result = await updateTopic(tmpDir, "t1", { confidence: "high" });
      expect(result.confidence).toBe("high");
    });

    it("returns null for unknown topic", async () => {
      const result = await updateTopic(tmpDir, "nonexistent", { label: "X" });
      expect(result).toBeNull();
    });
  });

  describe("getTopicCounts", () => {
    it("returns correct counts including disposition", async () => {
      const data = {
        version: 2,
        topics: [
          { id: "t1", state: "seed" },
          { id: "t2", state: "seed" },
          { id: "t3", state: "shallow", disposition: "parked" },
          { id: "t4", state: "deep", disposition: "settled" },
          { id: "t5", state: "deprecated" },
        ],
        clusters: [],
      };
      await fs.writeFile(path.join(tmpDir, ".build/topics.json"), JSON.stringify(data));

      const counts = await getTopicCounts(tmpDir);
      expect(counts.totalTopicsCount).toBe(5);
      expect(counts.seedTopicsCount).toBe(2);
      expect(counts.shallowTopicsCount).toBe(1);
      expect(counts.deepTopicsCount).toBe(1);
      expect(counts.deprecatedTopicsCount).toBe(1);
      expect(counts.parkedTopicsCount).toBe(1);
      expect(counts.settledTopicsCount).toBe(1);
    });

    it("returns zeros when no file exists", async () => {
      const counts = await getTopicCounts(tmpDir);
      expect(counts.totalTopicsCount).toBe(0);
      expect(counts.seedTopicsCount).toBe(0);
      expect(counts.parkedTopicsCount).toBe(0);
      expect(counts.settledTopicsCount).toBe(0);
    });
  });

  describe("setDisposition", () => {
    beforeEach(async () => {
      const data = {
        version: 2,
        topics: [
          { id: "t1", label: "Topic One", state: "shallow", confidence: "high", disposition: null, disposition_at: null, disposition_note: null },
          { id: "t2", label: "Topic Two", state: "deep", confidence: "high", disposition: "parked", disposition_at: "2026-01-01T00:00:00Z", disposition_note: "wait for data" },
        ],
        clusters: [],
      };
      await fs.writeFile(path.join(tmpDir, ".build/topics.json"), JSON.stringify(data));
    });

    it("parks a topic", async () => {
      const result = await setDisposition(tmpDir, "t1", "parked", { note: "revisit next quarter" });
      expect(result.disposition).toBe("parked");
      expect(result.disposition_at).toBeTruthy();
      expect(result.disposition_note).toBe("revisit next quarter");
      // state unchanged
      expect(result.state).toBe("shallow");
    });

    it("settles a topic", async () => {
      const result = await setDisposition(tmpDir, "t1", "settled");
      expect(result.disposition).toBe("settled");
      expect(result.disposition_at).toBeTruthy();
      expect(result.state).toBe("shallow");
    });

    it("resumes a parked topic (clears disposition)", async () => {
      const result = await setDisposition(tmpDir, "t2", null);
      expect(result.disposition).toBeNull();
      expect(result.disposition_at).toBeNull();
      expect(result.disposition_note).toBeNull();
      expect(result.state).toBe("deep");
    });

    it("returns null for unknown topic", async () => {
      const result = await setDisposition(tmpDir, "nonexistent", "parked");
      expect(result).toBeNull();
    });

    it("returns null for invalid disposition", async () => {
      const result = await setDisposition(tmpDir, "t1", "invalid");
      expect(result).toBeNull();
    });

    it("persists disposition to disk", async () => {
      await setDisposition(tmpDir, "t1", "settled", { note: "good enough" });
      const data = await readTopics(tmpDir);
      const topic = data.topics.find((t) => t.id === "t1");
      expect(topic.disposition).toBe("settled");
      expect(topic.disposition_note).toBe("good enough");
    });
  });
});
