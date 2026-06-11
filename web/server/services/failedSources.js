import fs from "node:fs/promises";
import path from "node:path";

const FAILED_SOURCES_PATH = ".build/failed_sources.json";

/**
 * Reads all failed sources from the project's .build/failed_sources.json
 */
export async function readFailedSources(projectPath) {
  try {
    const filePath = path.join(projectPath, FAILED_SOURCES_PATH);
    const raw = await fs.readFile(filePath, "utf-8");
    const data = JSON.parse(raw);
    return Array.isArray(data.failedSources) ? data.failedSources : [];
  } catch {
    return [];
  }
}

/**
 * Writes the failed sources list to the project's .build/failed_sources.json
 */
export async function writeFailedSources(projectPath, failedSources) {
  const filePath = path.join(projectPath, FAILED_SOURCES_PATH);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify({ failedSources }, null, 2) + "\n", "utf-8");
}

/**
 * Appends new failed sources or updates their details (avoiding URL duplicates)
 */
export async function addFailedSources(projectPath, urlsWithErrors) {
  const failedSources = await readFailedSources(projectPath);

  for (const { url, error } of urlsWithErrors) {
    const existingIndex = failedSources.findIndex((s) => s.url === url);
    const entry = {
      id: `fs-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      url,
      error: error || "Unknown fetch error",
      failedAt: new Date().toISOString(),
    };

    if (existingIndex !== -1) {
      failedSources[existingIndex] = {
        ...failedSources[existingIndex],
        error: entry.error,
        failedAt: entry.failedAt,
      };
    } else {
      failedSources.push(entry);
    }
  }

  await writeFailedSources(projectPath, failedSources);
}

/**
 * Deletes a failed source entry by ID
 */
export async function deleteFailedSource(projectPath, id) {
  const failedSources = await readFailedSources(projectPath);
  const filtered = failedSources.filter((s) => s.id !== id);

  if (filtered.length === failedSources.length) return false;

  await writeFailedSources(projectPath, filtered);
  return true;
}
