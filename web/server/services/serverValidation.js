import fs from "node:fs/promises";
import path from "node:path";
import { scanMarkersInDirectory } from "./buildScope.js";
import { recordFileChanges } from "./fileChanges.js";

const MIN_CONTENT_BYTES = 50;

/**
 * Check that all expected output files exist and have meaningful content.
 * Returns { passed: boolean, issues: string[] }
 */
export async function validateFileExistence(projectPath, manifest) {
  const issues = [];

  // Check all wiki pages listed in manifest
  for (const wikiPage of manifest?.wiki_pages ?? []) {
    const filePath = path.join(projectPath, wikiPage);
    try {
      const stat = await fs.stat(filePath);
      if (stat.size < MIN_CONTENT_BYTES) {
        issues.push(`${wikiPage}: exists but appears empty (${stat.size} bytes)`);
      }
    } catch {
      issues.push(`${wikiPage}: missing`);
    }
  }

  // Check all directed outputs
  for (const output of manifest?.directed_outputs ?? []) {
    const filePath = path.join(projectPath, output);
    try {
      const stat = await fs.stat(filePath);
      if (stat.size < MIN_CONTENT_BYTES) {
        issues.push(`${output}: exists but appears empty (${stat.size} bytes)`);
      }
    } catch {
      issues.push(`${output}: missing`);
    }
  }

  // Check wiki _index.md
  const indexPath = path.join(projectPath, "outputs_ai", "wiki", "_index.md");
  try {
    const stat = await fs.stat(indexPath);
    if (stat.size < MIN_CONTENT_BYTES) {
      issues.push("outputs_ai/wiki/_index.md: exists but appears empty");
    }
  } catch {
    issues.push("outputs_ai/wiki/_index.md: missing");
  }

  // Check source_log.md
  try {
    await fs.stat(path.join(projectPath, "sources", "source_log.md"));
  } catch {
    issues.push("sources/source_log.md: missing");
  }

  // Check for unprocessed FEEDBACK markers
  const sourcesMarkers = await scanMarkersInDirectory(path.join(projectPath, "sources"), projectPath);
  const outputsMarkers = await scanMarkersInDirectory(path.join(projectPath, "outputs_ai"), projectPath);
  const remainingFeedback = [...sourcesMarkers.feedbackPaths, ...outputsMarkers.feedbackPaths];
  if (remainingFeedback.length > 0) {
    issues.push(`Unprocessed FEEDBACK markers in: ${remainingFeedback.join(", ")}`);
  }

  return { passed: issues.length === 0, issues };
}

/**
 * Read the current manifest. Returns null if missing or invalid.
 */
export async function readManifest(projectPath) {
  try {
    return JSON.parse(await fs.readFile(path.join(projectPath, ".build", "manifest.json"), "utf-8"));
  } catch {
    return null;
  }
}

/**
 * Write or update .build/manifest.json with current build state.
 */
export async function writeManifest(projectPath, manifestData) {
  const outPath = path.join(projectPath, ".build", "manifest.json");
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify(manifestData, null, 2) + "\n", "utf-8");
}

/**
 * Prepend a build entry to change_logs/builds.md.
 */
export async function prependBuildLogEntry(projectPath, entry) {
  const logPath = path.join(projectPath, "change_logs", "builds.md");
  await fs.mkdir(path.dirname(logPath), { recursive: true });

  let existing = "";
  try {
    existing = await fs.readFile(logPath, "utf-8");
  } catch { /* file may not exist yet */ }

  const newEntry = [
    `## Build — ${entry.timestamp}`,
    "",
    `- **Scope**: ${entry.scope}`,
    `- **Model**: ${entry.modelId}`,
    `- **Duration**: ${entry.durationSeconds}s`,
    `- **Wiki pages updated**: ${entry.wikiPagesUpdated}`,
    `- **Directed outputs updated**: ${entry.directedOutputsUpdated}`,
    `- **Sources fetched**: ${entry.sourcesFetched}`,
    `- **FEEDBACK markers applied**: ${entry.feedbackApplied}`,
    `- **Topics deepened**: ${entry.topicsDeepened ?? 0}`,
    entry.notes ? `- **Notes**: ${entry.notes}` : null,
    "",
  ].filter(Boolean).join("\n");

  // Insert after the file header ("# Build Log\n\n...Newest entries first.\n\n")
  // Find the first "## " entry — insert our new entry before it
  const firstEntryIndex = existing.indexOf("\n## ");
  if (firstEntryIndex !== -1) {
    const header = existing.slice(0, firstEntryIndex + 1);
    const rest = existing.slice(firstEntryIndex + 1);
    await fs.writeFile(logPath, header + newEntry + "\n" + rest, "utf-8");
  } else {
    // No existing entries — append after existing content (or create fresh)
    const header = existing || "# Build Log\n\nBuild history for this project. Newest entries first.\n\n";
    await fs.writeFile(logPath, header + "\n" + newEntry + "\n", "utf-8");
  }
}

/**
 * Run git add + commit from the project root.
 * Returns { success, commitHash, error }.
 */
export async function gitSnapshot(projectPath, commitMessage) {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const exec = promisify(execFile);

  try {
    await exec("git", ["add", "-A", "."], { cwd: projectPath });
    const { stdout } = await exec("git", ["commit", "-m", commitMessage, "--allow-empty"], { cwd: projectPath });
    const hashMatch = stdout.match(/\[[\w-]+ ([a-f0-9]+)\]/);
    return { success: true, commitHash: hashMatch?.[1] || "unknown" };
  } catch (error) {
    // "nothing to commit" is not really an error
    if (error.message?.includes("nothing to commit")) {
      return { success: true, commitHash: "no-changes" };
    }
    return { success: false, error: error.message || "unknown git error" };
  }
}

/**
 * After a successful git snapshot, detect which files were added or modified
 * using `git diff --name-status HEAD~1 HEAD` and record them in the file
 * changes tracker so the sidebar can show "new" / "edited" badges.
 */
export async function recordBuildFileChanges(projectPath) {
  try {
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const exec = promisify(execFile);

    const { stdout } = await exec("git", ["diff", "--name-status", "HEAD~1", "HEAD"], { cwd: projectPath });
    const entries = [];

    for (const line of stdout.split("\n").filter(Boolean)) {
      const [flag, ...rest] = line.split("\t");
      const filePath = rest.at(-1); // for renames, last element is the new name
      if (!filePath) continue;

      if (flag === "A") {
        entries.push({ path: filePath, status: "new" });
      } else if (flag === "M" || flag === "R" || flag.startsWith("R")) {
        entries.push({ path: filePath, status: "edited" });
      }
    }

    if (entries.length > 0) {
      await recordFileChanges(projectPath, entries);
    }
  } catch (error) {
    // Non-fatal — badges are a convenience, not critical
    console.warn("[kiss_ai] Could not record build file changes:", error.message);
  }
}
