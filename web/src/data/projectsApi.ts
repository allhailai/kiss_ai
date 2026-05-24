import type {
  BuildLogState,
  CreateProjectRequest,
  CreateTopicRequest,
  CreateTopicResponse,
  DesignState,
  ProjectListResponse,
  ProjectStatus,
  ProjectSummary,
  ProjectUiState,
  QuestionAiAssistRequest,
  QuestionAiAssistResponse,
  RebuildModelsResponse,
  Topic,
  UpdateProjectUiStateRequest,
} from "../contracts/api";
import { projectBase, request } from "./request";

export const projectsApi = {
  projects: () => request<ProjectListResponse>("/api/projects"),
  createProject: (body: CreateProjectRequest) =>
    request<ProjectSummary>("/api/projects", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  rebuildModels: () => request<RebuildModelsResponse>("/api/cursor/models"),
  projectUiState: (projectSlug: string) => request<ProjectUiState>(`${projectBase(projectSlug)}/ui-state`),
  updateProjectUiState: (projectSlug: string, body: UpdateProjectUiStateRequest) =>
    request<ProjectUiState>(`${projectBase(projectSlug)}/ui-state`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  status: (projectSlug: string) => request<ProjectStatus>(`${projectBase(projectSlug)}/status`),
  design: (projectSlug: string) => request<DesignState>(`${projectBase(projectSlug)}/design`),
  buildLog: (projectSlug: string, tabId?: string | null, path?: string | null, sectionId?: string | null) => {
    const params = new URLSearchParams();
    if (tabId) params.set("tab", tabId);
    if (path) params.set("path", path);
    if (sectionId) params.set("section", sectionId);
    const query = params.toString();

    return request<BuildLogState>(`${projectBase(projectSlug)}/build-log${query ? `?${query}` : ""}`);
  },
  questionAiAssist: (projectSlug: string, body: QuestionAiAssistRequest) =>
    request<QuestionAiAssistResponse>(`${projectBase(projectSlug)}/questions/ai-assist`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  topics: (projectSlug: string) =>
    request<{ topics: Topic[] }>(`${projectBase(projectSlug)}/topics`),
  createTopic: (projectSlug: string, body: CreateTopicRequest) =>
    request<CreateTopicResponse>(`${projectBase(projectSlug)}/topics/create`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
};
