import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { readLedger, writeLedger } from "./contentLedger.js";

const ARTIFACT_SPECS_DIR = "artifacts/artifact_specs";

/**
 * Read and parse a JSON file, returning null on error.
 */
async function readJsonSafe(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf-8"));
  } catch {
    return null;
  }
}

/**
 * Write a JSON file with pretty printing.
 */
async function writeJson(filePath, data) {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

/**
 * Deterministically rename an output file (report or artifact) and update
 * all authoritative data stores that reference it.
 *
 * Stores updated:
 *   1. Disk — renames the file
 *   2. .build/content_ledger.json — moves output_builds key
 *   3. .build/topics.json — replaces path in all topics[*].outputs[]
 *   4. .build/questions.json — replaces path in relatedFiles[] and appliedTo[]
 *   5. artifacts/artifact_specs/*.artifact.md — replaces path in sources: and outputFile:
 *   6. Markdown cross-links in sibling .md files — replaces ./old_basename with ./new_basename
 *
 * @param {string} projectPath - absolute path to project root
 * @param {string} oldRelPath - old relative path (e.g. "outputs_ai/reports/old_name.md")
 * @param {string} newRelPath - new relative path (e.g. "outputs_ai/reports/new_name.md")
 * @returns {Promise<{updated: object, errors: string[]}>}
 */
export async function renameOutput(projectPath, oldRelPath, newRelPath) {
  const errors = [];
  const updated = {
    disk: false,
    ledger: false,
    topics: 0,
    questions: 0,
    artifactSpecs: /** @type {string[]} */ ([]),
    markdownLinks: /** @type {string[]} */ ([]),
  };

  // ── Validation ──────────────────────────────────────────────────

  if (!oldRelPath || !newRelPath) {
    throw Object.assign(new Error("Both oldPath and newPath are required."), { statusCode: 400, code: "rename_missing_paths" });
  }

  if (oldRelPath === newRelPath) {
    throw Object.assign(new Error("Old and new paths are identical."), { statusCode: 400, code: "rename_noop" });
  }

  if (!oldRelPath.startsWith("outputs_ai/")) {
    throw Object.assign(new Error(`Path must be within outputs_ai/: ${oldRelPath}`), { statusCode: 400, code: "rename_invalid_path" });
  }

  if (!newRelPath.startsWith("outputs_ai/")) {
    throw Object.assign(new Error(`Path must be within outputs_ai/: ${newRelPath}`), { statusCode: 400, code: "rename_invalid_path" });
  }

  const oldAbsPath = path.join(projectPath, oldRelPath);
  const newAbsPath = path.join(projectPath, newRelPath);

  // Verify old file exists
  try {
    await fs.access(oldAbsPath);
  } catch {
    throw Object.assign(new Error(`Source file not found: ${oldRelPath}`), { statusCode: 404, code: "rename_source_not_found" });
  }

  // Verify new file does NOT exist (prevent overwrite)
  try {
    await fs.access(newAbsPath);
    throw Object.assign(new Error(`Target file already exists: ${newRelPath}`), { statusCode: 409, code: "rename_target_exists" });
  } catch (err) {
    if (err.statusCode === 409) throw err;
    // ENOENT is expected
  }

  // ── 1. Rename file on disk ──────────────────────────────────────

  // Ensure target directory exists (in case of cross-folder move)
  await fs.mkdir(path.dirname(newAbsPath), { recursive: true });
  await fs.rename(oldAbsPath, newAbsPath);
  updated.disk = true;

  // ── 2. Update content_ledger.json ───────────────────────────────

  try {
    const ledger = await readLedger(projectPath);
    if (ledger?.output_builds?.[oldRelPath] !== undefined) {
      ledger.output_builds[newRelPath] = ledger.output_builds[oldRelPath];
      delete ledger.output_builds[oldRelPath];
      await writeLedger(projectPath, ledger);
      updated.ledger = true;
    }
  } catch (err) {
    errors.push(`content_ledger.json: ${err.message}`);
  }

  // ── 3. Update topics.json ───────────────────────────────────────

  try {
    const topicsPath = path.join(projectPath, ".build", "topics.json");
    const topicsData = await readJsonSafe(topicsPath);
    if (topicsData?.topics) {
      let count = 0;
      for (const topic of topicsData.topics) {
        if (Array.isArray(topic.outputs)) {
          const idx = topic.outputs.indexOf(oldRelPath);
          if (idx !== -1) {
            topic.outputs[idx] = newRelPath;
            count++;
          }
        }
      }
      if (count > 0) {
        await writeJson(topicsPath, topicsData);
        updated.topics = count;
      }
    }
  } catch (err) {
    errors.push(`topics.json: ${err.message}`);
  }

  // ── 4. Update questions.json ────────────────────────────────────

  try {
    const questionsPath = path.join(projectPath, ".build", "questions.json");
    const questionsData = await readJsonSafe(questionsPath);
    if (questionsData?.questions) {
      let count = 0;
      for (const question of questionsData.questions) {
        for (const field of ["relatedFiles", "appliedTo"]) {
          if (Array.isArray(question[field])) {
            const idx = question[field].indexOf(oldRelPath);
            if (idx !== -1) {
              question[field][idx] = newRelPath;
              count++;
            }
          }
        }
      }
      if (count > 0) {
        await writeJson(questionsPath, questionsData);
        updated.questions = count;
      }
    }
  } catch (err) {
    errors.push(`questions.json: ${err.message}`);
  }

  // ── 5. Update artifact specs ────────────────────────────────────

  try {
    const specsDir = path.join(projectPath, ARTIFACT_SPECS_DIR);
    let specFiles;
    try {
      specFiles = await fs.readdir(specsDir);
    } catch {
      specFiles = [];
    }

    for (const file of specFiles) {
      if (!file.endsWith(".artifact.md")) continue;

      const specPath = path.join(specsDir, file);
      const raw = await fs.readFile(specPath, "utf-8");

      // Quick check — skip files that don't reference the old path at all
      if (!raw.includes(oldRelPath)) continue;

      const { data: frontmatter, content: body } = matter(raw);
      let changed = false;

      // Update sources array
      if (Array.isArray(frontmatter.sources)) {
        const idx = frontmatter.sources.indexOf(oldRelPath);
        if (idx !== -1) {
          frontmatter.sources[idx] = newRelPath;
          changed = true;
        }
      }

      // Update outputFile
      if (frontmatter.outputFile === oldRelPath) {
        frontmatter.outputFile = newRelPath;
        changed = true;
      }

      if (changed) {
        const updatedContent = matter.stringify(body, frontmatter);
        await fs.writeFile(specPath, updatedContent, "utf-8");
        updated.artifactSpecs.push(file);
      }
    }
  } catch (err) {
    errors.push(`artifact_specs: ${err.message}`);
  }

  // ── 6. Update markdown cross-links in sibling files ─────────────

  try {
    const oldBasename = path.basename(oldRelPath);
    const newBasename = path.basename(newRelPath);

    // Only do cross-link updates if basenames actually changed
    if (oldBasename !== newBasename) {
      const dir = path.dirname(newAbsPath);
      let siblingFiles;
      try {
        siblingFiles = await fs.readdir(dir);
      } catch {
        siblingFiles = [];
      }

      for (const file of siblingFiles) {
        if (!file.endsWith(".md")) continue;
        // Don't update the renamed file itself (it was already moved)
        if (file === newBasename) continue;

        const filePath = path.join(dir, file);
        const content = await fs.readFile(filePath, "utf-8");

        // Replace relative link references: ./old_name.md → ./new_name.md
        // Also handle bare basename without ./ prefix in markdown links
        const patterns = [
          { search: `./${oldBasename}`, replace: `./${newBasename}` },
          { search: `(${oldBasename})`, replace: `(${newBasename})` },
        ];

        let updatedContent = content;
        for (const { search, replace } of patterns) {
          if (updatedContent.includes(search)) {
            updatedContent = updatedContent.replaceAll(search, replace);
          }
        }

        if (updatedContent !== content) {
          await fs.writeFile(filePath, updatedContent, "utf-8");
          updated.markdownLinks.push(file);
        }
      }
    }
  } catch (err) {
    errors.push(`markdown_links: ${err.message}`);
  }

  return { updated, errors };
}
