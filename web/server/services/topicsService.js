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
      topics: Array.isArray(data.topics) ? data.topics.map((t) => ({
        ...t,
        // Auto-populate details from justification.goal_support for legacy topics
        details: t.details !== undefined ? t.details : (t.justification?.goal_support || null),
      })) : [],
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
  if (updates.details !== undefined) topic.details = updates.details;

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
    queuedForDeepenCount: topics.filter((t) => t.queued_for_deepen).length,
  };
}

/**
 * Toggle queued_for_deepen on a topic.
 * Returns the updated topic or null if not found.
 */
export async function toggleDeepenQueue(projectPath, topicId) {
  const data = await readTopics(projectPath);
  const topic = data.topics.find((t) => t.id === topicId);

  if (!topic) return null;

  // Only active topics can be queued (not seed, deprecated, parked, settled)
  if (topic.state === "seed" || topic.state === "deprecated") return null;
  if (topic.disposition === "parked" || topic.disposition === "settled") return null;

  topic.queued_for_deepen = !topic.queued_for_deepen;
  await writeTopics(projectPath, data.topics, data.clusters);
  return topic;
}

/**
 * Queue all shallow, active topics for deepening in one operation.
 * Returns the count of topics newly queued.
 */
export async function queueAllShallowForDeepen(projectPath) {
  const data = await readTopics(projectPath);
  let queued = 0;
  for (const topic of data.topics) {
    if (
      topic.state === "shallow" &&
      !topic.disposition &&
      !topic.queued_for_deepen
    ) {
      topic.queued_for_deepen = true;
      queued++;
    }
  }
  if (queued > 0) {
    await writeTopics(projectPath, data.topics, data.clusters);
  }
  return { queued, total: data.topics.filter((t) => t.state === "shallow" && !t.disposition).length };
}

/**
 * Get all topics queued for deepening.
 */
export async function getDeepenQueue(projectPath) {
  const data = await readTopics(projectPath);
  return data.topics.filter((t) => t.queued_for_deepen);
}

/**
 * Clear the deepen queue (set queued_for_deepen = false on all topics).
 */
export async function clearDeepenQueue(projectPath) {
  const data = await readTopics(projectPath);
  let cleared = 0;
  for (const topic of data.topics) {
    if (topic.queued_for_deepen) {
      topic.queued_for_deepen = false;
      cleared++;
    }
  }
  if (cleared > 0) {
    await writeTopics(projectPath, data.topics, data.clusters);
  }
  return cleared;
}

/**
 * Append a deepen log entry to a topic.
 * Returns the updated topic or null if not found.
 */
export async function appendDeepenLog(projectPath, topicId, logEntry) {
  const data = await readTopics(projectPath);
  const topic = data.topics.find((t) => t.id === topicId);

  if (!topic) return null;

  if (!Array.isArray(topic.deepen_log)) {
    topic.deepen_log = [];
  }
  // Prepend (newest first)
  topic.deepen_log.unshift(logEntry);

  await writeTopics(projectPath, data.topics, data.clusters);
  return topic;
}

/**
 * Get the merged deepen log across all topics, sorted by date descending.
 */
export async function getDeepenLog(projectPath) {
  const data = await readTopics(projectPath);
  const entries = [];
  for (const topic of data.topics) {
    if (Array.isArray(topic.deepen_log)) {
      for (const entry of topic.deepen_log) {
        entries.push({
          topic_id: topic.id,
          topic_label: topic.label,
          wiki_page: topic.wiki_page,
          ...entry,
        });
      }
    }
  }
  entries.sort((a, b) => {
    const ta = a.deepened_at ? new Date(a.deepened_at).getTime() : 0;
    const tb = b.deepened_at ? new Date(b.deepened_at).getTime() : 0;
    return tb - ta;
  });
  return entries;
}

/**
 * Create a new user-originated topic.
 * Skips the seed stage — the user has already confirmed intent.
 * Returns { created, topic, duplicates }.
 * If duplicates are found and force is false, created will be false.
 */
