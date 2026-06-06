import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { readTopics } from "./topicsService.js";

const ARTIFACT_SPECS_DIR = "artifacts/artifact_specs";
const ARTIFACT_BUILDS_DIR = "artifacts/builds";

// Derive a human-readable display name from a slug.
// Mirrors the humanizePathSegment logic used everywhere else in the system.
function humanizeSlug(slug) {
  const spaced = slug.replace(/[_-]+/g, " ").replace(/([a-z0-9])([A-Z])/g, "$1 $2").trim();
  if (!spaced) return slug;
  return spaced.split(/\s+/).map((word) => {
    const lower = word.toLowerCase();
    if (lower.length <= 3) return lower.toUpperCase();
    return `${lower.charAt(0).toUpperCase()}${lower.slice(1)}`;
  }).join(" ");
}

/**
 * Simple glob-like file matching using Node's native fs.
 * Supports patterns like: outputs_ai/wiki/*.md, outputs_ai/**\/*.md
 */
async function simpleGlob(pattern, cwd) {
  // Split pattern into directory prefix and file pattern
  const parts = pattern.split("/");
  const hasGlob = parts.findIndex((p) => p.includes("*"));

  if (hasGlob === -1) {
    // No glob — it's a literal file path
    try {
      await fs.access(path.join(cwd, pattern));
      return [pattern];
    } catch {
      return [];
    }
  }

  // Get the fixed prefix (directories before the first glob segment)
  const fixedPrefix = parts.slice(0, hasGlob).join("/");
  const globParts = parts.slice(hasGlob);

  // Read all files recursively from the fixed prefix
  const baseDir = path.join(cwd, fixedPrefix);
  const allFiles = await readDirRecursive(baseDir, fixedPrefix);

  // Build a simple regex from the remaining glob pattern
  const globRegex = globPartsToRegex(globParts);
  return allFiles.filter((f) => {
    const relative = fixedPrefix ? f.slice(fixedPrefix.length + 1) : f;
    return globRegex.test(relative);
  });
}

async function readDirRecursive(dir, prefix) {
  const results = [];

  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      results.push(...(await readDirRecursive(fullPath, relativePath)));
    } else {
      results.push(relativePath);
    }
  }

  return results;
}

function globPartsToRegex(parts) {
  const regexStr = parts
    .map((part) => {
      if (part === "**") return ".*";
      return part
        .replace(/[.+^${}()|[\]\\]/g, "\\$&")
        .replace(/\*/g, "[^/]*");
    })
    .join("/");

  return new RegExp(`^${regexStr}$`);
}

/**
 * Ensure the artifact directory structure exists.
 */
export async function ensureArtifactDirs(projectPath) {
  await fs.mkdir(path.join(projectPath, ARTIFACT_SPECS_DIR), { recursive: true });
  await fs.mkdir(path.join(projectPath, ARTIFACT_BUILDS_DIR), { recursive: true });
}

/**
 * List all artifact specs in a project.
 * Returns an array of { slug, name, format, lifecycle, sources, lastBuilt, status }.
 */
export async function listArtifactSpecs(projectPath) {
  const specsDir = path.join(projectPath, ARTIFACT_SPECS_DIR);

  let files;
  try {
    files = await fs.readdir(specsDir);
  } catch {
    return [];
  }

  // Pre-load topics data once for deepening checks
  let topicsData = null;
  try {
    topicsData = await readTopics(projectPath);
  } catch { /* topics may not exist */ }

  const specs = [];

  for (const file of files) {
    if (!file.endsWith(".artifact.md")) continue;

    const slug = file.replace(/\.artifact\.md$/, "");

    try {
      const raw = await fs.readFile(path.join(specsDir, file), "utf8");
      const { data: frontmatter } = matter(raw);
      const buildStatus = await getArtifactBuildStatus(projectPath, slug);
      const lastBuilt = buildStatus?.builtAt || null;

      // Compute current spec content hash
      const currentSpecHash = crypto.createHash("sha256").update(raw).digest("hex");

      // Check if linked topic was deepened after last build
      let sourcesUpdatedSinceLastBuild = false;
      if (lastBuilt && topicsData && frontmatter.topicId) {
        const linkedTopic = topicsData.topics.find((t) => t.id === frontmatter.topicId);
        if (linkedTopic?.discovery?.last_deepened && linkedTopic.discovery.last_deepened > lastBuilt) {
          sourcesUpdatedSinceLastBuild = true;
        }
      }

      specs.push({
        slug,
        name: humanizeSlug(slug),
        format: frontmatter.format || "html",
        lifecycle: frontmatter.lifecycle || "manual",
        modelId: frontmatter.modelId || null,
        sources: frontmatter.sources || [],
        outputFile: frontmatter.outputFile || null,
        lastBuilt,
        status: buildStatus ? "built" : "not_built",
        buildSpecHash: buildStatus?.specHash || null,
        currentSpecHash,
        sourcesUpdatedSinceLastBuild,
      });
    } catch {
      specs.push({
        slug,
        name: slug,
        format: "html",
        lifecycle: "manual",
        modelId: null,
        sources: [],
        lastBuilt: null,
        status: "error",
        buildSpecHash: null,
        currentSpecHash: null,
        sourcesUpdatedSinceLastBuild: false,
      });
    }
  }

  return specs;
}

