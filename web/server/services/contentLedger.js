import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const LEDGER_PATH = ".build/content_ledger.json";

// ── Read / Write ────────────────────────────────────────────────────

export async function readLedger(projectPath) {
  try {
    const raw = await fs.readFile(path.join(projectPath, LEDGER_PATH), "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function writeLedger(projectPath, ledger) {
  const outPath = path.join(projectPath, LEDGER_PATH);
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify(ledger, null, 2) + "\n", "utf-8");
}

// ── Hashing ─────────────────────────────────────────────────────────

function hashContent(content) {
  return createHash("sha256").update(content).digest("hex");
}

async function hashFile(filePath) {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return hashContent(content);
  } catch {
    return null;
  }
}

// ── Snapshot: compute current hashes ────────────────────────────────

/**
 * Build a full snapshot of all hashable inputs.
 * Call this AFTER fetch + digest phases are complete.
 *
 * Returns:
 * {
 *   project_md: "sha256hex",
 *   human_inputs: { "inputs_human/file.md": "sha256hex", ... },
 *   digests: { "sources/digests/file.md": "sha256hex", ... }
 * }
 */
export async function buildSnapshot(projectPath) {
  const snapshot = {
    project_md: null,
    human_inputs: {},
    digests: {},
  };

  // 1. project.md
  snapshot.project_md = await hashFile(path.join(projectPath, "project.md"));

  // 2. inputs_human (recursive, skip dotfiles)
  const inputDir = path.join(projectPath, "inputs_human");
  await walkAndHash(inputDir, projectPath, snapshot.human_inputs);

  // 3. sources/digests
  const digestDir = path.join(projectPath, "sources", "digests");
  try {
    const entries = await fs.readdir(digestDir);
    for (const entry of entries) {
      if (!entry.endsWith(".md")) continue;
      const relPath = `sources/digests/${entry}`;
      const hash = await hashFile(path.join(projectPath, relPath));
      if (hash) snapshot.digests[relPath] = hash;
    }
  } catch {
    // No digests directory yet
  }

  return snapshot;
}

async function walkAndHash(dirPath, projectPath, result) {
  let entries;
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      await walkAndHash(fullPath, projectPath, result);
      continue;
    }

    const relPath = path.relative(projectPath, fullPath).replaceAll(path.sep, "/");
    const hash = await hashFile(fullPath);
    if (hash) result[relPath] = hash;
  }
}

// ── Diff: compare snapshot against stored ledger ────────────────────

/**
 * Compare a fresh snapshot against the stored ledger.
 * Returns a structured diff of what changed.
 *
 * @param {object} snapshot - from buildSnapshot()
 * @param {object|null} ledger - from readLedger() (null = first build)
 * @returns {{
 *   projectMdChanged: boolean,
 *   humanInputsChanged: boolean,
 *   changedDigests: string[],
 *   newDigests: string[],
 *   removedDigests: string[],
 *   isFirstBuild: boolean
 * }}
 */
export function diffSnapshot(snapshot, ledger) {
  if (!ledger) {
    return {
      projectMdChanged: true,
      humanInputsChanged: true,
      changedDigests: Object.keys(snapshot.digests),
      newDigests: Object.keys(snapshot.digests),
      removedDigests: [],
      isFirstBuild: true,
    };
  }

  // project.md
  const projectMdChanged = snapshot.project_md !== (ledger.project_md ?? null);

  // human inputs — compare full set
  const currentInputKeys = Object.keys(snapshot.human_inputs).sort();
  const previousInputKeys = Object.keys(ledger.human_inputs ?? {}).sort();
  let humanInputsChanged = currentInputKeys.length !== previousInputKeys.length;
  if (!humanInputsChanged) {
    for (let i = 0; i < currentInputKeys.length; i++) {
      const key = currentInputKeys[i];
      if (key !== previousInputKeys[i] || snapshot.human_inputs[key] !== (ledger.human_inputs ?? {})[key]) {
        humanInputsChanged = true;
        break;
      }
    }
  }

  // digests — find changed, new, and removed
  const prevDigests = ledger.digests ?? {};
  const changedDigests = [];
  const newDigests = [];

  for (const [relPath, hash] of Object.entries(snapshot.digests)) {
    if (!(relPath in prevDigests)) {
      newDigests.push(relPath);
      changedDigests.push(relPath);
    } else if (prevDigests[relPath] !== hash) {
      changedDigests.push(relPath);
    }
  }

  const removedDigests = Object.keys(prevDigests).filter((k) => !(k in snapshot.digests));

  return {
    projectMdChanged,
    humanInputsChanged,
    changedDigests,
    newDigests,
    removedDigests,
    isFirstBuild: false,
  };
}
