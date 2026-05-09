import type {
  AiAssistProposal,
  AiAssistRequest,
  BuildLogState,
  Conversation,
  ConversationsResponse,
  CreateProjectRequest,
  DeleteHumanInputResponse,
  DesignState,
  EditChatMessageRequest,
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
  SendChatMessageRequest,
  UpdateConversationRequest,
  TreeResponse,
  UploadHumanInputsResponse,
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

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      resolve(result.includes(",") ? result.split(",")[1] : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });
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
  conversations: (projectSlug: string) => request<ConversationsResponse>(`${projectBase(projectSlug)}/conversations`),
  createConversation: (projectSlug: string, body: { modelId?: string; title?: string }) =>
    request<Conversation>(`${projectBase(projectSlug)}/conversations`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  conversation: (projectSlug: string, conversationId: string) =>
    request<Conversation>(`${projectBase(projectSlug)}/conversations/${encodeURIComponent(conversationId)}`),
  updateConversation: (projectSlug: string, conversationId: string, body: UpdateConversationRequest) =>
    request<Conversation>(`${projectBase(projectSlug)}/conversations/${encodeURIComponent(conversationId)}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  sendChatMessage: (projectSlug: string, conversationId: string, body: SendChatMessageRequest) =>
    request<Conversation>(`${projectBase(projectSlug)}/conversations/${encodeURIComponent(conversationId)}/messages`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  editChatMessage: (projectSlug: string, conversationId: string, messageId: string, body: EditChatMessageRequest) =>
    request<Conversation>(
      `${projectBase(projectSlug)}/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/edit`,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    ),
  conversationEventsUrl: (projectSlug: string, conversationId: string) =>
    `${projectBase(projectSlug)}/conversations/${encodeURIComponent(conversationId)}/events`,
  buildLog: (projectSlug: string, tabId?: string | null, path?: string | null, sectionId?: string | null) => {
    const params = new URLSearchParams();
    if (tabId) params.set("tab", tabId);
    if (path) params.set("path", path);
    if (sectionId) params.set("section", sectionId);
    const query = params.toString();

    return request<BuildLogState>(`${projectBase(projectSlug)}/build-log${query ? `?${query}` : ""}`);
  },
  tree: (projectSlug: string, section: string) => request<TreeResponse>(`${projectBase(projectSlug)}/tree/${section}`),
  uploadHumanInputs: async (projectSlug: string, files: File[]) =>
    request<UploadHumanInputsResponse>(`${projectBase(projectSlug)}/inputs-human/upload`, {
      method: "POST",
      body: JSON.stringify({
        files: await Promise.all(
          files.map(async (file) => ({
            name: file.name,
            type: file.type,
            size: file.size,
            contentBase64: await fileToBase64(file),
          })),
        ),
      }),
    }),
  deleteHumanInput: (projectSlug: string, path: string) =>
    request<DeleteHumanInputResponse>(`${projectBase(projectSlug)}/inputs-human/file`, {
      method: "DELETE",
      body: JSON.stringify({ path }),
    }),
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
