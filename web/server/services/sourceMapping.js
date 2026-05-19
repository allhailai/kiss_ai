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
 * Build the source mapping for all directed outputs in a project.
 *
 * Every output gets the full set of wiki pages and digest files.
 * The agent decides relevance at synthesis time based on the file's
 * topic and the wiki/digest content.
 *
 * @param {string} projectPath - absolute path to project root
 * @returns {Object} mapping from output path to { wikiPages, digestFiles }
 */
export async function buildSourceMapping(projectPath) {
  const manifest = await readJsonSafe(path.join(projectPath, ".build", "manifest.json"));

  const directedOutputs = manifest?.directed_outputs ?? [];
  const wikiPages = manifest?.wiki_pages ?? [];

  // If manifest doesn't have wiki pages, discover them from disk
  let resolvedWikiPages = wikiPages;
  if (!resolvedWikiPages.length) {
    resolvedWikiPages = await listMdFilesRecursive(
      path.join(projectPath, "outputs_ai", "wiki"),
      projectPath,
    );
  }

  // Discover all digest files
  const digestFiles = await listMdFilesRecursive(
    path.join(projectPath, "sources", "digests"),
    projectPath,
  );

  // Build the mapping — every output gets everything
  const mapping = {};

  for (const outputFile of directedOutputs) {
    mapping[outputFile] = {
      wikiPages: [...resolvedWikiPages],
      digestFiles: digestFiles.map((d) => path.relative("sources/digests", d).replace(/^\.\.\//, "")),
    };
  }

  return mapping;
}

/**
 * Write the source mapping to .build/source_map.json for debugging/inspection
 */
export async function writeSourceMapping(projectPath, mapping) {
  const outPath = path.join(projectPath, ".build", "source_map.json");
  await fs.writeFile(outPath, JSON.stringify(mapping, null, 2) + "\n", "utf-8");
  return outPath;
}