/**
 * Read a single artifact spec. Returns { slug, frontmatter, body, rawContent }.
 */
export async function readArtifactSpec(projectPath, slug) {
  const filePath = path.join(projectPath, ARTIFACT_SPECS_DIR, `${slug}.artifact.md`);
  const rawContent = await fs.readFile(filePath, "utf8");
  const { data: frontmatter, content: body } = matter(rawContent);

  return {
    slug,
    frontmatter,
    body: body.trim(),
    rawContent,
  };
}

/**
 * Write or update an artifact spec file.
 * Accepts frontmatter (object) and body (markdown string).
 */
export async function writeArtifactSpec(projectPath, slug, frontmatter, body) {
  await ensureArtifactDirs(projectPath);

  const filePath = path.join(projectPath, ARTIFACT_SPECS_DIR, `${slug}.artifact.md`);
  const content = matter.stringify(body.trim() + "\n", frontmatter);
  await fs.writeFile(filePath, content, "utf8");

  return { slug, filePath };
}

/**
 * Delete an artifact spec file.
 */
export async function deleteArtifactSpec(projectPath, slug) {
  const filePath = path.join(projectPath, ARTIFACT_SPECS_DIR, `${slug}.artifact.md`);
  await fs.unlink(filePath);
}

/**
 * Read the build manifest for a built artifact.
 * Returns the manifest object or null if not built.
 */
