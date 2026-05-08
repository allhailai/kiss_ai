import type {
  AiAssistProposal,
  AiAssistRequest,
  BuildLogState,
  CreateProjectRequest,
  DesignState,
  FileContent,
  FileDiff,
  FileSearchResponse,
  ProjectListResponse,
  ProjectStatus,
  ProjectSummary,
  RebuildModelsResponse,
  RebuildState,
  RequirementsAutoUpdateAcceptRequest,
  RequirementsAutoUpdateAcceptResponse,
  RequirementsAutoUpdateProposeRequest,
  RequirementsAutoUpdateProposeResponse,
  ResolveHumanAttentionRequest,
  TreeResponse,
} from "../contracts/api";

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.error ?? `Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

function projectBase(projectSlug: string) {
  return `/api/projects/${encodeURIComponent(projectSlug)}`;
}

export const api = {
  projects: () => request<ProjectListResponse>("/api/projects"),
  createProject: (body: CreateProjectRequest) =>
    request<ProjectSummary>("/api/projects", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  rebuildModels: () => request<RebuildModelsResponse>("/api/cursor/models"),
  status: (projectSlug: string) => request<ProjectStatus>(`${projectBase(projectSlug)}/status`),
  buildLog: (projectSlug: string, summaryPath?: string | null, sectionId?: string | null) => {
    const params = new URLSearchParams();
    if (summaryPath) params.set("summary", summaryPath);
    if (sectionId) params.set("section", sectionId);
    const query = params.toString();

    return request<BuildLogState>(`${projectBase(projectSlug)}/build-log${query ? `?${query}` : ""}`);
  },
  tree: (projectSlug: string, section: string) => request<TreeResponse>(`${projectBase(projectSlug)}/tree/${section}`),
  searchFiles: (projectSlug: string, query: string) =>
    request<FileSearchResponse>(`${projectBase(projectSlug)}/search/files?q=${encodeURIComponent(query)}`),
  file: (projectSlug: string, path: string) => request<FileContent>(`${projectBase(projectSlug)}/file?path=${encodeURIComponent(path)}`),
  fileDiff: (projectSlug: string, path: string) =>
    request<FileDiff>(`${projectBase(projectSlug)}/file/diff?path=${encodeURIComponent(path)}`),
  saveFile: (projectSlug: string, path: string, content: string) =>
    request<FileContent>(`${projectBase(projectSlug)}/file`, {
      method: "PUT",
      body: JSON.stringify({ path, content }),
    }),
  aiAssistPropose: (projectSlug: string, body: AiAssistRequest) =>
    request<AiAssistProposal>(`${projectBase(projectSlug)}/ai-assist/propose`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  aiAssistRefine: (projectSlug: string, body: AiAssistRequest) =>
    request<AiAssistProposal>(`${projectBase(projectSlug)}/ai-assist/refine`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  requirementsAutoUpdatePropose: (projectSlug: string, body: RequirementsAutoUpdateProposeRequest) =>
    request<RequirementsAutoUpdateProposeResponse>(`${projectBase(projectSlug)}/requirements/auto-update/propose`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  requirementsAutoUpdateAccept: (projectSlug: string, body: RequirementsAutoUpdateAcceptRequest) =>
    request<RequirementsAutoUpdateAcceptResponse>(`${projectBase(projectSlug)}/requirements/auto-update/accept`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  revertFile: (projectSlug: string, path: string) =>
    request<FileContent>(`${projectBase(projectSlug)}/file/revert`, {
      method: "POST",
      body: JSON.stringify({ path }),
    }),
  design: (projectSlug: string) => request<DesignState>(`${projectBase(projectSlug)}/design`),
  rebuildState: (projectSlug: string) => request<RebuildState>(`${projectBase(projectSlug)}/rebuild`),
  rebuildEventsUrl: (projectSlug: string) => `${projectBase(projectSlug)}/rebuild/events`,
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
