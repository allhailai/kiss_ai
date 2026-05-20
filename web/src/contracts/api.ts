import type { AgentContextDraftState, AgentContextFile, AgentContextFileSelection, AgentContextSourceFile, AgentEditableTargetFile } from "./agents";

export type {
  AgentContextDraftState,
  AgentContextFileSelection,
  AgentContextSourceFile,
  AgentEditableTargetFile,
  AgentContextFile,
  AgentContextFileKind,
  AgentContextFileRole,
} from "./agents";

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
  resolution_attempts?: Array<{
    attemptedAt?: string | null;
    outcome?: "resolved" | "failed" | "incomplete" | string;
    selectedResolutionOptionId?: string;
    manualPrompt?: string;
    summary?: string;
    failureDetails?: string;
  }>;
  last_resolution_attempt?: {
    attemptedAt?: string | null;
    outcome?: "resolved" | "failed" | "incomplete" | string;
    selectedResolutionOptionId?: string;
    manualPrompt?: string;
    summary?: string;
    failureDetails?: string;
  };
};

export type ResolveHumanAttentionRequest = {
  modelId: string;
  itemId: string;
  resolutionOptionId?: string;
  manualPrompt?: string;
};

export type BuildQuestion = {
  id: string;
  text: string;
  context: string;
  priority: "blocking" | "important" | "informational";
  status: "open" | "answered";
  askedAt: string;
  askedDuring: {
    phase: string;
    buildId: string | null;
    modelId: string | null;
  };
  relatedFiles: string[];
  relatedTopics: string[];
  answer: string | null;
  answeredAt: string | null;
};

export type QuestionAiAssistRequest = {
  modelId: string;
  questionText: string;
  questionContext: string;
  userDraft: string;
  relatedFiles: string[];
};

