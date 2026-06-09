import type { HumanAttentionItem } from "./rebuild";

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
  unresolvedReviewItems: unknown[];
  blockedArtifacts: unknown[];
  staleOutputs: unknown[];
  humanAttentionItems: HumanAttentionItem[];
  humanAttentionCount: number;
  openQuestionsCount: number;
  blockingQuestionsCount: number;
  totalQuestionsCount: number;

  seedTopicsCount: number;
  totalTopicsCount: number;
  parkedTopicsCount: number;
  settledTopicsCount: number;
  cursorApiKeyAvailable: boolean;
  cursorApiKeySource: string | null;
  cursorApiKeyWarnings: string[];
  gitStatus: string[];
  annotationCounts: {
    feedbackApplied: number;
    coverageGapsWritten: number;
    autonomousActions: number;
  } | null;
  buildNotes: string | null;
};

export type ProjectSummary = {
  slug: string;
  name: string;
  path: string;
  setupStatus: string;
  modifiedAt: string;
  createdAt: string | null;
  lastBuildAt: string | null;
};

export type ProjectListResponse = {
  projectsRoot: string;
  projects: ProjectSummary[];
};

export type CreateProjectRequest = {
  name: string;
  slug?: string;
};

export type ProjectUiState = {
  version: 1;
  updatedAt?: string | null;
  lastRoute?: {
    hash: string;
  };
  preferredModelId?: string;
};

export type UpdateProjectUiStateRequest = {
  lastRoute?: {
    hash: string;
  };
  preferredModelId?: string;
};

export type ProjectFile = {
  path: string;
  name: string;
  kind: "human" | "ai" | "output" | "log" | "design";
  editable: boolean;
  annotation: boolean;
  chatContextReadable?: boolean;
  modifiedAt?: string | null;
  previewable?: boolean;
  snippet?: string;
};

export type FileContent = {
  path: string;
  content: string;
  contentHash: string;
  kind: ProjectFile["kind"];
  editable: boolean;
  annotation: boolean;
};

export type FileDiff = {
  path: string;
  ranges: Array<{ from: number; to: number }>;
  deletions: Array<{ afterLine: number; count: number }>;
};

export type FileChangeStatus = "new" | "edited";

export type TreeResponse = {
  files: ProjectFile[];
  emptyDirectories?: Array<{ path: string; name: string }>;
  fileChanges?: Record<string, FileChangeStatus>;
};

export type UploadHumanInputsResponse = {
  files: ProjectFile[];
};

export type DeleteHumanInputResponse = {
  path: string;
};

export type CreateHumanInputTextFileRequest = {
  name: string;
  content?: string;
  folder?: string;
};

export type CreateHumanInputTextFileResponse = {
  file: ProjectFile;
};

export type CreateHumanInputFolderRequest = {
  name: string;
  folder?: string;
};

export type CreateHumanInputFolderResponse = {
  folder: string;
};

export type DeleteHumanInputFolderRequest = {
  folder: string;
};

export type DeleteHumanInputFolderResponse = {
  folder: string;
};

export type MoveHumanInputFileRequest = {
  sourcePath: string;
  targetFolder: string;
};

export type MoveHumanInputFileResponse = {
  oldPath: string;
  newPath: string;
  file: ProjectFile;
};

export type FileSearchResponse = {
  files: ProjectFile[];
};

export type WriteFileRequest = {
  path: string;
  content: string;
  expectedContentHash: string;
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
