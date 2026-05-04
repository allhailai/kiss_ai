export type ProjectStatus = {
  projectSlug: string;
  projectName: string;
  setupStatus: string;
  setupInitializedAt: string | null;
  lastRunAt: string | null;
  lastSuccessfulRunAt: string | null;
  scalingMode: string | null;
  rebuildStatus: string | null;
  lintStatus: string | null;
  annotationStatus: string | null;
  annotationsLogged: number;
  annotationFiles: number;
  unresolvedReviewItems: unknown[];
  blockedArtifacts: unknown[];
  staleOutputs: unknown[];
  cursorApiKeyAvailable: boolean;
  cursorApiKeySource: string | null;
  cursorApiKeyWarnings: string[];
  gitStatus: string[];
};

export type ProjectSummary = {
  slug: string;
  name: string;
  path: string;
  setupStatus: string;
  modifiedAt: string;
};

export type ProjectListResponse = {
  projectsRoot: string;
  projects: ProjectSummary[];
};

export type ProjectFile = {
  path: string;
  name: string;
  kind: "human" | "ai" | "output" | "log" | "design";
  editable: boolean;
  annotation: boolean;
  modifiedAt?: string | null;
};

export type FileContent = {
  path: string;
  content: string;
  kind: ProjectFile["kind"];
  editable: boolean;
  annotation: boolean;
};
export type FileDiffRange = {
  from: number;
  to: number;
};
export type FileDiffDeletion = {
  afterLine: number;
  count: number;
};
export type FileDiff = {
  path: string;
  ranges: FileDiffRange[];
  deletions: FileDiffDeletion[];
};

export type TreeResponse = {
  files: ProjectFile[];
};
export type FileSearchResponse = {
  files: ProjectFile[];
};

export type RebuildState = {
  running: boolean;
  runId: string | null;
  agentId: string | null;
  modelId: string | null;
  status: "idle" | "running" | "finished" | "error" | "blocked" | "interrupted";
  startedAt: string | null;
  finishedAt: string | null;
  message: string;
  log: string[];
};

export type RebuildModel = {
  id: string;
  displayName: string;
  description: string;
  provider: string;
  tier: "medium" | "high" | "small";
};

export type RebuildModelsResponse = {
  available: boolean;
  defaultModelId: string | null;
  models: RebuildModel[];
  source: string | null;
};

export type DesignState = {
  file: FileContent;
  parsed: {
    name: string;
    description: string;
    colors: Record<string, string>;
    typography: Record<string, Record<string, string>>;
    spacing: Record<string, string | number>;
    rounded: Record<string, string | number>;
    components: Record<string, Record<string, string | number>>;
  };
  lint: {
    available: boolean;
    ok: boolean;
    output: unknown;
    message: string;
  };
};

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
  rebuildModels: () => request<RebuildModelsResponse>("/api/cursor/models"),
  status: (projectSlug: string) => request<ProjectStatus>(`${projectBase(projectSlug)}/status`),
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
  revertFile: (projectSlug: string, path: string) =>
    request<FileContent>(`${projectBase(projectSlug)}/file/revert`, {
      method: "POST",
      body: JSON.stringify({ path }),
    }),
  design: (projectSlug: string) => request<DesignState>(`${projectBase(projectSlug)}/design`),
  rebuildState: (projectSlug: string) => request<RebuildState>(`${projectBase(projectSlug)}/rebuild`),
  startRebuild: (projectSlug: string, modelId: string) =>
    request<RebuildState>(`${projectBase(projectSlug)}/rebuild/start`, {
      method: "POST",
      body: JSON.stringify({ modelId }),
    }),
};
