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
  status: "open" | "answered" | "applied";
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
  answeredBy: "human" | "ai_auto" | null;
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

export type KissAiUpdateAndRestartResponse = {
  status: "updated" | "up_to_date";
  restarting: boolean;
  beforeRevision: string;
  afterRevision: string;
  pullOutput: string;
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

// ── Auth types ──────────────────────────────────────────────────────────────

export type AuthLoginRequest = {
  username: string;
  password: string;
};

export type AuthLoginResponse = {
  ok: boolean;
  user: AuthUser;
};

export type AuthUser = {
  username: string;
  firstname: string;
  lastname: string;
  is_admin: boolean;
  is_system: boolean;
  token_version: number;
  created_at: string;
  updated_at: string;
};

export type AuthMeResponse = AuthUser;

export type AuthUserListResponse = {
  users: AuthUser[];
};

export type AuthCreateUserRequest = {
  username: string;
  password: string;
  firstname?: string;
  lastname?: string;
  is_admin?: boolean;
};

export type AuthUpdateUserRequest = {
  firstname?: string;
  lastname?: string;
  is_admin?: boolean;
};

export type AuthChangePasswordRequest = {
  currentPassword: string;
  newPassword: string;
};

export type VersionResponse = {
  gitHash: string;
  startedAt: string;
  mode: "standalone" | "server";
};

export type TopicState = "seed" | "shallow" | "deep" | "saturated" | "split_candidate" | "deprecated";
export type TopicConfidence = "high" | "low";
export type TopicDisposition = "parked" | "settled" | null;

export type Topic = {
  id: string;
  label: string;
  state: TopicState;
  confidence: TopicConfidence;
  depth: number;
  parent: string | null;
  children: string[];
  cluster: string | null;
  wiki_page: string | null;
  sources: Array<{ path: string; relevance: number; added_at: string }>;
  depends_on: string[];
  outputs: string[];
  justification: {
    goal_support: string;
    graph_support: string;
    questions_addressed: string[];
  } | null;
  discovery: {
    origin: string;
    discovered_at: string;
    discovered_from: string | null;
    reason: string | null;
    last_deepened: string | null;
    deepening_count: number;
  };
  deprecation: {
    reason: string | null;
    deprecated_at: string | null;
    merged_into: string | null;
    notes: string | null;
  } | null;
  metrics: {
    source_count: number;
    cross_references: number;
    word_count: number;
    last_updated: string | null;
  };
  coverage_gaps: Array<string | {
    description: string;
    search_hints?: string[];
    target_urls?: string[];
    reason?: string;
    attempts?: number;
    first_noted?: string;
  }>;
  disposition: TopicDisposition;
  disposition_at: string | null;
  disposition_note: string | null;
  queued_for_deepen: boolean;
  deepen_log: Array<{
    deepened_at: string;
    sources_added: number;
    sources_total?: number;
    unfetched?: string[];
    word_count_before: number;
    word_count_after: number;
    state_before: TopicState;
    state_after: TopicState;
    enriched_files: string[];
    enriched_file_details?: string[];
    seed_topics_added?: number;
    coverage_gaps_remaining?: string[];
  }>;
};

export type TopicDuplicate = {
  id: string;
  label: string;
  state: TopicState;
  disposition: TopicDisposition;
};

export type CreateTopicRequest = {
  label: string;
  justification?: string | null;
  conversationId?: string | null;
  force?: boolean;
};

export type CreateTopicResponse = {
  created: boolean;
  topic: Topic | null;
  duplicates: TopicDuplicate[];
  acknowledgedDuplicates?: boolean;
  error?: string;
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
  runKind: "rebuild" | "full_rebuild" | "output_build" | "artifact_build" | "artifact_batch_build" | "human_attention_resolve";
  attentionContext: Record<string, unknown> | null;
  events: AgentRunEvent[];
  log: string[];
  buildPhase?: "research" | "fetching" | "digests" | "wiki" | "output_build" | "recording" | "auto_answer" | "auto_artifacts" | "artifact_build" | "complete" | null;
  buildPhaseDetail?: string | null;
  buildQueue?: string[] | null;
};

export type OutputFileInfo = {
  path: string;
  builtAt: string;
  stale: boolean;
};

export type OutputStatusResponse = {
  lastKnowledgeBuild: string | null;
  outputs: OutputFileInfo[];
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

export type ChatMessageFileRename = {
  from: string;
  to: string;
  summary: string;
  appliedAt?: string;
  status: "proposed" | "applied" | "rejected" | "failed";
};

export type ChatMessageArtifactRename = {
  /** Old artifact slug */
  from: string;
  /** New artifact slug */
  to: string;
  summary: string;
  appliedAt?: string;
  status: "proposed" | "applied" | "rejected" | "failed";
};

export type ChatMessageTopicProposal = {
  label: string;
  justification: string;
};

export type ChatMessageArtifactProposal = {
  /** Suggested title for the artifact */
  title: string;
  /** High-level summary of what the artifact will contain */
  summary: string;
  /** Bullet-point details about the artifact's content */
  details: string[];
  /** Suggested spec body content (markdown) */
  specBody?: string;
  /** Suggested format (default: "html") */
  format?: string;
  /** Suggested sources to include as context hints */
  suggestedSources?: string[];
};

export type ChatMessageMetadata = Record<string, unknown> & {
  fileEdits?: ChatMessageFileEdit[];
  fileRenames?: ChatMessageFileRename[];
  artifactRenames?: ChatMessageArtifactRename[];
  topicProposals?: ChatMessageTopicProposal[];
  artifactProposals?: ChatMessageArtifactProposal[];
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

export type ArtifactSpec = {
  slug: string;
  name: string;
  format: string;
  lifecycle: string;
  modelId: string | null;
  sources: string[];
  lastBuilt: string | null;
  status: string;
  buildSpecHash: string | null;
  currentSpecHash: string | null;
  sourcesUpdatedSinceLastBuild: boolean;
};

export type ArtifactSpecDetail = {
  slug: string;
  frontmatter: Record<string, unknown>;
  body: string;
  rawContent: string;
};

export type AvailableSourceFile = {
  relativePath: string;
  kind: string;
  name: string;
};
