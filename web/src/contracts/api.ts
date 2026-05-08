export type ResolutionOption = {
  id: string;
  attentionItemId?: string;
  label: string;
  prompt: string;
  description?: string;
  riskLevel?: "low" | "medium" | "high" | string;
  recommended?: boolean;
  createdAt?: string | null;
};

export type ResolutionAttempt = {
  attemptedAt?: string | null;
  outcome?: "resolved" | "failed" | "incomplete" | string;
  selectedResolutionOptionId?: string;
  manualPrompt?: string;
  summary?: string;
  failureDetails?: string;
};

export type HumanAttentionItem = {
  id: string;
  severity?: string;
  category?: string;
  summary: string;
  issue?: string;
  message?: string;
  affected_files?: string[];
  default_action_taken?: string;
  next_human_action?: string;
  nextAction?: string;
  resolution_options: ResolutionOption[];
  resolution_attempts?: ResolutionAttempt[];
  last_resolution_attempt?: ResolutionAttempt;
};

export type ResolveHumanAttentionRequest = {
  modelId: string;
  itemId: string;
  resolutionOptionId?: string;
  manualPrompt?: string;
};

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
  humanAttentionItems: HumanAttentionItem[];
  humanAttentionCount: number;
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

export type CreateProjectRequest = {
  name: string;
  slug?: string;
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
  contentHash: string;
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
  runtime: string;
  modelId: string | null;
  status: "idle" | "running" | "finished" | "finished_with_attention" | "error" | "blocked" | "interrupted";
  startedAt: string | null;
  finishedAt: string | null;
  message: string;
  activeAssistantMessageId: string | null;
  runKind: "rebuild" | "human_attention_resolve";
  attentionContext: Record<string, unknown> | null;
  events: AgentRunEvent[];
  log: string[];
};

export type AgentRunEvent = {
  id: string;
  type: "system" | "assistant_message" | "run_status" | "tool_activity" | "artifact_change" | "error";
  role: string;
  title: string;
  text: string;
  status: string | null;
  runtime: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
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

export type BuildLogFileSection = {
  id: string;
  title: string;
};

export type BuildLogFileOption = {
  path: string;
  name: string;
  title: string;
  modifiedAt: string;
  sections: BuildLogFileSection[];
};

export type BuildLogFileContent = BuildLogFileOption & {
  selectedSectionId: string | null;
  content: string;
};

export type BuildLogTab = {
  id: string;
  label: string;
  emptyMessage: string;
  files: BuildLogFileOption[];
  selectedFile: BuildLogFileContent | null;
};

export type BuildLogState = {
  activeTabId: string;
  selectedLog: BuildLogFileContent | null;
  tabs: BuildLogTab[];
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

export type AiAssistProposal = {
  filePath: string;
  contentHash: string;
  modelId: string;
  generatedAt: string;
  summary: string;
  rationale: string;
  affectedSections: string[];
  proposedContent: string;
  risks: string[];
  questionsOrAssumptions: string[];
};

export type AiAssistRequest = {
  modelId: string;
  path: string;
  annotation: string;
  contentHash?: string;
  feedback?: string;
  previousProposal?: AiAssistProposal;
};

export type RequirementAutoUpdatePath =
  | "human_goal_requirements.md"
  | "human_input_requirements.md"
  | "human_output_requirements.md";

export type RequirementsAutoUpdateProposal = {
  filePath: RequirementAutoUpdatePath;
  contentHash: string;
  modelId: string;
  generatedAt: string;
  summary: string;
  rationale: string;
  affectedSections: string[];
  proposedContent: string;
  risks: string[];
  questionsOrAssumptions: string[];
};

export type RequirementsAutoUpdateProposeRequest = {
  modelId: string;
  sourcePath: RequirementAutoUpdatePath;
  selectedPaths: RequirementAutoUpdatePath[];
  instruction?: string;
  contentHashes: Record<RequirementAutoUpdatePath, string>;
};

export type RequirementsAutoUpdateProposeResponse = {
  modelId: string;
  generatedAt: string;
  proposals: RequirementsAutoUpdateProposal[];
};

export type RequirementsAutoUpdateAcceptRequest = {
  proposals: Pick<RequirementsAutoUpdateProposal, "filePath" | "contentHash" | "proposedContent">[];
};

export type RequirementsAutoUpdateAcceptResponse = {
  acceptedAt: string;
  files: FileContent[];
};
