import fs from "node:fs/promises";
import path from "node:path";

/**
 * Build a mapping from each directed output to ALL available wiki pages and
 * digest files.  The agent picks which are relevant at synthesis time.
 *
 * This replaces the previous domain-specific routing (state codes, federal
 * topics) with a simple "enumerate everything" approach that works for any
 * project type.
 *
 * Returns: { [outputPath]: { wikiPages, digestFiles } }
 */

/**
 * Read and parse a JSON file, returning null on error
 */
async function readJsonSafe(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf-8"));
  } catch {
    return null;
  }
}

/**
 * Recursively list all .md files under a directory, returning paths relative to the project root.
 */
async function listMdFilesRecursive(dirPath, projectPath) {
  const results = [];
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        results.push(...(await listMdFilesRecursive(fullPath, projectPath)));
      } else if (entry.name.endsWith(".md")) {
        results.push(path.relative(projectPath, fullPath));
      }
    }
  } catch {
    // Directory doesn't exist — fine
  }
  return results.sort();
}

/**
 * Discover directed output file paths using a fallback chain:
 *
 * 1. manifest.directed_outputs  (populated after any successful prior build)
 * 2. topics.json outputs arrays  (populated by wiki-only agent on first build)
 * 3. Disk scan of outputs_ai/   (last resort — finds files from manual builds)
 *
 * @param {string} projectPath
 * @returns {Promise<{ outputs: string[], source: "manifest" | "topics" | "disk" }>}
 */
export async function discoverDirectedOutputs(projectPath) {
  // ── Primary: manifest.directed_outputs ──
  const manifest = await readJsonSafe(path.join(projectPath, ".build", "manifest.json"));
  const manifestOutputs = manifest?.directed_outputs ?? [];

  if (manifestOutputs.length > 0) {
    return { outputs: manifestOutputs, source: "manifest" };
  }

  // ── Fallback 1: Extract unique output paths from topics.json ──
  const topics = await readJsonSafe(path.join(projectPath, ".build", "topics.json"));
  const topicsList = topics?.topics ?? [];

  if (topicsList.length > 0) {
    const outputSet = new Set();
    for (const topic of topicsList) {
      for (const outputPath of topic.outputs ?? []) {
        if (typeof outputPath === "string" && outputPath.trim()) {
          outputSet.add(outputPath.trim());
        }
      }
    }

    if (outputSet.size > 0) {
      return { outputs: [...outputSet].sort(), source: "topics" };
    }
  }

  // ── Fallback 2: Scan outputs_ai/ for .md files (excluding wiki/) ──
  const allOutputFiles = await listMdFilesRecursive(
    path.join(projectPath, "outputs_ai"),
    projectPath,
  );
  const nonWikiFiles = allOutputFiles.filter(
    (f) => !f.startsWith("outputs_ai/wiki/") && !f.startsWith("outputs_ai/wiki\\"),
  );

  if (nonWikiFiles.length > 0) {
    return { outputs: nonWikiFiles, source: "disk" };
  }

  return { outputs: [], source: "manifest" };
}

/**
 * Build the source mapping for all directed outputs in a project.
 *
 * Uses topics.json to create topic-aware mappings: each output gets only the
 * wiki pages, digests, and sources from its related topics (plus dependencies).
 * Non-primary wiki pages are listed in a discoveryWikiPages array so the agent
 * can read them on demand if cross-cutting context is needed.
 *
 * Falls back to "give everything" when an output has no topic mapping.
 *
 * @param {string} projectPath - absolute path to project root
 * @returns {Promise<{ mapping: Object, discoverySource: string }>}
 */
export async function buildSourceMapping(projectPath) {
  const manifest = await readJsonSafe(path.join(projectPath, ".build", "manifest.json"));
  const wikiPages = manifest?.wiki_pages ?? [];

  // Discover directed outputs using the fallback chain
  const { outputs: directedOutputs, source: discoverySource } = await discoverDirectedOutputs(projectPath);

  // If manifest doesn't have wiki pages, discover them from disk
  let resolvedWikiPages = wikiPages;
  if (!resolvedWikiPages.length) {
    resolvedWikiPages = await listMdFilesRecursive(
      path.join(projectPath, "outputs_ai", "wiki"),
      projectPath,
    );
  }

  // Discover all digest files
  const allDigestFiles = await listMdFilesRecursive(
    path.join(projectPath, "sources", "digests"),
    projectPath,
  );

  // Read topics.json for topic-to-output mapping
  const topicsData = await readJsonSafe(path.join(projectPath, ".build", "topics.json"));
  const topicsList = topicsData?.topics ?? [];

  // Build reverse index: output path → list of topics that reference it
  const outputToTopics = new Map();
  for (const topic of topicsList) {
    for (const output of topic.outputs ?? []) {
      if (!outputToTopics.has(output)) outputToTopics.set(output, []);
      outputToTopics.get(output).push(topic);
    }
  }

  // Build the mapping — topic-aware when possible, full fallback otherwise
  const mapping = {};

  for (const outputFile of directedOutputs) {
    const relatedTopics = outputToTopics.get(outputFile) ?? [];

    if (relatedTopics.length === 0) {
      // Fallback: no topic mapping found — give everything (safe default)
      mapping[outputFile] = {
        wikiPages: [...resolvedWikiPages],
        digestFiles: [...allDigestFiles],
        discoveryWikiPages: [],
      };
      continue;
    }

    // Collect wiki pages from related topics
    const topicWikiPages = new Set();
    const topicDigestFiles = new Set();

    for (const topic of relatedTopics) {
      // Direct wiki page
      if (topic.wiki_page) topicWikiPages.add(topic.wiki_page);

      // Wiki pages from dependencies
      for (const depId of topic.depends_on ?? []) {
        const dep = topicsList.find((t) => t.id === depId);
        if (dep?.wiki_page) topicWikiPages.add(dep.wiki_page);
      }

      // Source digests from the topic's sources
      for (const source of topic.sources ?? []) {
        const sourcePath = typeof source === "string" ? source : source.path;
        if (!sourcePath) continue;
        // Map source path to its digest file (digest filenames match source filenames)
        const baseName = path.basename(sourcePath);
        const digestPath = allDigestFiles.find((d) => path.basename(d) === baseName);
        if (digestPath) topicDigestFiles.add(digestPath);
      }
    }

    // Always include the wiki index for context
    const indexPage = resolvedWikiPages.find((p) => p.endsWith("_index.md"));
    if (indexPage) topicWikiPages.add(indexPage);

    // Collect remaining wiki pages as discovery inventory (not pre-loaded)
    const discoveryWikiPages = resolvedWikiPages.filter((p) => !topicWikiPages.has(p));

    mapping[outputFile] = {
      wikiPages: [...topicWikiPages],
      digestFiles: [...topicDigestFiles],
      discoveryWikiPages,
      topicCount: relatedTopics.length,
      topicIds: relatedTopics.map((t) => t.id),
    };
  }

  return { mapping, discoverySource };
}

/**
 * Write the source mapping to .build/source_map.json for debugging/inspection
 */
export async function writeSourceMapping(projectPath, mapping) {
  const outPath = path.join(projectPath, ".build", "source_map.json");
  await fs.writeFile(outPath, JSON.stringify(mapping, null, 2) + "\n", "utf-8");
  return outPath;
}
