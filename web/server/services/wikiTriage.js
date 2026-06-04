import fs from "node:fs/promises";
import path from "node:path";
import { readTopics, writeTopics, getResearchPlanDigestMapping } from "./topicsService.js";
import { readQuestions } from "./questionsService.js";

// ── Project settings ────────────────────────────────────────────────
const DEFAULT_FULL_REBUILD_THRESHOLD = 7;

export async function getWikiRebuildThreshold(projectPath) {
  try {
    const settingsPath = path.join(projectPath, ".kiss_ai_settings.json");
    const raw = await fs.readFile(settingsPath, "utf-8");
    const settings = JSON.parse(raw);
    const threshold = settings?.wiki_full_rebuild_threshold;
    return typeof threshold === "number" && threshold > 0 ? threshold : DEFAULT_FULL_REBUILD_THRESHOLD;
  } catch {
    return DEFAULT_FULL_REBUILD_THRESHOLD;
  }
}

// ── Wiki page tracker ───────────────────────────────────────────────
const TRACKER_PATH = ".build/wiki_page_tracker.json";

export async function readWikiPageTracker(projectPath) {
  try {
    const raw = await fs.readFile(path.join(projectPath, TRACKER_PATH), "utf-8");
    const data = JSON.parse(raw);
    return data?.pages ?? {};
  } catch {
    return {};
  }
}

export async function writeWikiPageTracker(projectPath, pages) {
  const outPath = path.join(projectPath, TRACKER_PATH);
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify({ pages }, null, 2) + "\n", "utf-8");
}

/**
 * Update tracker after wiki page builds.
 * @param {string} projectPath
 * @param {{ page: string, mode: string }[]} pageResults - results from runWikiPagePhase
 */
export async function updateWikiPageTracker(projectPath, pageResults) {
  const tracker = await readWikiPageTracker(projectPath);
  const now = new Date().toISOString();

  for (const { page, mode } of pageResults) {
    const existing = tracker[page] ?? { incremental_edit_count: 0, last_full_rebuild: null, last_edited: null };

    if (mode === "full_rewrite") {
      tracker[page] = {
        incremental_edit_count: 0,
        last_full_rebuild: now,
        last_edited: now,
      };
    } else {
      tracker[page] = {
        ...existing,
        incremental_edit_count: (existing.incremental_edit_count ?? 0) + 1,
        last_edited: now,
      };
    }
  }

  await writeWikiPageTracker(projectPath, tracker);
}

/**
 * Reset all page trackers (used after full rebuild).
 */
export async function resetWikiPageTracker(projectPath) {
  const tracker = await readWikiPageTracker(projectPath);
  const now = new Date().toISOString();

  for (const page of Object.keys(tracker)) {
    tracker[page] = {
      incremental_edit_count: 0,
      last_full_rebuild: now,
      last_edited: now,
    };
  }

  await writeWikiPageTracker(projectPath, tracker);
}

// ── Digest mtime comparison ─────────────────────────────────────────

/**
 * List digest files that have been modified since the last build.
 * If no manifest or no last_build timestamp, returns all digest files.
 */
async function findNewOrUpdatedDigests(projectPath, lastBuildTimestamp) {
  const digestDir = path.join(projectPath, "sources", "digests");
  const newDigests = [];

  let entries;
  try {
    entries = await fs.readdir(digestDir, { withFileTypes: true });
  } catch {
    return newDigests;
  }

  const lastBuildMs = lastBuildTimestamp ? new Date(lastBuildTimestamp).getTime() : 0;

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;

    try {
      const stat = await fs.stat(path.join(digestDir, entry.name));
      if (stat.mtimeMs > lastBuildMs) {
        newDigests.push(`sources/digests/${entry.name}`);
      }
    } catch {
      // Skip unreadable files
    }
  }

  return newDigests;
}

/**
 * List all digest files for a given set of topic IDs.
 */
