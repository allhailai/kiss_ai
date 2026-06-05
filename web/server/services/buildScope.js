import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";


function hashText(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

// ── Read manifest ───────────────────────────────────────────────────
async function readManifest(projectPath) {
  const manifestPath = path.join(projectPath, ".build", "manifest.json");
  try {
    return JSON.parse(await fs.readFile(manifestPath, "utf-8"));
  } catch {
    return null;
  }
}

// ── Git diff helper ─────────────────────────────────────────────────
function gitDiffText(projectPath, relativePath) {
  return new Promise((resolve) => {
    execFile("git", ["diff", "--", relativePath], { cwd: projectPath }, (error, stdout) => {
      if (error) {
        resolve("");
        return;
      }
      resolve(stdout);
    });
  });
}

// ── Scan for annotation markers ─────────────────────────────────────
// Matches both COMMENT: (current UI) and FEEDBACK: (legacy)
const FEEDBACK_PATTERN = /<!--\s*(?:COMMENT|FEEDBACK):/;


export async function scanMarkersInDirectory(directoryPath, projectPath) {
  const feedbackPaths = [];

  async function walk(currentPath) {
    let entries;
    try {
      entries = await fs.readdir(currentPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const fullPath = path.join(currentPath, entry.name);

      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }

      if (!entry.name.endsWith(".md")) continue;

      try {
        const content = await fs.readFile(fullPath, "utf-8");
        const relativePath = path.relative(projectPath, fullPath).replaceAll(path.sep, "/");

        if (FEEDBACK_PATTERN.test(content)) {
          feedbackPaths.push(relativePath);
        }
      } catch {
        // Skip unreadable files
      }
    }
  }

  await walk(directoryPath);
  return { feedbackPaths };
}

// ── Detect affected outputs from diff text ──────────────────────────
export function detectAffectedOutputs(diffText, manifest) {
  if (!manifest || !diffText) return [];
  const wikiPages = manifest.wiki_pages ?? [];
  if (!wikiPages.length) return [];

  const affected = [];

  // If the diff touches the Topics section, all wiki pages are affected
  if (/^\+.*##\s*Topics/m.test(diffText) || /^-.*##\s*Topics/m.test(diffText)) {
    affected.push(...wikiPages);
  }

  return [...new Set(affected)];
}

// ── Compare inputs_human inventory ──────────────────────────────────
async function listHumanInputFiles(projectPath) {
  const inputDir = path.join(projectPath, "inputs_human");
  const files = [];

  async function walk(currentPath) {
    let entries;
    try {
      entries = await fs.readdir(currentPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const fullPath = path.join(currentPath, entry.name);

      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }

      files.push(path.relative(projectPath, fullPath).replaceAll(path.sep, "/"));
    }
  }

  await walk(inputDir);
  return files.sort();
}

// ── Compare source inventory ────────────────────────────────────────
async function listSourceFiles(projectPath) {
  const sourceDir = path.join(projectPath, "sources", "web_research");
  try {
    const entries = await fs.readdir(sourceDir);
    return entries.filter((f) => f.endsWith(".md")).sort();
  } catch {
    return [];
  }
}

async function hashSourceInventory(projectPath) {
  const files = await listSourceFiles(projectPath);
  if (files.length === 0) return { hash: "", count: 0, files };

  // Hash both the file list AND the size of each file (so replaced stubs are detected)
  const details = [];
  for (const f of files) {
    try {
      const stat = await fs.stat(path.join(projectPath, "sources", "web_research", f));
      details.push(`${f}:${stat.size}`);
    } catch {
      details.push(`${f}:0`);
    }
  }

  return { hash: hashText(details.join("\n")), count: files.length, files };
}

// ── Main export ─────────────────────────────────────────────────────
export async function computeBuildScope(projectPath) {
  const manifest = await readManifest(projectPath);
  const isFirstBuild = !manifest || !manifest.last_build;

  // Hash project.md
  let projectMdHash = "";
  let projectMdContent = "";
  try {
    projectMdContent = await fs.readFile(path.join(projectPath, "project.md"), "utf-8");
    projectMdHash = hashText(projectMdContent);
  } catch {
    // project.md missing — treat as first build
  }

  const projectMdChanged = isFirstBuild || projectMdHash !== (manifest?.project_md_hash ?? "");

  // Get diff if changed
  let projectMdDiff = "";
  if (projectMdChanged && !isFirstBuild) {
    projectMdDiff = await gitDiffText(projectPath, "project.md");
  }

  // Scan for annotation markers
  const sourcesMarkers = await scanMarkersInDirectory(path.join(projectPath, "sources"), projectPath);
  const outputsMarkers = await scanMarkersInDirectory(path.join(projectPath, "outputs_ai"), projectPath);

  const feedbackMarkers = [...sourcesMarkers.feedbackPaths, ...outputsMarkers.feedbackPaths].sort();

  // NOTE: humanInputsChanged and projectMdChanged are now also computed
  // by the content-hash ledger (diffSnapshot). The values here are kept
  // for backward compatibility with skipResearchPlan and prompt builders.
  // The ledger is the authoritative source for change detection.

  // Check topics for conditions that require Phase 1 to run
  // (dynamic import to avoid circular dependency with topicsService)
  let hasUnsourcedTopics = false;
  let hasDeepenQueue = false;
  let unsourcedTopicCount = 0;
  let deepenQueueCount = 0;

  try {
    const { readTopics } = await import("./topicsService.js");
    const topicsData = await readTopics(projectPath);
    const activeTopics = topicsData.topics.filter(
      (t) => t.state !== "deprecated" && t.state !== "seed",
    );

    const unsourced = activeTopics.filter(
      (t) => !Array.isArray(t.sources) || t.sources.length === 0,
    );
    hasUnsourcedTopics = unsourced.length > 0;
    unsourcedTopicCount = unsourced.length;

    const deepenQueued = activeTopics.filter((t) => t.queued_for_deepen);
    hasDeepenQueue = deepenQueued.length > 0;
    deepenQueueCount = deepenQueued.length;
  } catch {
    // topics.json doesn't exist yet — not a reason to skip
  }

  // Determine if we can skip the research plan phase
  // Phase 1 must run if: first build, project.md changed, feedback markers,
  // unsourced topics that need initial research, or deepen-queued topics
  const skipResearchPlan = !isFirstBuild
    && !projectMdChanged
    && feedbackMarkers.length === 0
    && !hasUnsourcedTopics
    && !hasDeepenQueue;

  return {
    isFirstBuild,
    projectMdChanged,
    projectMdHash,
    projectMdDiff,
    feedbackMarkers,
    skipResearchPlan,
    hasUnsourcedTopics,
    unsourcedTopicCount,
    hasDeepenQueue,
    deepenQueueCount,
  };
}