export async function getArtifactBuildStatus(projectPath, slug) {
  const manifestPath = path.join(projectPath, ARTIFACT_BUILDS_DIR, slug, ".artifact-manifest.json");

  try {
    const raw = await fs.readFile(manifestPath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Resolve explicit source paths from the artifact spec into actual file paths and contents.
 * These are the priority/hint sources the user or agent has explicitly listed.
 * Returns an array of { relativePath, content }.
 */
export async function resolveArtifactSources(projectPath, sourceGlobs) {
  if (!sourceGlobs || sourceGlobs.length === 0) return [];

  const resolvedFiles = new Set();

  for (const pattern of sourceGlobs) {
    // Skip legacy "all" — empty sources now means agent auto-discovers
    if (pattern === "all") continue;

    const matches = await simpleGlob(pattern, projectPath);
    matches.forEach((f) => resolvedFiles.add(f));
  }

  const results = [];

  for (const relativePath of resolvedFiles) {
    try {
      const content = await fs.readFile(path.join(projectPath, relativePath), "utf8");
      results.push({ relativePath, content });
    } catch {
      // Skip files that can't be read
    }
  }

  return results;
}

/**
 * Discover all available source files for progressive discovery.
 * Scans outputs_ai/ and artifacts/builds/ to produce a lightweight inventory
 * with file path + snippet (first ~200 chars) for each file.
 * The agent uses this to decide what additional files to read beyond explicit sources.
 * Returns an array of { relativePath, snippet, kind }.
 */
export async function discoverRelevantSources(projectPath, excludePaths = []) {
  const excludeSet = new Set(excludePaths);
  const inventory = [];

  // Scan outputs_ai/ for all markdown files (wiki, reports, directed outputs)
  try {
    const outputFiles = await readDirRecursive(path.join(projectPath, "outputs_ai"), "outputs_ai");
    for (const relativePath of outputFiles) {
      if (excludeSet.has(relativePath)) continue;
      if (!relativePath.endsWith(".md")) continue;

      try {
        const content = await fs.readFile(path.join(projectPath, relativePath), "utf8");
        const snippet = content.slice(0, 200).replace(/\n/g, " ").trim();
        const kind = relativePath.startsWith("outputs_ai/wiki/")
          ? "wiki"
          : relativePath.startsWith("outputs_ai/reports/")
            ? "report"
            : relativePath.startsWith("outputs_ai/directed_outputs/")
              ? "directed"
              : "output";
        inventory.push({ relativePath, snippet, kind });
      } catch {
        // Skip unreadable files
      }
    }
  } catch {
    // outputs_ai/ may not exist yet
  }

  // NOTE: We intentionally do NOT include artifacts/builds/ in the discovery
  // inventory. Listing other built artifacts here caused the Cursor agent to
  // "helpfully" read and rebuild them during a single-artifact build, even
  // though the prompt only targets one artifact. The agent only needs wiki
  // pages, reports, and directed outputs as context.

  return inventory;
}

/**
 * List all files available as artifact sources for the suggest-a-file UI.
 * Returns a flat list of { relativePath, kind, name } for the frontend picker.
 */
export async function listAvailableSourceFiles(projectPath) {
  const files = [];

  // outputs_ai/ tree
  try {
    const outputFiles = await readDirRecursive(path.join(projectPath, "outputs_ai"), "outputs_ai");
    for (const relativePath of outputFiles) {
      if (!relativePath.endsWith(".md")) continue;
      const kind = relativePath.startsWith("outputs_ai/wiki/")
        ? "wiki"
        : relativePath.startsWith("outputs_ai/reports/")
          ? "report"
          : relativePath.startsWith("outputs_ai/directed_outputs/")
            ? "directed"
            : "output";
      const name = path.basename(relativePath, ".md").replace(/[_-]/g, " ");
      files.push({ relativePath, kind, name });
    }
  } catch {
    // outputs_ai/ may not exist
  }

  // artifacts/builds/ — built artifacts
  try {
    const buildDirs = await fs.readdir(path.join(projectPath, ARTIFACT_BUILDS_DIR), { withFileTypes: true });
    for (const entry of buildDirs) {
      if (!entry.isDirectory()) continue;
      const manifestPath = path.join(projectPath, ARTIFACT_BUILDS_DIR, entry.name, ".artifact-manifest.json");
      try {
        const manifestRaw = await fs.readFile(manifestPath, "utf8");
        const manifest = JSON.parse(manifestRaw);
        files.push({
          relativePath: `artifacts/builds/${entry.name}/index.html`,
          kind: "artifact",
          name: humanizeSlug(entry.name),
        });
      } catch {
        // Not built yet, skip
      }
    }
  } catch {
    // artifacts/builds/ may not exist
  }

  return files;
}

/**
 * Get the path where a built artifact's index.html lives.
 */
export function getArtifactBuildPath(projectPath, slug) {
  return path.join(projectPath, ARTIFACT_BUILDS_DIR, slug);
}

/**
 * Read the built artifact HTML for preview.
 * Throws with code ENOENT if the artifact has not been built yet.
 */
export async function readArtifactPreviewHtml(projectPath, slug) {
  const htmlPath = path.join(projectPath, ARTIFACT_BUILDS_DIR, slug, "index.html");
  return await fs.readFile(htmlPath, "utf8");
}

/**
 * Rename an artifact by changing its slug.
 * Renames the spec file, build directory, updates the build manifest slug,
 * and patches cross-references in other spec sources and build manifests.
 */
export async function renameArtifact(projectPath, oldSlug, newSlug) {
  // Validate newSlug format
  if (!newSlug || !/^[a-z0-9][a-z0-9_]*$/.test(newSlug)) {
    throw Object.assign(new Error(`Invalid artifact slug: "${newSlug}". Use lowercase alphanumeric and underscores.`), { statusCode: 400, code: "invalid_artifact_slug" });
  }

  if (oldSlug === newSlug) {
    throw Object.assign(new Error("Old and new slugs are identical."), { statusCode: 400, code: "artifact_rename_noop" });
  }

  const oldSpecPath = path.join(projectPath, ARTIFACT_SPECS_DIR, `${oldSlug}.artifact.md`);
  const newSpecPath = path.join(projectPath, ARTIFACT_SPECS_DIR, `${newSlug}.artifact.md`);

  // Verify old spec exists
  try {
    await fs.access(oldSpecPath);
  } catch {
    throw Object.assign(new Error(`Artifact spec not found: ${oldSlug}`), { statusCode: 404, code: "artifact_not_found" });
  }

  // Verify new spec does NOT exist
  try {
    await fs.access(newSpecPath);
    throw Object.assign(new Error(`Artifact slug already exists: ${newSlug}`), { statusCode: 409, code: "artifact_slug_conflict" });
  } catch (err) {
    if (err.statusCode === 409) throw err;
    // ENOENT is expected — new path should not exist
  }

  // 1. Rename spec file
  await fs.rename(oldSpecPath, newSpecPath);

  // 2. Rename build directory (if it exists)
  const oldBuildDir = path.join(projectPath, ARTIFACT_BUILDS_DIR, oldSlug);
  const newBuildDir = path.join(projectPath, ARTIFACT_BUILDS_DIR, newSlug);

  let hasBuild = false;
  try {
    await fs.access(oldBuildDir);
    hasBuild = true;
  } catch {
    // No build directory — that's fine
  }

  if (hasBuild) {
    await fs.rename(oldBuildDir, newBuildDir);

    // 3. Update manifest slug field
    const manifestPath = path.join(newBuildDir, ".artifact-manifest.json");
    try {
      const raw = await fs.readFile(manifestPath, "utf8");
      const manifest = JSON.parse(raw);
      manifest.slug = newSlug;
      await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
    } catch {
      // Manifest may not exist or be malformed — non-critical
    }
  }

  // 4. Update cross-references in other spec files and build manifests
  const oldBuildPath = `artifacts/builds/${oldSlug}/index.html`;
  const newBuildPath = `artifacts/builds/${newSlug}/index.html`;
  await updateCrossReferences(projectPath, oldBuildPath, newBuildPath, oldSlug, newSlug);

  return { oldSlug, newSlug };
}

/**
 * Scan all artifact specs and build manifests to update references
 * from old artifact paths/slugs to new ones.
 */
async function updateCrossReferences(projectPath, oldBuildPath, newBuildPath, oldSlug, newSlug) {
  // Update sources: in spec frontmatter
  const specsDir = path.join(projectPath, ARTIFACT_SPECS_DIR);
  try {
    const files = await fs.readdir(specsDir);
    for (const file of files) {
      if (!file.endsWith(".artifact.md")) continue;
      const filePath = path.join(specsDir, file);
      const raw = await fs.readFile(filePath, "utf8");
      if (!raw.includes(oldBuildPath)) continue;

      const updated = raw.replaceAll(oldBuildPath, newBuildPath);
      await fs.writeFile(filePath, updated, "utf8");
    }
  } catch {
    // specs dir may not exist
  }

  // Update sourcesUsed in build manifests
  const buildsDir = path.join(projectPath, ARTIFACT_BUILDS_DIR);
  try {
    const dirs = await fs.readdir(buildsDir, { withFileTypes: true });
    for (const entry of dirs) {
      if (!entry.isDirectory() || entry.name === newSlug) continue;
      const manifestPath = path.join(buildsDir, entry.name, ".artifact-manifest.json");
      try {
        const raw = await fs.readFile(manifestPath, "utf8");
        if (!raw.includes(oldBuildPath)) continue;

        const updated = raw.replaceAll(oldBuildPath, newBuildPath);
        await fs.writeFile(manifestPath, updated, "utf8");
      } catch {
        // No manifest — skip
      }
    }
  } catch {
    // builds dir may not exist
  }
}

/**
 * Slugify a name into a valid artifact slug.
 */
export function slugifyArtifactName(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

// ── Auto-Artifact Prompt Templates ────────────────────────────────────

const PROJECT_OVERVIEW_PROMPT_BODY = `## Goal

Produce a comprehensive, visually rich overview of this project that communicates the full scope of research findings in alignment with the project's stated goal. The artifact should function as a standalone executive briefing — someone unfamiliar with the project should be able to understand what it is, why it matters, what was found, and what the implications are.

## Information Architecture

Structure the content in a **progressive disclosure hierarchy** — start broad, then drill deeper:

### 1. Executive Summary (above the fold)
- Project title, one-paragraph thesis, and 3–5 key takeaways as bold callout cards
- A high-level status/maturity indicator (how complete is the research?)
- Visual: a **hero diagram** showing the project's conceptual model or framework

### 2. Thematic Overview
- Group all research findings into 3–7 major themes
- Each theme gets a summary card with: title, one-sentence finding, confidence level, and a relevance indicator
- Visual: a **thematic map** or **concept cluster diagram** (inline SVG) showing how themes relate to each other and to the central thesis

### 3. Theme Deep Dives (tabbed or accordion sections)
- For each theme, provide:
  - A 2–3 paragraph synthesis of findings
  - Key evidence points with source attribution
  - Implications and open questions
- Visual per theme: at least one of — data table, comparison matrix, process flow, or relationship diagram

### 4. Cross-Cutting Analysis
- What patterns emerge across themes?
- Where do findings reinforce or contradict each other?
- Visual: a **findings matrix** (table with themes on one axis and evaluation criteria on another, using color-coded status indicators)

### 5. Knowledge Gaps & Next Steps
- What questions remain unanswered?
- What areas need deeper investigation?
- Visual: a **research coverage heatmap** or gap analysis table

## Visualizations

Use **inline SVG** for all diagrams. Make them information-dense and visually polished. Specific requirements:

- **Concept/relationship diagrams**: Use nodes and edges with labeled connections. Color-code by theme. Make nodes interactive (hover for detail).
- **Data tables**: Zebra-striped, sortable if more than 10 rows. Use color-coded badges for status/confidence levels.
- **Comparison matrices**: Grid layout with color fills (green/amber/red or a branded gradient). Include a legend.
- **Process/flow diagrams**: Horizontal or vertical flowcharts with clear directional arrows and phase labels.
- **Metric callouts**: Large-number stat cards for key quantitative findings (if applicable).
- **Progress/coverage indicators**: Horizontal bar charts or radial progress indicators showing research completeness by area.

## Content Transformations

- Synthesize — don't copy-paste. The artifact should read as a cohesive narrative, not a collection of file excerpts.
- Attribute key claims to their source files (e.g., "[from: topic_name.md]") using subtle inline citations.
- If the source data contains lists of items, transform them into visual tables or categorized card layouts rather than bullet lists.
- Convert any quantitative findings into charts rather than prose.

## Design Direction

- Use the project's design identity tokens for all colors, fonts, and spacing
- Dark or light theme based on the identity file's guidance
- Clean, editorial layout — generous whitespace, clear typographic hierarchy
- Interactive elements: collapsible sections, hover tooltips on diagram nodes, tab navigation between themes
- Print-friendly: include \`@media print\` styles that linearize the layout and hide interactive controls`;

function buildTopicDeepDivePromptBody(topicLabel) {
  return `## Goal

Produce a focused, visually rich deep dive on the topic **"${topicLabel}"** that communicates the full depth of research findings for this specific area. The artifact should function as a standalone topic briefing — someone reading only this document should understand what was researched, what was found, the strength of the evidence, and what remains unknown.

## Information Architecture

Structure the content in a **progressive disclosure hierarchy**:

### 1. Topic Overview (above the fold)
- Topic title, one-paragraph thesis, and 3–5 key findings as callout cards
- Confidence level indicator and research depth status
- Visual: a **concept diagram** showing how this topic connects to the broader project thesis

### 2. Evidence Synthesis
- Comprehensive synthesis of all research findings for this topic
- Key evidence points with source attribution
- Supporting and contradicting signals presented in balance
- Visual: an **evidence matrix** showing claims vs. support/neutral/contradict/gap status

### 3. Data & Source Analysis
- Detailed breakdown of source quality and coverage
- Cross-references to related topics and their findings
- Visual: a **source coverage table** with quality indicators

### 4. Implications & Analysis
- What do the findings mean for the broader project thesis?
- How do they interact with related topics?
- Visual: at least one of — comparison matrix, process flow, or relationship diagram

### 5. Knowledge Gaps & Open Questions
- What questions remain unanswered for this topic?
- What additional evidence would change confidence levels?
- Visual: a **gap analysis table** or coverage heatmap

## Visualizations

Use **inline SVG** for all diagrams. Make them information-dense and visually polished:

- **Concept/relationship diagrams**: Nodes and edges with labeled connections, color-coded by theme
- **Evidence matrices**: Grid with claims vs. evaluation criteria, color-coded badges
- **Data tables**: Zebra-striped, sortable, with confidence badges
- **Process/flow diagrams**: Clear directional arrows and phase labels
- **Metric callouts**: Large-number stat cards for key findings

## Content Transformations

- Synthesize — don't copy-paste. Read as a cohesive narrative, not wiki excerpts.
- Attribute key claims to source files using subtle inline citations.
- Transform lists into visual tables or card layouts.
- Convert quantitative findings into charts rather than prose.

## Design Direction

- Use the project's design identity tokens for all colors, fonts, and spacing
- Dark or light theme based on the identity file's guidance
- Clean, editorial layout — generous whitespace, clear typographic hierarchy
- Interactive elements: collapsible sections, hover tooltips, tab navigation
- Print-friendly: include \`@media print\` styles`;
}

// ── Auto-Artifact Spec Generation ─────────────────────────────────────

/**
 * Find directed outputs that don't have a corresponding artifact spec.
 * Returns an array of { outputFile, topics } for each output needing a spec.
 */
export async function findDirectedOutputsWithoutArtifacts(projectPath) {
  // Read manifest for directed outputs
  let directedOutputs = [];
  try {
    const manifestRaw = await fs.readFile(path.join(projectPath, ".build", "manifest.json"), "utf8");
    const manifest = JSON.parse(manifestRaw);
    directedOutputs = manifest.directed_outputs ?? [];
  } catch {
    // No manifest — try topics.json fallback
    try {
      const topicsRaw = await fs.readFile(path.join(projectPath, ".build", "topics.json"), "utf8");
      const topicsData = JSON.parse(topicsRaw);
      const outputSet = new Set();
      for (const topic of topicsData.topics ?? []) {
        for (const output of topic.outputs ?? []) {
          if (typeof output === "string" && output.trim()) outputSet.add(output.trim());
        }
      }
      directedOutputs = [...outputSet];
    } catch {
      return [];
    }
  }

  if (directedOutputs.length === 0) return [];

  // Read existing artifact specs
  const existingSpecs = await listArtifactSpecs(projectPath);
  const coveredOutputFiles = new Set(
    existingSpecs
      .map((s) => s.outputFile)
      .filter(Boolean),
  );

  // Also check by slug pattern to catch manually created specs
  const existingSlugs = new Set(existingSpecs.map((s) => s.slug));

  // Read topics for mapping
  let topicsList = [];
  try {
    const topicsData = await readTopics(projectPath);
    topicsList = topicsData.topics ?? [];
  } catch { /* topics may not exist */ }

  // Build output → topics mapping
  const outputToTopics = new Map();
  for (const topic of topicsList) {
    for (const output of topic.outputs ?? []) {
      if (!outputToTopics.has(output)) outputToTopics.set(output, []);
      outputToTopics.get(output).push(topic);
    }
  }

  // Filter to outputs that don't have specs
  const needsSpec = [];
  for (const outputFile of directedOutputs) {
    // Check if already covered by outputFile frontmatter
    if (coveredOutputFiles.has(outputFile)) continue;

    // Check if a matching slug already exists
    const baseName = path.basename(outputFile, ".md").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    const expectedSlug = `output_${baseName}`;
    if (existingSlugs.has(expectedSlug)) continue;

    const topics = outputToTopics.get(outputFile) ?? [];
    needsSpec.push({
      outputFile,
      topics: topics.map((t) => ({ id: t.id, label: t.label, wiki_page: t.wiki_page })),
    });
  }

  return needsSpec;
}

/**
 * After the agent writes output artifact specs, collect the topic IDs
 * that are covered by those specs (for deduplication with per-topic artifacts).
 *
 * @param {string} projectPath
 * @param {string[]} newOutputSpecSlugs - slugs of newly created output artifact specs
 * @returns {Promise<Set<string>>} - Set of topic IDs covered by the output specs
 */
export async function collectCoveredTopicIds(projectPath, newOutputSpecSlugs) {
  const coveredTopicIds = new Set();

  // Read topics for output→topic mapping
  let topicsList = [];
  try {
    const topicsData = await readTopics(projectPath);
    topicsList = topicsData.topics ?? [];
  } catch {
    return coveredTopicIds;
  }

  // Build output→topics reverse map
  const outputToTopicIds = new Map();
  for (const topic of topicsList) {
    for (const output of topic.outputs ?? []) {
      if (!outputToTopicIds.has(output)) outputToTopicIds.set(output, []);
      outputToTopicIds.get(output).push(topic.id);
    }
  }

  // For each new output spec, look up its outputFile and find covered topics
  for (const slug of newOutputSpecSlugs) {
    try {
      const spec = await readArtifactSpec(projectPath, slug);
      const outputFile = spec.frontmatter.outputFile;
      if (outputFile && outputToTopicIds.has(outputFile)) {
        for (const topicId of outputToTopicIds.get(outputFile)) {
          coveredTopicIds.add(topicId);
        }
      }
    } catch {
      // Spec might not be readable — skip
    }
  }

  return coveredTopicIds;
}

/**
 * Automatically generate artifact specs at the end of a build.
 * - Project overview: created on first build only (if not already present).
 * - Per-topic deep dives: created for each active (non-seed, non-deprecated) topic
 *   that doesn't already have a matching spec AND is not covered by a directed output artifact.
 *
 * @param {object} options
 * @param {Set<string>} [options.coveredTopicIds] - Topic IDs covered by output artifacts (skip these)
 * Returns { created: string[], skipped: string[] } for logging.
 */
export async function createAutoArtifactSpecs(projectPath, { modelId, isFirstBuild, topics, coveredTopicIds }) {
  await ensureArtifactDirs(projectPath);

  const existingSpecs = await listArtifactSpecs(projectPath);
  const existingSlugs = new Set(existingSpecs.map((s) => s.slug));

  const created = [];
  const skipped = [];

  // ── Project overview (first build only) ──
  const overviewSlug = "project_overview";
  if (isFirstBuild && !existingSlugs.has(overviewSlug)) {
    await writeArtifactSpec(
      projectPath,
      overviewSlug,
      { format: "html", lifecycle: "manual", modelId, sources: [], autoGenerated: true },
      PROJECT_OVERVIEW_PROMPT_BODY,
    );
    created.push(overviewSlug);
  } else {
    skipped.push(overviewSlug);
  }

  // ── Per-topic deep dives ──
  const activeTopics = (topics || []).filter(
    (t) => t.state !== "deprecated" && t.state !== "seed",
  );

  for (const topic of activeTopics) {
    const topicSlug = `topic_${topic.id}`;

    if (existingSlugs.has(topicSlug)) {
      skipped.push(topicSlug);
      continue;
    }

    // Skip topics covered by directed output artifacts
    if (coveredTopicIds?.has(topic.id)) {
      skipped.push(topicSlug);
      continue;
    }

    // Wire up the topic's wiki page and outputs as explicit sources
    const sources = [];
    if (topic.wiki_page) sources.push(topic.wiki_page);
    if (Array.isArray(topic.outputs)) {
      for (const output of topic.outputs) {
        if (typeof output === "string") sources.push(output);
      }
    }

    await writeArtifactSpec(
      projectPath,
      topicSlug,
      {
        format: "html",
        lifecycle: "manual",
        modelId,
        sources,
        autoGenerated: true,
        topicId: topic.id,
      },
      buildTopicDeepDivePromptBody(topic.label),
    );
    created.push(topicSlug);
  }

  return { created, skipped };
}

// ─── Section-Level Editing Functions ───────────────────────────────────────────
// These functions power section-level regeneration of built HTML artifacts.
// They rely on the section structure contract in do_build_artifact.md:
//   - Flat, non-nested <section id="..."> tags
//   - id as the first attribute (though regexes handle any order for defense in depth)
//   - No </section> literals inside SVG text, HTML attributes, or JS strings

/** Escape a string for safe interpolation into a RegExp. */
function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Scan built HTML for section boundaries.
 * Returns an array of { id, title, startIdx, endIdx }.
 */
export function discoverSections(html) {
  const sections = [];
  const seenIds = new Set();
  // Flexible attribute order — matches <section id="x"> and <section class="y" id="x">
  const regex = /<section\s[^>]*id="([^"]+)"[^>]*>/g;
  let match;

  while ((match = regex.exec(html)) !== null) {
    const id = match[1];
    const startIdx = match.index;

    if (seenIds.has(id)) {
      console.warn(`[sections] Duplicate section id="${id}" at index ${startIdx}. Skipping.`);
      continue;
    }
    seenIds.add(id);

    const sectionEnd = html.indexOf('</section>', startIdx);
    if (sectionEnd === -1) {
      console.warn(`[sections] No closing </section> found for id="${id}". Skipping.`);
      continue;
    }

    // Guard: verify no nested <section> opens between this tag and its close
    const nextOpen = html.indexOf('<section ', startIdx + match[0].length);
    if (nextOpen !== -1 && nextOpen < sectionEnd) {
      console.warn(`[sections] Section "${id}" appears nested (next <section> at ${nextOpen} before </section> at ${sectionEnd}). Skipping.`);
      continue;
    }

    // Extract heading for title
    const sectionContent = html.slice(startIdx, sectionEnd);
    const headingMatch = sectionContent.match(/<h[1-3][^>]*>([^<]+)/);
    const title = headingMatch ? headingMatch[1].trim() : id;

    sections.push({ id, title, startIdx, endIdx: sectionEnd + '</section>'.length });
  }

  return sections;
}

/**
 * Extract a specific section's boundaries and inner HTML.
 * Returns { outerStart, outerEnd, innerStart, innerEnd, innerHTML } or null.
 */
export function extractSection(html, sectionId) {
  // Flexible attribute order — defense in depth beyond the id-first contract
  const regex = new RegExp(`<section\\s[^>]*id="${escapeRegExp(sectionId)}"[^>]*>`);
  const match = regex.exec(html);
  if (!match) return null;

  const startIdx = match.index;
  const innerStart = startIdx + match[0].length;
  const endTag = '</section>';

  const innerEnd = html.indexOf(endTag, innerStart);
  if (innerEnd === -1) return null;

  // Guard: verify no nested <section> between inner start and close tag
  const nextOpen = html.indexOf('<section ', innerStart);
  if (nextOpen !== -1 && nextOpen < innerEnd) {
    console.warn(`[sections] Section "${sectionId}" contains a nested <section> — extraction unsafe.`);
    return null;
  }

  return {
    outerStart: startIdx,
    outerEnd: innerEnd + endTag.length,
    innerStart,
    innerEnd,
    innerHTML: html.slice(innerStart, innerEnd).trim(),
  };
}

/**
 * Sanitize agent output before splicing into the HTML document.
 * Strips document-level wrappers, attempts to extract target section content
 * if the agent wrapped its output in <section> tags, and rejects fragments
 * that would corrupt the document structure.
 */
export function sanitizeFragment(rawHtml, sectionId) {
  let cleaned = rawHtml;

  // Strip any document-level wrappers
  cleaned = cleaned.replace(/<!DOCTYPE[^>]*>/gi, '');
  cleaned = cleaned.replace(/<\/?html[^>]*>/gi, '');
  cleaned = cleaned.replace(/<\/?head[^>]*>/gi, '');
  cleaned = cleaned.replace(/<\/?body[^>]*>/gi, '');

  // Strip outer <section> wrapper if agent included one (greedy — takes outermost)
  const sectionMatch = cleaned.match(/^[\s]*<section[^>]*>([\s\S]*)<\/section>[\s]*$/i);
  if (sectionMatch) cleaned = sectionMatch[1];

  cleaned = cleaned.trim();

  // Check for <section> tags FIRST — try to extract our target section's content.
  // This must come before the </section> rejection check, because a wrapped fragment
  // like <section id="X">...content...</section> contains both.
  if (/<section\s/i.test(cleaned)) {
    const innerMatch = cleaned.match(
      new RegExp(`<section[^>]*id="${escapeRegExp(sectionId)}"[^>]*>([\s\S]*?)</section>`, 'i')
    );
    if (innerMatch) {
      cleaned = innerMatch[1].trim();
    } else {
      console.warn('[sections] Fragment contains <section> tags but none match target section — rejecting.');
      return null;
    }
  }

  // Reject if fragment STILL contains </section> after extraction
  if (cleaned.includes('</section>')) {
    console.warn('[sections] Fragment contains </section> after extraction — rejecting.');
    return null;
  }

  return cleaned;
}

/**
 * Splice a new section fragment into the HTML document, replacing the target section's innerHTML.
 * Adds a data-section-id attribute for CSS scoping and validates tag balance.
 * Returns the updated HTML string, or null if the operation would corrupt the document.
 */
export function replaceSection(html, sectionId, rawFragment) {
  const section = extractSection(html, sectionId);
  if (!section) return null;

  const newInnerHTML = sanitizeFragment(rawFragment, sectionId);
  if (!newInnerHTML || newInnerHTML.length === 0) return null;

  // Reconstruct the section with a data attribute for CSS scoping
  const openTag = html.slice(section.outerStart, section.innerStart);
  const updatedOpenTag = openTag.includes('data-section-id')
    ? openTag
    : openTag.replace(/<section(\s)/, `<section data-section-id="${sectionId}"$1`);

  const result =
    html.slice(0, section.outerStart) +
    updatedOpenTag +
    '\n' + newInnerHTML + '\n' +
    '</section>' +
    html.slice(section.outerEnd);

  // Validate: section tag counts must remain balanced
  const openCount = (result.match(/<section\s/g) || []).length;
  const closeCount = (result.match(/<\/section>/g) || []).length;
  if (openCount !== closeCount) {
    console.error(`[sections] Tag imbalance after splice: ${openCount} open vs ${closeCount} close. Aborting.`);
    return null;
  }

  return result;
}

/**
 * After a section is regenerated, update the corresponding nav link text
 * to match the new heading. Returns the updated HTML or the original if
 * no nav link or heading is found.
 */
export function updateNavText(html, sectionId, newSectionHTML) {
  const headingMatch = newSectionHTML.match(/<h[1-3][^>]*>([^<]+)/);
  if (!headingMatch) return html;

  const newTitle = headingMatch[1].trim();
  const navLinkRegex = new RegExp(
    `(<a\\s[^>]*href="#${escapeRegExp(sectionId)}"[^>]*>)[^<]*(</a>)`, 'i'
  );

  if (!navLinkRegex.test(html)) return html;
  return html.replace(navLinkRegex, `$1${newTitle}$2`);
}

/**
 * Check how many sections have scoped <style> blocks (indicator of style fragmentation).
 * Returns { total, withScopedStyles, fragmentationRatio, suggestRebuild }.
 */
export function checkStyleFragmentation(html) {
  const sections = discoverSections(html);
  let withScopedStyles = 0;
  for (const section of sections) {
    const sectionHTML = html.slice(section.startIdx, section.endIdx);
    if (/<style[^>]*>/i.test(sectionHTML)) withScopedStyles++;
  }
  return {
    total: sections.length,
    withScopedStyles,
    fragmentationRatio: sections.length > 0 ? withScopedStyles / sections.length : 0,
    suggestRebuild: sections.length > 0 && (withScopedStyles / sections.length) > 0.5,
  };
}

/**
 * Create a timestamped backup of index.html before regeneration.
 * Aborts (throws) if the backup copy fails — never risk losing the original.
 * Caps at 5 backups per artifact.
 */
export async function createSectionBackup(indexPath, backupsDir) {
  await fs.mkdir(backupsDir, { recursive: true });

  const backupPath = path.join(backupsDir, `index.html.pre-regen-${Date.now()}`);
  try {
    await fs.copyFile(indexPath, backupPath);
  } catch (err) {
    throw new Error(`Cannot create backup before regeneration: ${err.message}. Aborting.`);
  }

  // Cap at 5 backups
  const files = await fs.readdir(backupsDir);
  const sorted = files.filter(f => f.startsWith('index.html.pre-regen-')).sort();
  while (sorted.length > 5) {
    await fs.unlink(path.join(backupsDir, sorted.shift()));
  }

  return backupPath;
}

/**
 * Read and update the artifact manifest for section regeneration tracking.
 * Increments regenerationCount, adds the section to regeneratedSections,
 * and sets contractVersion if missing.
 */
export async function updateManifestForRegeneration(projectPath, artifactSlug, sectionId) {
  const manifestPath = path.join(projectPath, ARTIFACT_BUILDS_DIR, artifactSlug, '.artifact-manifest.json');

  let manifest = {};
  try {
    const raw = await fs.readFile(manifestPath, 'utf8');
    manifest = JSON.parse(raw);
  } catch {
    // Manifest may not exist — create minimal one
    manifest = { slug: artifactSlug, format: 'html' };
  }

  // Track original build size on first regeneration
  if (!manifest.originalBuildSize) {
    try {
      const indexPath = path.join(projectPath, ARTIFACT_BUILDS_DIR, artifactSlug, 'index.html');
      const stat = await fs.stat(indexPath);
      manifest.originalBuildSize = stat.size;
    } catch { /* ignore */ }
  }

  manifest.regenerationCount = (manifest.regenerationCount || 0) + 1;
  manifest.lastRegeneratedAt = new Date().toISOString();

  if (!Array.isArray(manifest.regeneratedSections)) {
    manifest.regeneratedSections = [];
  }
  if (!manifest.regeneratedSections.includes(sectionId)) {
    manifest.regeneratedSections.push(sectionId);
  }

  if (!manifest.contractVersion) {
    manifest.contractVersion = 2;
  }

  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  return manifest;
}

/**
 * Stamp the artifact manifest after a successful full build.
 * Sets contractVersion (so the UI knows section editing is safe),
 * and resets regeneration tracking (full build is a clean slate).
 */
export async function stampManifestAfterBuild(projectPath, artifactSlug) {
  const manifestPath = path.join(projectPath, ARTIFACT_BUILDS_DIR, artifactSlug, '.artifact-manifest.json');

  let manifest = {};
  try {
    const raw = await fs.readFile(manifestPath, 'utf8');
    manifest = JSON.parse(raw);
  } catch {
    // Manifest may not exist (agent failed to write it) — create minimal one
    manifest = { slug: artifactSlug, format: 'html' };
  }

  manifest.contractVersion = 2;
  manifest.regenerationCount = 0;
  manifest.regeneratedSections = [];

  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
}