function collectTopicDigests(topics, topicIds) {
  const digests = new Set();

  for (const topicId of topicIds) {
    const topic = topics.find((t) => t.id === topicId);
    if (!topic) continue;

    for (const source of topic.sources ?? []) {
      const sourcePath = typeof source === "string" ? source : source.path;
      if (!sourcePath) continue;
      // Map source path to its digest file
      const baseName = path.basename(sourcePath);
      digests.add(`sources/digests/${baseName}`);
    }
  }

  return [...digests];
}

/**
 * Determine which wiki pages need updating based on what changed.
 *
 * @param {string} projectPath
 * @param {object} scope - from computeBuildScope (needs: isFirstBuild, projectMdChanged, feedbackMarkers, humanInputsChanged)
 * @param {string[]} changedDigests - digest paths that changed (from content-hash ledger diff)
 * @param {boolean} isFullRebuild - user requested full rebuild
 * @returns {Promise<{ action: "skip"|"targeted"|"full", affectedPages: Array, unchangedPages: Array, fullRebuildReason: string|null }>}
 */
export async function computeWikiTriage(projectPath, scope, changedDigests, isFullRebuild = false) {
  // ── Forced full rebuild ──
  if (isFullRebuild) {
    return { action: "full", affectedPages: [], unchangedPages: [], fullRebuildReason: "user_requested" };
  }

  // ── Full rebuild triggers ──
  if (scope.isFirstBuild) {
    return { action: "full", affectedPages: [], unchangedPages: [], fullRebuildReason: "first_build" };
  }
  if (scope.projectMdChanged) {
    return { action: "full", affectedPages: [], unchangedPages: [], fullRebuildReason: "project_md_changed" };
  }

  // ── Read project data ──
  const topicsData = await readTopics(projectPath);
  const topics = topicsData.topics ?? [];
  const questionsData = await readQuestions(projectPath);

  // Check for deepen-queued topics
  const deepenTopics = topics.filter((t) => t.queued_for_deepen);

  // Check for human-answered questions (not auto-answered by AI)
  const pendingAnswers = questionsData.questions.filter(
    (q) => q.status === "answered" && q.answeredBy && q.answeredBy !== "ai_auto",
  );

  // Check for topics with sources but no wiki page
  const hasTopicsWithoutWiki = topics.some(
    (t) => t.state !== "deprecated" && t.state !== "seed" && !t.wiki_page && (t.sources?.length ?? 0) > 0,
  );

  // ── Skip trigger: content-hash ledger says nothing changed ──
  if (
    changedDigests.length === 0 &&
    scope.feedbackMarkers.length === 0 &&
    pendingAnswers.length === 0 &&
    !scope.humanInputsChanged &&
    deepenTopics.length === 0 &&
    !hasTopicsWithoutWiki
  ) {
    return { action: "skip", affectedPages: [], unchangedPages: [], fullRebuildReason: null };
  }

  // ── Targeted: map changes to affected pages ──
  // Build reverse index: source file basename → topic IDs
  const sourceToTopics = new Map();
  for (const topic of topics) {
    for (const source of topic.sources ?? []) {
      const sourcePath = typeof source === "string" ? source : source.path;
      if (!sourcePath) continue;
      const baseName = path.basename(sourcePath);
      if (!sourceToTopics.has(baseName)) sourceToTopics.set(baseName, []);
      sourceToTopics.get(baseName).push(topic.id);
    }
  }

  // Build forward index: topic ID → wiki page
  const topicToWikiPage = new Map();
  const topicsNeedingWikiPage = [];
  for (const topic of topics) {
    if (topic.wiki_page) {
      topicToWikiPage.set(topic.id, topic.wiki_page);
    } else if (
      topic.state !== "deprecated" &&
      topic.state !== "seed" &&
      (topic.sources?.length ?? 0) > 0
    ) {
      // Topic has sources but no wiki page — assign one
      const slug = topic.id
        .replace(/^topic_/, "")
        .replace(/_[a-z0-9]{8}$/, "")
        .replace(/[^a-z0-9_]/gi, "_")
        .replace(/_+/g, "_")
        .toLowerCase();
      const wikiPage = `outputs_ai/wiki/${slug}.md`;
      topicToWikiPage.set(topic.id, wikiPage);
      topic.wiki_page = wikiPage;
      topicsNeedingWikiPage.push(topic);
    }
  }

  // Persist any newly assigned wiki_page values
  if (topicsNeedingWikiPage.length > 0) {
    await writeTopics(projectPath, topics, topicsData.clusters);
  }

  // Collect affected pages with reasons
  const affectedMap = new Map(); // wikiPage → { topicIds, reasons, newDigests }

  function addAffectedPage(wikiPage, topicId, reason) {
    if (!wikiPage) return;
    if (!affectedMap.has(wikiPage)) {
      affectedMap.set(wikiPage, { topicIds: new Set(), reasons: new Set(), newDigests: new Set(), feedbackMarkers: [] });
    }
    const entry = affectedMap.get(wikiPage);
    if (topicId) entry.topicIds.add(topicId);
    entry.reasons.add(reason);
  }

  // 0. Topics that just received a wiki_page assignment → always affected
  for (const topic of topicsNeedingWikiPage) {
    addAffectedPage(topic.wiki_page, topic.id, "new wiki page (first creation)");
  }

  // 1. Changed sources → topics → wiki pages
  for (const digestPath of changedDigests) {
    const baseName = path.basename(digestPath);
    const topicIds = sourceToTopics.get(baseName) ?? [];
    for (const topicId of topicIds) {
      const wikiPage = topicToWikiPage.get(topicId);
      addAffectedPage(wikiPage, topicId, "new/updated source");
      if (wikiPage && affectedMap.has(wikiPage)) {
        affectedMap.get(wikiPage).newDigests.add(digestPath);
      }
    }
  }

  // 2. FEEDBACK markers → direct file mapping
  for (const markerPath of scope.feedbackMarkers) {
    if (markerPath.startsWith("outputs_ai/wiki/")) {
      // Direct wiki file marker
      addAffectedPage(markerPath, null, "FEEDBACK marker");
      if (affectedMap.has(markerPath)) {
        affectedMap.get(markerPath).feedbackMarkers.push(markerPath);
      }
    } else if (markerPath.startsWith("sources/")) {
      // Source file marker → map to topic → wiki page
      const baseName = path.basename(markerPath);
      const topicIds = sourceToTopics.get(baseName) ?? [];
      for (const topicId of topicIds) {
        const wikiPage = topicToWikiPage.get(topicId);
        addAffectedPage(wikiPage, topicId, "FEEDBACK marker in source");
      }
    }
  }

  // 3. Answered questions → related topics → wiki pages
  for (const question of pendingAnswers) {
    for (const topicId of question.relatedTopics ?? []) {
      const wikiPage = topicToWikiPage.get(topicId);
      addAffectedPage(wikiPage, topicId, "answered question");
    }
  }

  // 4. Deepen-queued topics → wiki pages
  // For deepen-queued topics, also inject digest paths from the research plan
  // since topic.sources hasn't been reconciled yet at this point.
  let researchPlanDigests = new Map();
  if (deepenTopics.length > 0) {
    try {
      researchPlanDigests = await getResearchPlanDigestMapping(projectPath, topics);
    } catch {
      // Non-fatal: fall back to existing topic.sources mapping
    }
  }

  for (const topic of deepenTopics) {
    const wikiPage = topicToWikiPage.get(topic.id);
    addAffectedPage(wikiPage, topic.id, "queued for deepening");

    // Inject research-plan-derived digests as new evidence for the wiki page
    const planDigests = researchPlanDigests.get(topic.id) ?? [];
    if (wikiPage && affectedMap.has(wikiPage)) {
      const entry = affectedMap.get(wikiPage);
      for (const digestPath of planDigests) {
        entry.newDigests.add(digestPath);
      }
    }
  }

  // 5. Dependencies: if a topic is affected, also flag its dependents
  const affectedTopicIds = new Set();
  for (const entry of affectedMap.values()) {
    for (const topicId of entry.topicIds) {
      affectedTopicIds.add(topicId);
    }
  }

  for (const topic of topics) {
    const deps = topic.depends_on ?? [];
    for (const depId of deps) {
      if (affectedTopicIds.has(depId) && !affectedTopicIds.has(topic.id)) {
        const wikiPage = topicToWikiPage.get(topic.id);
        addAffectedPage(wikiPage, topic.id, `dependency on affected topic ${depId}`);
        affectedTopicIds.add(topic.id);
      }
    }
  }

  // 6. Determine mode per page (incremental vs full_rewrite)
  const tracker = await readWikiPageTracker(projectPath);
  const threshold = await getWikiRebuildThreshold(projectPath);

  const affectedPages = [];
  for (const [page, entry] of affectedMap) {
    const pageTracker = tracker[page];
    const editCount = pageTracker?.incremental_edit_count ?? 0;
    // New pages (no tracker entry) always get full_rewrite; existing pages use threshold
    const isNewPage = !pageTracker;
    const mode = isNewPage || editCount >= threshold ? "full_rewrite" : "incremental";

    const topicIds = [...entry.topicIds];
    const allTopicDigests = collectTopicDigests(topics, topicIds);

    affectedPages.push({
      page,
      topicIds,
      reason: [...entry.reasons].join("; "),
      mode,
      newDigests: [...entry.newDigests],
      allTopicDigests,
      feedbackMarkers: entry.feedbackMarkers,
    });
  }

  // Collect unchanged pages
  const affectedPageSet = new Set(affectedPages.map((p) => p.page));
  const unchangedPages = topics
    .filter((t) => t.wiki_page && !affectedPageSet.has(t.wiki_page))
    .map((t) => t.wiki_page);

  return { action: "targeted", affectedPages, unchangedPages, fullRebuildReason: null };
}