export async function createTopic(projectPath, { label, justification, conversationId, force = false }) {
  if (!label || typeof label !== "string" || !label.trim()) {
    return { created: false, topic: null, duplicates: [], error: "Topic label is required." };
  }

  const trimmedLabel = label.trim();
  const data = await readTopics(projectPath);
  const existing = data.topics;

  // Fuzzy duplicate detection: case-insensitive substring + normalized comparison
  const normalizedLabel = trimmedLabel.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
  const duplicates = existing
    .filter((t) => t.state !== "deprecated")
    .filter((t) => {
      const normalizedExisting = (t.label || "").toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
      // Exact match
      if (normalizedExisting === normalizedLabel) return true;
      // Substring containment (either direction)
      if (normalizedExisting.length > 3 && normalizedLabel.length > 3) {
        if (normalizedExisting.includes(normalizedLabel) || normalizedLabel.includes(normalizedExisting)) return true;
      }
      return false;
    })
    .map((t) => ({
      id: t.id,
      label: t.label,
      state: t.state,
      disposition: t.disposition,
    }));

  if (duplicates.length > 0 && !force) {
    return { created: false, topic: null, duplicates };
  }

  const now = new Date().toISOString();
  const topicId = `topic_${trimmedLabel.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 60)}_${Date.now().toString(36)}`;

  const newTopic = {
    id: topicId,
    label: trimmedLabel,
    state: "shallow",
    details: null,
    confidence: "high",
    depth: 0,
    parent: null,
    children: [],
    cluster: null,
    wiki_page: null,
    sources: [],
    depends_on: [],
    outputs: [],
    justification: justification
      ? { goal_support: justification, graph_support: "", questions_addressed: [] }
      : null,
    discovery: {
      origin: "user_chat",
      discovered_at: now,
      discovered_from: conversationId || null,
      reason: justification || "User-created topic from AI chat",
      last_deepened: null,
      deepening_count: 0,
    },
    deprecation: null,
    metrics: {
      source_count: 0,
      cross_references: 0,
      word_count: 0,
      last_updated: now,
    },
    coverage_gaps: [],
    disposition: null,
    disposition_at: null,
    disposition_note: null,
    queued_for_deepen: false,
    deepen_log: [],
  };

  data.topics.push(newTopic);
  await writeTopics(projectPath, data.topics, data.clusters);

  return {
    created: true,
    topic: newTopic,
    duplicates: duplicates.length > 0 ? duplicates : [],
    acknowledgedDuplicates: force && duplicates.length > 0,
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
    details: null,
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
    queued_for_deepen: false,
    deepen_log: [],
  }));

  return {
    version: 2,
    last_updated: now,
    topics,
    clusters: [],
  };
}

// ── Source Reconciliation ────────────────────────────────────────────

/**
 * Normalize a string for fuzzy topic matching: lowercase, strip
 * punctuation, collapse whitespace.
 */
