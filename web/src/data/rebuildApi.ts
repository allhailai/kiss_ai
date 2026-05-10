import type { RebuildState, ResolveHumanAttentionRequest } from "../contracts/api";
import { projectBase, request } from "./request";

export const rebuildApi = {
  rebuildState: (projectSlug: string) => request<RebuildState>(`${projectBase(projectSlug)}/rebuild`),
  openRebuildEventSource: (projectSlug: string) => new EventSource(`${projectBase(projectSlug)}/rebuild/events`),
  startRebuild: (projectSlug: string, modelId: string) =>
    request<RebuildState>(`${projectBase(projectSlug)}/rebuild/start`, {
      method: "POST",
      body: JSON.stringify({ modelId }),
    }),
  resolveHumanAttention: (projectSlug: string, body: ResolveHumanAttentionRequest) =>
    request<RebuildState>(`${projectBase(projectSlug)}/human-attention/resolve`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
};