// ── Wiki index regeneration ─────────────────────────────────────────

/**
 * Regenerate outputs_ai/wiki/_index.md by reading the first heading and
 * first paragraph of each wiki page. Pure file I/O — no LLM needed.
 */
export async function regenerateWikiIndex(projectPath) {
  const wikiDir = path.join(projectPath, "outputs_ai", "wiki");

  let entries;
  try {
    entries = await fs.readdir(wikiDir, { withFileTypes: true });
  } catch {
    return; // No wiki directory
  }

  const pages = entries
    .filter((e) => e.isFile() && e.name.endsWith(".md") && e.name !== "_index.md")
    .sort((a, b) => a.name.localeCompare(b.name));

  const lines = ["# Wiki Index", ""];

  for (const pageEntry of pages) {
    try {
      const content = await fs.readFile(path.join(wikiDir, pageEntry.name), "utf-8");
      const headingMatch = content.match(/^#\s+(.+)$/m);
      const title = headingMatch?.[1]?.trim() || pageEntry.name.replace(/\.md$/, "");

      // Extract first non-empty paragraph after the heading
      const afterHeading = content.slice((headingMatch?.index ?? 0) + (headingMatch?.[0]?.length ?? 0));
      const paragraphs = afterHeading.split(/\n\s*\n/).filter((p) => p.trim() && !p.trim().startsWith("#"));
      const summary = paragraphs[0]?.trim().slice(0, 200) || "";

      lines.push(`## [${title}](${pageEntry.name})`);
      if (summary) {
        lines.push("", summary + (summary.length >= 200 ? "…" : ""));
      }
      lines.push("");
    } catch {
      // Skip unreadable files
    }
  }

  await fs.writeFile(path.join(wikiDir, "_index.md"), lines.join("\n"), "utf-8");
}
