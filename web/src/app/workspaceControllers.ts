import type { BuildLogState, DesignState, FileContent, FileDiff, ProjectFile, ProjectStatus, ProjectSummary, RebuildModel, RebuildState } from "../contracts/api";
import type { View } from "../navigation/views";
import type { Toast } from "../shared/toast";

export type ProjectController = {
  clearSelectedProject: () => void;
  createProject: (name: string, slug?: string) => Promise<void>;
  creatingProject: boolean;
  projects: ProjectSummary[];
  projectsError: string;
  projectsRoot: string;
  refreshProjects: () => Promise<void>;
  selectProject: (projectSlug: string) => void;
  selectedProject: ProjectSummary | null;
  selectedProjectSlug: string | null;
};

export type RouteController = {
  context: Record<string, string>;
  filePath: string | null;
  navigateTo: (view: View, filePath?: string | null, context?: Record<string, string>) => void;
  openProjectFile: (path: string) => void;
  view: View;
};

export type FileWorkspaceController = {
  createHumanInputFolder: (name: string) => Promise<void>;
  createHumanInputTextFile: (name: string, folder?: string) => Promise<void>;
  deleteHumanInputFile: (path: string) => Promise<void>;
  deleteHumanInputFolder: (folder: string) => Promise<void>;
  moveHumanInputFile: (sourcePath: string, targetFolder: string) => Promise<void>;
  draft: string;
  fileLoading: boolean;
  hasUnsavedChanges: boolean;
  humanInputEmptyDirectories: string[];
  inputMutationLoading: boolean;
  loading: boolean;
  projectFiles: ProjectFile[];
  refreshProjectFiles: () => Promise<void>;
  refreshSelectedFile: () => Promise<void>;
  revertSelected: () => Promise<void>;
  reverting: boolean;
  saveSelected: () => Promise<FileContent | null>;
  saving: boolean;
  selected: FileContent | null;
  selectedDiff: FileDiff | null;
  setDraft: (draft: string) => void;
  uploadHumanInputFiles: (files: File[]) => Promise<void>;
};

export type RebuildWorkspaceController = {
  buildLog: BuildLogState | null;
  models: RebuildModel[];
  rebuild: RebuildState | null;
  refreshBuildLog: (tabId?: string | null, path?: string | null, sectionId?: string | null) => Promise<void>;
  refreshRebuild: () => Promise<RebuildState>;
  refreshRebuildModels: () => Promise<void>;
  refreshStatus: () => Promise<void>;
  resolveHumanAttention: (request: { itemId: string; resolutionOptionId?: string; manualPrompt?: string }) => Promise<void>;
  selectedModelId: string;
  setSelectedModelId: (modelId: string) => void;
  startRebuild: () => Promise<void>;
  status: ProjectStatus | null;
};

export type DesignWorkspaceController = {
  design: DesignState | null;
  refreshDesign: () => Promise<void>;
};

export type ToastWorkspaceController = {
  dismissToast: (id: string) => void;
  setNotice: (message: string) => void;
  toasts: Toast[];
};