export type QuestionAiAssistResponse = {
  answer: string;
  confidence: "high" | "medium" | "low";
  confidenceReason: string;
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
  unresolvedReviewItems: unknown[];
  blockedArtifacts: unknown[];
  staleOutputs: unknown[];
  humanAttentionItems: HumanAttentionItem[];
  humanAttentionCount: number;
  openQuestionsCount: number;
  blockingQuestionsCount: number;
  totalQuestionsCount: number;
  cursorApiKeyAvailable: boolean;
  cursorApiKeySource: string | null;
  cursorApiKeyWarnings: string[];
  gitStatus: string[];
  annotationCounts: {
    feedbackApplied: number;
    suggestionsAdded: number;
    suggestionsAccepted: number;
    suggestionsDismissed: number;
  } | null;
  buildNotes: string | null;
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

export type KissAiUpdateCheckResponse = {
  status: "update_available" | "up_to_date";
  updateAvailable: boolean;
  localRevision: string;
  remoteRevision: string;
  upstream: string;
};

export type KissAiUpdateResponse = {
  status: "updated" | "up_to_date";
  beforeRevision: string;
  afterRevision: string;
  pullOutput: string;
  dependencyInstall: {
    ran: boolean;
    output: string;
  };
};

export type SystemSettingsResponse = {
  cursorApiKeyAvailable: boolean;
  cursorApiKeySource: string | null;
  cursorApiKeyWarnings: string[];
};

export type SaveCursorApiKeyRequest = {
  cursorApiKey: string;
};

export type SaveCursorApiKeyResponse = {
  ok: boolean;
  message: string;
};

export type Keybindings = {
  toggleLeftPanel: string;
  toggleRightPanel: string;
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

export type TreeResponse = {
  files: ProjectFile[];
  emptyDirectories?: string[];
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
  buildPhase?: "research" | "fetching" | "digests" | "wiki" | "directed_outputs" | "validation" | "complete" | null;
  buildPhaseDetail?: string | null;
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

export type ChatMessageRole = "user" | "assistant" | "system";

export type ChatMessageStatus = "complete" | "streaming" | "error";

export type ChatContextFile = AgentContextFileSelection;

export type ChatMessage = {
  id: string;
  role: ChatMessageRole;
  content: string;
  createdAt: string;
  updatedAt?: string | null;
  modelId?: string | null;
  status: ChatMessageStatus;
  context?: {
    currentFile?: AgentContextFile;
    ai_editable_files?: AgentEditableTargetFile[];
    context_files?: AgentContextSourceFile[];
  };
  metadata?: ChatMessageMetadata;
};

export type ChatMessageFileEdit = {
  path: string;
  summary: string;
  proposedContent?: string;
  contentHashBefore?: string;
  contentHashAfter?: string;
  draftStateBefore?: AgentContextDraftState;
  draftContentHashBefore?: string;
  appliedAt?: string;
  status: "proposed" | "applied" | "rejected" | "failed";
};

export type ChatMessageMetadata = Record<string, unknown> & {
  fileEdits?: ChatMessageFileEdit[];
};

export type ConceptualDiff = {
  id: string;
  filePath: string;
  title: string;
  summary: string;
  status: "accepted" | "rejected";
  target?: {
    scope: "local" | "section" | "multi_section" | "document";
    sections?: string[];
    anchors?: string[];
  };
  intent?: {
    objective: string;
    rationale?: string;
    mustPreserve?: string[];
    avoid?: string[];
  };
  evidence?: {
    userGuidance?: string[];
    gitDiffSignals?: string[];
    contextSignals?: string[];
  };
  applyNotes?: {
    expectedChangeShape?: string;
    nonGoals?: string[];
    riskLevel?: "low" | "medium" | "high";
  };
  memory?: {
    fingerprint?: string;
    reconsidersRejectedId?: string;
    reconsiderReason?: string;
    suppressionState?: "new" | "reconsidered" | "near_rejected";
  };
};


export type EditProposal = {
  id: string;
  sourceMessageId?: string;
  status: "proposed" | "applying" | "applied" | "partial" | "failed";
  createdAt: string;
  updatedAt: string;
  appliedAt?: string;
  conceptualDiffs: ConceptualDiff[];
  notice?: string;
};

export type ConversationFileContext = {
  ai_editable_files: AgentEditableTargetFile[];
  context_files: AgentContextSourceFile[];
};

export type ConversationSummary = {
  id: string;
  file: string;
  title: string;
  summary: string;
  modelId: string | null;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  archived: boolean;
};

export type ConversationsResponse = {
  conversations: ConversationSummary[];
};

export type Conversation = {
  version: number;
  id: string;
  projectSlug: string;
  title: string;
  summary: string;
  createdAt: string;
  updatedAt: string;
  defaultModelId: string | null;
  fileContext: ConversationFileContext;
  editProposals: EditProposal[];
  messages: ChatMessage[];
};


export type UpdateConversationRequest = {
  title?: string;
  summary?: string;
  archived?: boolean;
  fileContext?: ConversationFileContext;
};

export type SendChatMessageRequest = {
  modelId: string;
  content: string;
  context?: {
    currentFile?: AgentContextFile;
    ai_editable_files?: AgentEditableTargetFile[];
    context_files?: AgentContextSourceFile[];
  };
};

export type EditChatMessageRequest = {
  modelId?: string;
  content: string;
};

export type GenerateEditProposalRequest = {
  modelId: string;
  content?: string;
  fileContext: ConversationFileContext;
};

export type UpdateEditProposalRequest = {
  conceptualDiffs: Array<{
    id: string;
    status: "accepted" | "rejected";
  }>;
};

export type ApplyEditProposalRequest = {
  modelId: string;
};




export type ChatConversationEvent =
  | {
      type: "snapshot";
      conversation: Conversation;
    }
  | {
      type: "message_delta";
      conversationId: string;
      messageId: string;
      delta: string;
      updatedAt: string;
    }
  | {
      type: "message_complete";
      conversation: Conversation;
      message: ChatMessage;
    }
  | {
      type: "error";
      conversationId: string;
      message: string;
      updatedAt: string;
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

