import fs from "node:fs/promises";
import path from "node:path";

const TOPICS_PATH = ".build/topics.json";
const LEGACY_TOPIC_GRAPH_PATH = ".build/topic_graph.json";

/**
 * Empty topics.json structure.
 */
function emptyTopicsData() {
  return { version: 2, last_updated: null, topics: [], clusters: [] };
}

/**
 * Read .build/topics.json, returning empty defaults if missing or invalid.
 * If only the legacy topic_graph.json exists, auto-migrates it.
 */
export async function readTopics(projectPath) {
  // Try v2 topics.json first
  try {
    const raw = await fs.readFile(path.join(projectPath, TOPICS_PATH), "utf-8");
    const data = JSON.parse(raw);
    // Opportunistically clean up legacy file if it still exists
    fs.unlink(path.join(projectPath, LEGACY_TOPIC_GRAPH_PATH)).catch(() => {});
    return {
      version: data.version ?? 2,
      last_updated: data.last_updated ?? null,
      topics: Array.isArray(data.topics) ? data.topics : [],
      clusters: Array.isArray(data.clusters) ? data.clusters : [],
    };
  } catch {
    // topics.json doesn't exist — try legacy migration
  }

  // Try legacy topic_graph.json
  try {
    const raw = await fs.readFile(path.join(projectPath, LEGACY_TOPIC_GRAPH_PATH), "utf-8");
    const legacy = JSON.parse(raw);
    if (Array.isArray(legacy.topics) && legacy.topics.length > 0) {
      const migrated = migrateFromLegacyTopicGraph(legacy);
      await writeTopics(projectPath, migrated.topics, migrated.clusters);
      // Delete legacy file after successful migration
      try { await fs.unlink(path.join(projectPath, LEGACY_TOPIC_GRAPH_PATH)); } catch { /* ignore */ }
      return migrated;
    }
  } catch {
    // No legacy file either
  }

  return emptyTopicsData();
}

/**
 * Write topics to .build/topics.json.
 */
export async function writeTopics(projectPath, topics, clusters = []) {
  const outPath = path.join(projectPath, TOPICS_PATH);
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  const data = {
    version: 2,
    last_updated: new Date().toISOString(),
    topics,
    clusters,
  };
  await fs.writeFile(outPath, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

/**
 * Resolve a topic by ID (accept, dismiss, deprecate).
 * Returns the updated topic or null if not found.
 */
export async function resolveTopic(projectPath, topicId, action, options = {}) {
  const data = await readTopics(projectPath);
  const topic = data.topics.find((t) => t.id === topicId);

  if (!topic) return null;

  const now = new Date().toISOString();

  if (action === "accept") {
    // seed → shallow
    if (topic.state === "seed") {
      topic.state = "shallow";
    }
  } else if (action === "dismiss") {
    topic.state = "deprecated";
    topic.deprecation = {
      reason: "user_dismissed",
      deprecated_at: now,
      merged_into: null,
      notes: options.notes || null,
    };
  } else if (action === "deprecate") {
    topic.state = "deprecated";
    topic.deprecation = {
      reason: options.reason || "user_dismissed",
      deprecated_at: now,
      merged_into: options.merged_into || null,
      notes: options.notes || null,
    };
  } else {
    return null;
  }

  await writeTopics(projectPath, data.topics, data.clusters);
  return topic;
}

/**
 * Set or clear the user disposition on a topic (park, settle, resume).
 * Disposition is orthogonal to research state — a topic can be shallow AND parked.
 * Returns the updated topic or null if not found.
 */
export async function setDisposition(projectPath, topicId, disposition, options = {}) {
  const validDispositions = ["parked", "settled", null];
  if (!validDispositions.includes(disposition)) return null;

  const data = await readTopics(projectPath);
  const topic = data.topics.find((t) => t.id === topicId);

  if (!topic) return null;

  const now = new Date().toISOString();

  if (disposition === null) {
    // Resume — clear disposition
    topic.disposition = null;
    topic.disposition_at = null;
    topic.disposition_note = null;
  } else {
    topic.disposition = disposition;
    topic.disposition_at = now;
    topic.disposition_note = options.note || null;
  }

  await writeTopics(projectPath, data.topics, data.clusters);
  return topic;
}

/**
 * Update a topic's mutable fields (label, confidence).
 * Returns the updated topic or null if not found.
 */
export async function updateTopic(projectPath, topicId, updates) {
  const data = await readTopics(projectPath);
  const topic = data.topics.find((t) => t.id === topicId);

  if (!topic) return null;

  if (updates.label !== undefined) topic.label = updates.label;
  if (updates.confidence !== undefined) topic.confidence = updates.confidence;

  await writeTopics(projectPath, data.topics, data.clusters);
  return topic;
}

/**
 * Get summary counts for the status endpoint.
 */
export async function getTopicCounts(projectPath) {
  const data = await readTopics(projectPath);
  const topics = data.topics;

  return {
    totalTopicsCount: topics.length,
    seedTopicsCount: topics.filter((t) => t.state === "seed").length,
    shallowTopicsCount: topics.filter((t) => t.state === "shallow").length,
    deepTopicsCount: topics.filter((t) => t.state === "deep").length,
    deprecatedTopicsCount: topics.filter((t) => t.state === "deprecated").length,
    parkedTopicsCount: topics.filter((t) => t.disposition === "parked").length,
    settledTopicsCount: topics.filter((t) => t.disposition === "settled").length,
  };
}

/**
 * Migrate legacy topic_graph.json format to v2 topics.json format.
 * Existing topics become "shallow" state with "high" confidence.
 */
function migrateFromLegacyTopicGraph(legacy) {
  const now = new Date().toISOString();

  const topics = (legacy.topics || []).map((t) => ({
    id: t.id,
    label: t.label || t.id,
    state: "shallow",
    confidence: "high",
    depth: 0,
    parent: null,
    children: [],
    cluster: null,
    wiki_page: t.wiki_page || null,
    sources: Array.isArray(t.sources) ? t.sources : [],
    depends_on: Array.isArray(t.depends_on) ? t.depends_on : [],
    outputs: Array.isArray(t.outputs) ? t.outputs : [],
    justification: null,
    discovery: {
      origin: "legacy_migration",
      discovered_at: legacy.date || now,
      discovered_from: null,
      reason: "Migrated from topic_graph.json",
      last_deepened: null,
      deepening_count: 0,
    },
    deprecation: null,
    metrics: {
      source_count: Array.isArray(t.sources) ? t.sources.length : 0,
      cross_references: Array.isArray(t.depends_on) ? t.depends_on.length : 0,
      word_count: 0,
      last_updated: legacy.date || null,
    },
    coverage_gaps: [],
    disposition: null,
    disposition_at: null,
    disposition_note: null,
  }));

  return {
    version: 2,
    last_updated: now,
    topics,
    clusters: [],
  };
}
