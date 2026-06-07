import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const ARTIFACT_BUILDS_DIR = "artifacts/builds";
const ANNOTATIONS_FILE = ".artifact-annotations.json";
const SOFT_CAP = 20;

function annotationsPath(projectPath, artifactSlug) {
  return path.join(projectPath, ARTIFACT_BUILDS_DIR, artifactSlug, ANNOTATIONS_FILE);
}

async function readAnnotations(projectPath, artifactSlug) {
  try {
    const raw = await fs.readFile(annotationsPath(projectPath, artifactSlug), "utf8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function writeAnnotations(projectPath, artifactSlug, annotations) {
  const filePath = annotationsPath(projectPath, artifactSlug);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(annotations, null, 2), "utf8");
}

/**
 * List all annotations for an artifact.
 */
export async function listAnnotations(projectPath, artifactSlug) {
  return await readAnnotations(projectPath, artifactSlug);
}

/**
 * Add a new annotation. Returns the created annotation.
 * Throws if the soft cap is reached.
 */
export async function addAnnotation(projectPath, artifactSlug, data, httpError) {
  const annotations = await readAnnotations(projectPath, artifactSlug);
  const pendingCount = annotations.filter(a => a.status === "pending").length;
  if (pendingCount >= SOFT_CAP) {
    throw httpError(
      `Annotation limit reached (${SOFT_CAP}). Regenerate or remove existing annotations before adding more.`,
      422,
      "annotation_cap_reached",
    );
  }

  const now = new Date().toISOString();
  const annotation = {
    id: crypto.randomBytes(8).toString("hex"),
    sectionId: data.sectionId,
    sectionTitle: data.sectionTitle,
    instruction: data.instruction,
    elementContext: data.elementContext || null,
    status: "pending",
    previouslyApplied: false,
    createdAt: now,
    updatedAt: now,
  };

  // Support add_section annotation type
  if (data.type === "add_section") {
    annotation.type = "add_section";
    annotation.afterSectionId = data.afterSectionId || null;
  }

  annotations.push(annotation);
  await writeAnnotations(projectPath, artifactSlug, annotations);
  return annotation;
}

/**
 * Update an existing annotation's instruction and/or elementContext.
 */
export async function updateAnnotation(projectPath, artifactSlug, annotationId, updates, httpError) {
  const annotations = await readAnnotations(projectPath, artifactSlug);
  const idx = annotations.findIndex(a => a.id === annotationId);
  if (idx === -1) {
    throw httpError(`Annotation "${annotationId}" not found.`, 404, "annotation_not_found");
  }

  const annotation = annotations[idx];
  if (updates.instruction !== undefined) annotation.instruction = updates.instruction;
  if (updates.elementContext !== undefined) annotation.elementContext = updates.elementContext || null;
  annotation.updatedAt = new Date().toISOString();

  await writeAnnotations(projectPath, artifactSlug, annotations);
  return annotation;
}

/**
 * Delete an annotation by ID.
 */
export async function deleteAnnotation(projectPath, artifactSlug, annotationId, httpError) {
  const annotations = await readAnnotations(projectPath, artifactSlug);
  const idx = annotations.findIndex(a => a.id === annotationId);
  if (idx === -1) {
    throw httpError(`Annotation "${annotationId}" not found.`, 404, "annotation_not_found");
  }

  annotations.splice(idx, 1);
  await writeAnnotations(projectPath, artifactSlug, annotations);
}

/**
 * Get pending annotations grouped by sectionId.
 * Returns a Map-like array: [{ sectionId, annotations[] }]
 */
export async function getPendingBySection(projectPath, artifactSlug) {
  const annotations = await readAnnotations(projectPath, artifactSlug);
  const pending = annotations.filter(a => a.status === "pending");

  const grouped = new Map();
  for (const a of pending) {
    if (!grouped.has(a.sectionId)) {
      grouped.set(a.sectionId, []);
    }
    grouped.get(a.sectionId).push(a);
  }

  return Array.from(grouped.entries()).map(([sectionId, anns]) => ({
    sectionId,
    annotations: anns,
  }));
}

/**
 * Get all pending annotations as a flat list (for full build prompt).
 */
export async function getPendingAnnotations(projectPath, artifactSlug) {
  const annotations = await readAnnotations(projectPath, artifactSlug);
  return annotations.filter(a => a.status === "pending");
}

/**
 * Mark specific annotations as applied.
 */
export async function markApplied(projectPath, artifactSlug, annotationIds) {
  const annotations = await readAnnotations(projectPath, artifactSlug);
  const now = new Date().toISOString();
  for (const a of annotations) {
    if (annotationIds.includes(a.id)) {
      a.status = "applied";
      a.updatedAt = now;
    }
  }
  await writeAnnotations(projectPath, artifactSlug, annotations);
}

/**
 * Mark specific annotations as failed.
 */
export async function markFailed(projectPath, artifactSlug, annotationIds) {
  const annotations = await readAnnotations(projectPath, artifactSlug);
  const now = new Date().toISOString();
  for (const a of annotations) {
    if (annotationIds.includes(a.id)) {
      a.status = "failed";
      a.updatedAt = now;
    }
  }
  await writeAnnotations(projectPath, artifactSlug, annotations);
}

/**
 * Reset all failed annotations back to pending.
 */
export async function retryFailed(projectPath, artifactSlug) {
  const annotations = await readAnnotations(projectPath, artifactSlug);
  const now = new Date().toISOString();
  let count = 0;
  for (const a of annotations) {
    if (a.status === "failed") {
      a.status = "pending";
      a.updatedAt = now;
      count++;
    }
  }
  await writeAnnotations(projectPath, artifactSlug, annotations);
  return count;
}

/**
 * Toggle a single annotation:
 *   pending → inactive (deactivated, removed from regen queue)
 *   applied/failed/inactive → pending (re-queued)
 */
export async function toggleAnnotation(projectPath, artifactSlug, annotationId, httpError) {
  const annotations = await readAnnotations(projectPath, artifactSlug);
  const idx = annotations.findIndex(a => a.id === annotationId);
  if (idx === -1) {
    throw httpError(`Annotation "${annotationId}" not found.`, 404, "annotation_not_found");
  }

  const annotation = annotations[idx];
  if (annotation.status === "pending") {
    annotation.status = "inactive";
  } else {
    const wasApplied = annotation.status === "applied";
    annotation.status = "pending";
    annotation.previouslyApplied = wasApplied || annotation.previouslyApplied;
  }
  annotation.updatedAt = new Date().toISOString();

  await writeAnnotations(projectPath, artifactSlug, annotations);
  return annotation;
}

/**
 * Remove all applied annotations (called after full rebuild).
 */
export async function clearApplied(projectPath, artifactSlug) {
  const annotations = await readAnnotations(projectPath, artifactSlug);
  const remaining = annotations.filter(a => a.status !== "applied");
  await writeAnnotations(projectPath, artifactSlug, remaining);
}
