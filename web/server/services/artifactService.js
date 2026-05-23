import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";

const ARTIFACT_SPECS_DIR = "artifacts/artifact_specs";
const ARTIFACT_BUILDS_DIR = "artifacts/builds";

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

  const specs = [];

  for (const file of files) {
    if (!file.endsWith(".artifact.md")) continue;

    const slug = file.replace(/\.artifact\.md$/, "");

    try {
      const raw = await fs.readFile(path.join(specsDir, file), "utf8");
      const { data: frontmatter } = matter(raw);
      const buildStatus = await getArtifactBuildStatus(projectPath, slug);

      specs.push({
        slug,
        name: frontmatter.name || slug,
        format: frontmatter.format || "html",
        lifecycle: frontmatter.lifecycle || "manual",
        modelId: frontmatter.modelId || null,
        sources: frontmatter.sources || [],
        lastBuilt: buildStatus?.builtAt || null,
        status: buildStatus ? "built" : "not_built",
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

  // Scan artifacts/builds/ for other artifact outputs
  try {
    const buildDirs = await fs.readdir(path.join(projectPath, ARTIFACT_BUILDS_DIR), { withFileTypes: true });
    for (const entry of buildDirs) {
      if (!entry.isDirectory()) continue;
      const manifestPath = path.join(projectPath, ARTIFACT_BUILDS_DIR, entry.name, ".artifact-manifest.json");
      const htmlPath = `artifacts/builds/${entry.name}/index.html`;
      if (excludeSet.has(htmlPath)) continue;

      try {
        const manifestRaw = await fs.readFile(manifestPath, "utf8");
        const manifest = JSON.parse(manifestRaw);
        inventory.push({
          relativePath: htmlPath,
          snippet: `Built artifact: ${manifest.name || entry.name} (built ${manifest.builtAt || "unknown"})`,
          kind: "artifact",
        });
      } catch {
        // No manifest = not built, skip
      }
    }
  } catch {
    // artifacts/builds/ may not exist yet
  }

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
          name: manifest.name || entry.name,
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
 * Automatically generate artifact specs at the end of a build.
 * - Project overview: created on first build only (if not already present).
 * - Per-topic deep dives: created for each active (non-seed, non-deprecated) topic
 *   that doesn't already have a matching spec.
 *
 * Returns { created: string[], skipped: string[] } for logging.
 */
export async function createAutoArtifactSpecs(projectPath, { modelId, isFirstBuild, topics }) {
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
      { name: "Project Overview", format: "html", lifecycle: "manual", modelId, sources: [], autoGenerated: true },
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
        name: topic.label,
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