function normalizeLabel(label) {
  return (label || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Match a research plan `query.topic` string to a topic in the taxonomy.
 *
 * Strategies (in priority order):
 *  1. Exact label match (case-insensitive, normalized)
 *  2. topic.id appears as a substring of the query topic (handles "federal-marketing-rules — deeper research")
 *  3. Normalized label is a substring of the query topic or vice-versa
 *
 * @param {string} queryTopic - The `topic` field from a research plan query entry
 * @param {Array} topics - The topics array from topics.json
 * @returns {object|null} The matched topic, or null
 */
function matchQueryToTopic(queryTopic, topics) {
  const normalizedQuery = normalizeLabel(queryTopic);

  // 1. Exact normalized label match
  for (const topic of topics) {
    if (normalizeLabel(topic.label) === normalizedQuery) return topic;
  }

  // 2. topic.id contained in the query topic (handles slug-style references)
  for (const topic of topics) {
    const normalizedId = topic.id.replace(/_/g, " ").replace(/-/g, " ").toLowerCase();
    if (normalizedQuery.includes(normalizedId) && normalizedId.length > 3) return topic;
  }

  // 3. Substring containment (either direction, min 4 chars)
  for (const topic of topics) {
    const normalizedLabel = normalizeLabel(topic.label);
    if (normalizedLabel.length > 3 && normalizedQuery.length > 3) {
      if (normalizedQuery.includes(normalizedLabel) || normalizedLabel.includes(normalizedQuery)) {
        return topic;
      }
    }
  }

  return null;
}

/**
 * Reconcile topic sources after a build by reading the research plan
 * and matching fetched URLs back to topics in topics.json.
 *
 * This fixes the core deepening bug: sources fetched during a build
 * are never written back to the topic's `sources` array.
 *
 * @param {string} projectPath - Absolute path to the project root
 * @returns {Promise<{ reconciledTopics: number, newSourcesAdded: number, details: Array }>}
 */
export async function reconcileTopicSources(projectPath) {
  const { parseResearchPlan, urlToSlug } = await import("./webResearch.js");

  // Read current topics
  const data = await readTopics(projectPath);
  if (data.topics.length === 0) {
    return { reconciledTopics: 0, newSourcesAdded: 0, details: [] };
  }

  // Read research plan
  let plan;
  try {
    plan = await parseResearchPlan(projectPath);
  } catch {
    // No research plan (e.g., first build with no sources yet)
    return { reconciledTopics: 0, newSourcesAdded: 0, details: [] };
  }

  const now = new Date().toISOString();
  const webResearchDir = path.join(projectPath, "sources", "web_research");
  let totalNewSources = 0;
  const details = [];

  // Build a map of topic → new source entries from the research plan
  /** @type {Map<string, Array<{path: string, type: string, relevance: string}>>} */
  const topicNewSources = new Map();

  for (const query of plan.queries) {
    const topic = matchQueryToTopic(query.topic, data.topics);
    if (!topic) continue;

    for (const urlEntry of query.urls) {
      const slug = urlToSlug(urlEntry.url);
      const sourcePath = `sources/web_research/${slug}.md`;

      // Verify the file actually exists on disk
      try {
        await fs.access(path.join(webResearchDir, `${slug}.md`));
      } catch {
        continue; // File wasn't fetched or was deleted
      }

      if (!topicNewSources.has(topic.id)) {
        topicNewSources.set(topic.id, []);
      }
      topicNewSources.get(topic.id).push({
        path: sourcePath,
        type: urlEntry.type || "unknown",
        relevance: urlEntry.relevance || "",
      });
    }
  }

  // Apply new sources to each matched topic
  for (const [topicId, newSources] of topicNewSources) {
    const topic = data.topics.find((t) => t.id === topicId);
    if (!topic) continue;

    // Ensure sources is an array
    if (!Array.isArray(topic.sources)) {
      topic.sources = [];
    }

    // Build set of existing source paths for dedup
    const existingPaths = new Set(
      topic.sources.map((s) => (typeof s === "string" ? s : s.path)),
    );

    let addedCount = 0;
    for (const newSource of newSources) {
      if (existingPaths.has(newSource.path)) continue;

      topic.sources.push({
        path: newSource.path,
        relevance: 0.8,
        added_at: now,
        type: newSource.type,
        contribution: newSource.relevance,
      });
      existingPaths.add(newSource.path);
      addedCount++;
    }

    if (addedCount > 0) {
      totalNewSources += addedCount;

      // Update metrics
      topic.metrics = topic.metrics || {};
      topic.metrics.source_count = topic.sources.length;
      topic.metrics.last_updated = now;

      // Compute distinct source types
      const sourceTypes = new Set();
      for (const source of topic.sources) {
        const type = typeof source === "string" ? "unknown" : (source.type || "unknown");
        if (type !== "unknown") sourceTypes.add(type);
      }
      topic.metrics.source_types = [...sourceTypes];

      details.push({
        topicId: topic.id,
        topicLabel: topic.label,
        sourcesAdded: addedCount,
        totalSources: topic.sources.length,
        sourceTypes: [...sourceTypes],
      });
    }
  }

  if (totalNewSources > 0) {
    await writeTopics(projectPath, data.topics, data.clusters);
  }

  return { reconciledTopics: details.length, newSourcesAdded: totalNewSources, details };
}

/**
 * Extract the topic→digest mapping from the research plan.
 * Used by wiki triage to map new digests to deepen-queued topics
 * before source reconciliation has run.
 *
 * @param {string} projectPath
 * @param {Array} topics - The topics array from topics.json
 * @returns {Promise<Map<string, string[]>>} Map of topicId → digest paths
 */
export async function getResearchPlanDigestMapping(projectPath, topics) {
  const { parseResearchPlan, urlToSlug } = await import("./webResearch.js");

  /** @type {Map<string, string[]>} */
  const topicDigests = new Map();

  let plan;
  try {
    plan = await parseResearchPlan(projectPath);
  } catch {
    return topicDigests;
  }

  for (const query of plan.queries) {
    const topic = matchQueryToTopic(query.topic, topics);
    if (!topic) continue;

    for (const urlEntry of query.urls) {
      const slug = urlToSlug(urlEntry.url);
      const digestPath = `sources/digests/${slug}.md`;

      if (!topicDigests.has(topic.id)) {
        topicDigests.set(topic.id, []);
      }
      topicDigests.get(topic.id).push(digestPath);
    }
  }

  return topicDigests;
}
