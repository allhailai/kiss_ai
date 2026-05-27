import type { OutputStatusResponse, RebuildState } from "../contracts/api";
import { projectBase, request } from "./request";

export const outputsApi = {
  /** Get output status (last knowledge build + per-file stale status). */
  status: (projectSlug: string) =>
    request<OutputStatusResponse>(`${projectBase(projectSlug)}/outputs/status`),

  /** Start a knowledge build (wiki pipeline). */
  buildKnowledge: (projectSlug: string, modelId: string) =>
    request<RebuildState>(`${projectBase(projectSlug)}/build-knowledge`, {
      method: "POST",
      body: JSON.stringify({ modelId }),
    }),

  /** Build selected output files (reports or artifacts). */
  buildOutputs: (projectSlug: string, files: string[], type: "report" | "artifact", modelId?: string) =>
    request<RebuildState>(`${projectBase(projectSlug)}/build-outputs`, {
      method: "POST",
      body: JSON.stringify({ files, type, modelId: modelId ?? null }),
    }),

  /** Rename an output file and update all references. */
  rename: (projectSlug: string, oldPath: string, newPath: string) =>
    request<{ updated: Record<string, unknown>; errors: string[] }>(`${projectBase(projectSlug)}/outputs/rename`, {
      method: "POST",
      body: JSON.stringify({ oldPath, newPath }),
    }),
};
