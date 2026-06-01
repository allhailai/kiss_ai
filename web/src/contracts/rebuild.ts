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

export type OutputFileInfo = {
  path: string;
  builtAt: string;
  stale: boolean;
};

export type OutputStatusResponse = {
  lastKnowledgeBuild: string | null;
  outputs: OutputFileInfo[];
};
