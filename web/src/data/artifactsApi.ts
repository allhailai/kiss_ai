import type { RebuildState } from "../contracts/api";
import { projectBase, request } from "./request";

export type ArtifactSpec = {
  slug: string;
  name: string;
  format: string;
  lifecycle: string;
  modelId: string | null;
  sources: string[];
  lastBuilt: string | null;
  status: string;
};

export type ArtifactSpecDetail = {
  slug: string;
  frontmatter: Record<string, unknown>;
  body: string;
  rawContent: string;
};

export type AvailableSourceFile = {
  relativePath: string;
  kind: string;
  name: string;
};

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

  build: (projectSlug: string, artifactSlug: string, modelId?: string) =>
    request<RebuildState>(`${projectBase(projectSlug)}/artifacts/${encodeURIComponent(artifactSlug)}/build`, {
      method: "POST",
      body: JSON.stringify({ modelId: modelId ?? null }),
    }),

  previewUrl: (projectSlug: string, artifactSlug: string) =>
    `${projectBase(projectSlug)}/artifacts/${encodeURIComponent(artifactSlug)}/preview`,

  availableSources: (projectSlug: string) =>
    request<{ files: AvailableSourceFile[] }>(`${projectBase(projectSlug)}/artifacts/available-sources`),
};
