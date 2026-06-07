import type { Annotation, ArtifactSpec, ArtifactSpecDetail, ArtifactSectionsResponse, AvailableSourceFile, ElementContext, RebuildState } from "../contracts/api";
import { projectBase, request } from "./request";

export const artifactsApi = {
  list: (projectSlug: string) =>
    request<{ artifacts: ArtifactSpec[] }>(`${projectBase(projectSlug)}/artifacts`),

  read: (projectSlug: string, artifactSlug: string) =>
    request<ArtifactSpecDetail>(`${projectBase(projectSlug)}/artifacts/${encodeURIComponent(artifactSlug)}`),

  create: (projectSlug: string, name: string, body?: string) =>
    request<{ slug: string; filePath: string }>(`${projectBase(projectSlug)}/artifacts`, {
      method: "POST",
      body: JSON.stringify({ name, body: body ?? "" }),
    }),

  update: (projectSlug: string, artifactSlug: string, frontmatter: Record<string, unknown>, body: string) =>
    request<{ slug: string; filePath: string }>(
      `${projectBase(projectSlug)}/artifacts/${encodeURIComponent(artifactSlug)}`,
      {
        method: "PUT",
        body: JSON.stringify({ frontmatter, body }),
      },
    ),

  delete: (projectSlug: string, artifactSlug: string) =>
    request<{ deleted: boolean }>(`${projectBase(projectSlug)}/artifacts/${encodeURIComponent(artifactSlug)}`, {
      method: "DELETE",
    }),

  rename: (projectSlug: string, artifactSlug: string, newSlug: string) =>
    request<{ renamed: boolean; oldSlug: string; newSlug: string }>(
      `${projectBase(projectSlug)}/artifacts/${encodeURIComponent(artifactSlug)}/rename`,
      {
        method: "POST",
        body: JSON.stringify({ newSlug }),
      },
    ),

  build: (projectSlug: string, artifactSlug: string, modelId?: string) =>
    request<RebuildState>(`${projectBase(projectSlug)}/artifacts/${encodeURIComponent(artifactSlug)}/build`, {
      method: "POST",
      body: JSON.stringify({ modelId: modelId ?? null }),
    }),

  previewUrl: (projectSlug: string, artifactSlug: string) =>
    `${projectBase(projectSlug)}/artifacts/${encodeURIComponent(artifactSlug)}/preview`,

  availableSources: (projectSlug: string) =>
    request<{ files: AvailableSourceFile[] }>(`${projectBase(projectSlug)}/artifacts/available-sources`),

  sections: (projectSlug: string, artifactSlug: string) =>
    request<ArtifactSectionsResponse>(
      `${projectBase(projectSlug)}/artifacts/${encodeURIComponent(artifactSlug)}/sections`,
    ),

  regenerateSection: (projectSlug: string, artifactSlug: string, sectionId: string, instruction: string, modelId?: string, elementContext?: ElementContext) =>
    request<RebuildState>(
      `${projectBase(projectSlug)}/artifacts/${encodeURIComponent(artifactSlug)}/sections/${encodeURIComponent(sectionId)}/regenerate`,
      {
        method: "POST",
        body: JSON.stringify({ instruction, modelId: modelId ?? null, ...(elementContext ? { elementContext } : {}) }),
      },
    ),

  // ─── Annotations ────────────────────────────────────────────

  listAnnotations: (projectSlug: string, artifactSlug: string) =>
    request<{ annotations: Annotation[] }>(
      `${projectBase(projectSlug)}/artifacts/${encodeURIComponent(artifactSlug)}/annotations`,
    ),

  addAnnotation: (projectSlug: string, artifactSlug: string, data: { sectionId: string; sectionTitle: string; instruction: string; elementContext?: ElementContext }) =>
    request<Annotation>(
      `${projectBase(projectSlug)}/artifacts/${encodeURIComponent(artifactSlug)}/annotations`,
      { method: "POST", body: JSON.stringify(data) },
    ),

  updateAnnotation: (projectSlug: string, artifactSlug: string, annotationId: string, updates: { instruction: string; elementContext?: ElementContext }) =>
    request<Annotation>(
      `${projectBase(projectSlug)}/artifacts/${encodeURIComponent(artifactSlug)}/annotations/${encodeURIComponent(annotationId)}`,
      { method: "PUT", body: JSON.stringify(updates) },
    ),

  deleteAnnotation: (projectSlug: string, artifactSlug: string, annotationId: string) =>
    request<{ ok: boolean }>(
      `${projectBase(projectSlug)}/artifacts/${encodeURIComponent(artifactSlug)}/annotations/${encodeURIComponent(annotationId)}`,
      { method: "DELETE" },
    ),

  applyAnnotations: (projectSlug: string, artifactSlug: string) =>
    request<RebuildState>(
      `${projectBase(projectSlug)}/artifacts/${encodeURIComponent(artifactSlug)}/annotations/apply`,
      { method: "POST" },
    ),

  retryAnnotations: (projectSlug: string, artifactSlug: string) =>
    request<{ retriedCount: number }>(
      `${projectBase(projectSlug)}/artifacts/${encodeURIComponent(artifactSlug)}/annotations/retry`,
      { method: "POST" },
    ),

  toggleAnnotation: (projectSlug: string, artifactSlug: string, annotationId: string) =>
    request<Annotation>(
      `${projectBase(projectSlug)}/artifacts/${encodeURIComponent(artifactSlug)}/annotations/${encodeURIComponent(annotationId)}/toggle`,
      { method: "POST" },
    ),
};
