import fs from "node:fs/promises";
import path from "node:path";

const CHANGES_FILE = ".build/file_changes.json";

/**
 * Read the current file changes tracker. Returns a plain object mapping
 * relative file paths to their change entry:
 *   { "outputs_ai/wiki/topic.md": { status: "edited", changedAt: "..." } }
 */
async function readChanges(projectPath) {
  try {
    return JSON.parse(await fs.readFile(path.join(projectPath, CHANGES_FILE), "utf-8"));
  } catch {
    return {};
  }
}

async function writeChanges(projectPath, changes) {
  const target = path.join(projectPath, CHANGES_FILE);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, JSON.stringify(changes, null, 2) + "\n", "utf-8");
}

/**
 * Record that a file was created or modified.
 * @param {string} projectPath  Absolute path to the project root.
 * @param {string} relativePath Project-relative file path.
 * @param {"new"|"edited"} status
 */
export async function recordFileChange(projectPath, relativePath, status) {
  const changes = await readChanges(projectPath);
  const existing = changes[relativePath];

  // "new" is more significant than "edited" — don't downgrade.
  if (existing && existing.status === "new" && status === "edited") {
    existing.changedAt = new Date().toISOString();
  } else {
    changes[relativePath] = { status, changedAt: new Date().toISOString() };
  }

  await writeChanges(projectPath, changes);
}

/**
 * Record multiple file changes at once (batch variant — avoids repeated I/O).
 * @param {string} projectPath
 * @param {Array<{ path: string, status: "new"|"edited" }>} entries
 */
export async function recordFileChanges(projectPath, entries) {
  if (!entries.length) return;

  const changes = await readChanges(projectPath);
  const now = new Date().toISOString();

  for (const entry of entries) {
    const existing = changes[entry.path];
    if (existing && existing.status === "new" && entry.status === "edited") {
      existing.changedAt = now;
    } else {
      changes[entry.path] = { status: entry.status, changedAt: now };
    }
  }

  await writeChanges(projectPath, changes);
}

/**
 * Dismiss a single file's change badge (called when the user views the file).
 * @param {string} projectPath
 * @param {string} relativePath
 */
export async function dismissFileChange(projectPath, relativePath) {
  const changes = await readChanges(projectPath);
  if (!(relativePath in changes)) return;

  delete changes[relativePath];
  await writeChanges(projectPath, changes);
}

/**
 * Get the full change map for the project.
 * Returns a plain object: { [relativePath]: "new"|"edited" }
 * (flattened from the internal format for the API response).
 */
export async function getFileChanges(projectPath) {
  const changes = await readChanges(projectPath);
  const result = {};

  for (const [filePath, entry] of Object.entries(changes)) {
    result[filePath] = entry.status;
  }

  return result;
}

/**
 * Clear all pending file changes (called at the start of a full build).
 */
export async function clearAllFileChanges(projectPath) {
  await writeChanges(projectPath, {});
}
