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
const FEEDBACK_PATTERN = /<!--\s*FEEDBACK:/;
const SUGGESTION_ACCEPTED_PATTERN = /<!--\s*AI_SUGGESTION:\s*\[ACCEPTED\]/;

async function scanMarkersInDirectory(directoryPath, projectPath) {
  const feedbackPaths = [];
  const acceptedSuggestionPaths = [];

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
        if (SUGGESTION_ACCEPTED_PATTERN.test(content)) {
          acceptedSuggestionPaths.push(relativePath);
        }
      } catch {
        // Skip unreadable files
      }
    }
  }

  await walk(directoryPath);
  return { feedbackPaths, acceptedSuggestionPaths };
}

// ── Detect affected outputs from diff text ──────────────────────────
export function detectAffectedOutputs(diffText, manifest) {
  if (!manifest || !diffText) return [];
  const allOutputs = [...(manifest.directed_outputs ?? []), ...(manifest.wiki_pages ?? [])];
  if (!allOutputs.length) return [];

  // Extract output names from manifest paths for keyword matching
  const affected = [];
  const diffLower = diffText.toLowerCase();

  for (const outputPath of manifest.directed_outputs ?? []) {
    // Extract a human-readable name from the path
    const baseName = path.basename(outputPath, ".md").replace(/_/g, " ").toLowerCase();
    const words = baseName.split(" ").filter((w) => w.length > 3);

    // If any significant word from the output name appears in the diff, it's affected
    if (words.some((word) => diffLower.includes(word))) {
      affected.push(outputPath);
    }
  }

  // If the diff touches the Topics section, all wiki pages are affected
  if (/^\+.*##\s*Topics/m.test(diffText) || /^-.*##\s*Topics/m.test(diffText)) {
    affected.push(...(manifest.wiki_pages ?? []));
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
  const acceptedSuggestions = [...sourcesMarkers.acceptedSuggestionPaths, ...outputsMarkers.acceptedSuggestionPaths].sort();

  // Compare inputs_human
  const currentHumanInputs = await listHumanInputFiles(projectPath);
  const previousHumanInputs = (manifest?.inputs_human_inventory ?? []).sort();
  const humanInputsChanged = JSON.stringify(currentHumanInputs) !== JSON.stringify(previousHumanInputs);

  // Determine if we can skip the research plan phase
  const skipResearchPlan = !isFirstBuild && !projectMdChanged && feedbackMarkers.length === 0 && !humanInputsChanged;

  // Detect affected outputs
  const affectedOutputs = projectMdChanged ? detectAffectedOutputs(projectMdDiff, manifest) : [...feedbackMarkers];

  return {
    isFirstBuild,
    projectMdChanged,
    projectMdHash,
    projectMdDiff,
    feedbackMarkers,
    acceptedSuggestions,
    humanInputsChanged,
    skipResearchPlan,
    affectedOutputs,
  };
}
