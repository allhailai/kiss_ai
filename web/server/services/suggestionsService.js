import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const SUGGESTIONS_PATH = ".build/suggestions.json";

/**
 * Generate a deterministic suggestion ID from source file + text.
 * Same marker always produces the same ID.
 */
export function generateSuggestionId(sourceFile, text) {
  const normalized = `${sourceFile}|${text.trim().toLowerCase()}`;
  const hash = createHash("sha256").update(normalized).digest("hex").slice(0, 12);
  return `s-${hash}`;
}

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
 * Resolve a suggestion by ID (accept, dismiss, or revert to pending).
 * Returns the updated suggestion or null if not found.
 */
export async function resolveSuggestion(projectPath, suggestionId, status) {
  if (status !== "accepted" && status !== "dismissed" && status !== "pending") return null;

  const data = await readSuggestions(projectPath);
  const suggestion = data.suggestions.find((s) => s.id === suggestionId);

  if (!suggestion) return null;

  suggestion.status = status;
  suggestion.resolvedAt = status === "pending" ? null : new Date().toISOString();

  await writeSuggestions(projectPath, data.suggestions);
  return suggestion;
}

/**
 * Scan a file for <!-- AI_SUGGESTION: ID=xxx text --> markers.
 * Returns an array of suggestion objects with deterministic IDs.
 */
export function extractAiSuggestions(fileContent, filePath, buildMeta) {
  const suggestions = [];
  // Match AI_SUGGESTION markers — with or without ID= prefix, with optional status prefix
  const markerRegex = /<!-- AI_SUGGESTION: ([\s\S]*?) -->/g;

  let match;
  while ((match = markerRegex.exec(fileContent)) !== null) {
    let rawText = match[1].trim();

    // Skip already-resolved markers
    if (/^\[(ACCEPTED|DISMISSED)\]/i.test(rawText)) continue;

    // Parse ID= prefix if present
    let id = null;
    const idMatch = rawText.match(/^ID=(\S+)\s+/);
    if (idMatch) {
      id = idMatch[1];
      rawText = rawText.slice(idMatch[0].length).trim();
    }

    // Generate deterministic ID if none was embedded
    if (!id) {
      id = generateSuggestionId(filePath, rawText);
    }

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
 * Backfill ID= into AI_SUGGESTION markers in a file that don't have one yet.
 * Returns the updated content (or original if no changes needed).
 */
export function backfillSuggestionIds(fileContent, filePath) {
  return fileContent.replace(
    /<!-- AI_SUGGESTION: (?!ID=)(?!\[(ACCEPTED|DISMISSED)\])([\s\S]*?) -->/g,
    (_match, _statusGroup, text) => {
      const id = generateSuggestionId(filePath, text.trim());
      return `<!-- AI_SUGGESTION: ID=${id} ${text.trim()} -->`;
    },
  );
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
