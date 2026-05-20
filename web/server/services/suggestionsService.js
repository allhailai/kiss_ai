import fs from "node:fs/promises";
import path from "node:path";

const SUGGESTIONS_PATH = ".build/suggestions.json";

/**
 * Read suggestions.json, returning { suggestions: [] } if missing or invalid.
 */
export async function readSuggestions(projectPath) {
  try {
    const raw = await fs.readFile(path.join(projectPath, SUGGESTIONS_PATH), "utf-8");
    const data = JSON.parse(raw);
    return { suggestions: Array.isArray(data.suggestions) ? data.suggestions : [] };
  } catch {
    return { suggestions: [] };
  }
}

/**
 * Write suggestions to .build/suggestions.json
 */
export async function writeSuggestions(projectPath, suggestions) {
  const outPath = path.join(projectPath, SUGGESTIONS_PATH);
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify({ suggestions }, null, 2) + "\n", "utf-8");
}

/**
 * Resolve a suggestion by ID (accept or dismiss).
 * Returns the updated suggestion or null if not found.
 */
export async function resolveSuggestion(projectPath, suggestionId, status) {
  if (status !== "accepted" && status !== "dismissed") return null;

  const data = await readSuggestions(projectPath);
  const suggestion = data.suggestions.find((s) => s.id === suggestionId);

  if (!suggestion) return null;

  suggestion.status = status;
  suggestion.resolvedAt = new Date().toISOString();

  await writeSuggestions(projectPath, data.suggestions);
  return suggestion;
}

/**
 * Scan a file for <!-- AI_SUGGESTION: text --> markers.
 * Skips markers that already have [ACCEPTED] or [DISMISSED] status prefixes.
 * Returns an array of suggestion objects.
 */
export function extractAiSuggestions(fileContent, filePath, buildMeta) {
  const suggestions = [];
  const markerRegex = /<!-- AI_SUGGESTION: ([\s\S]*?) -->/g;

  let match;
  while ((match = markerRegex.exec(fileContent)) !== null) {
    const rawText = match[1].trim();

    // Skip already-resolved markers (e.g. [ACCEPTED] or [DISMISSED] prefix)
    if (/^\[(ACCEPTED|DISMISSED)\]/i.test(rawText)) continue;

    const id = `s-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    suggestions.push({
      id,
      text: rawText,
      status: "pending",
      sourceFile: filePath,
      createdAt: new Date().toISOString(),
      resolvedAt: null,
      createdDuring: {
        phase: buildMeta?.phase || "unknown",
        buildId: buildMeta?.buildId || null,
        modelId: buildMeta?.modelId || null,
      },
    });
  }

  return suggestions;
}

/**
 * Scan all output files for AI_SUGGESTION markers.
 * Returns all raw suggestions with metadata.
 */
export async function extractAllSuggestions(projectPath, outputFiles, buildMeta) {
  const allSuggestions = [];

  for (const outputFile of outputFiles) {
    try {
      const fullPath = path.join(projectPath, outputFile);
      const content = await fs.readFile(fullPath, "utf-8");
      const suggestions = extractAiSuggestions(content, outputFile, buildMeta);
      allSuggestions.push(...suggestions);
    } catch {
      // File doesn't exist or can't be read — skip
    }
  }

  return allSuggestions;
}

/**
 * Get summary counts for the status endpoint.
 */
export async function getSuggestionCounts(projectPath) {
  const data = await readSuggestions(projectPath);
  const pending = data.suggestions.filter((s) => s.status === "pending");

  return {
    pendingSuggestionsCount: pending.length,
    acceptedSuggestionsCount: data.suggestions.filter((s) => s.status === "accepted").length,
    dismissedSuggestionsCount: data.suggestions.filter((s) => s.status === "dismissed").length,
    totalSuggestionsCount: data.suggestions.length,
  };
}

/**
 * Get file paths that have accepted suggestions (for buildScope integration).
 */
export async function getAcceptedSuggestionPaths(projectPath) {
  const data = await readSuggestions(projectPath);
  const accepted = data.suggestions.filter((s) => s.status === "accepted");
  return [...new Set(accepted.map((s) => s.sourceFile))];
}
