import type { AgentContextDraftState, AgentContextFile, AgentContextFileSelection, AgentContextSourceFile, AgentEditableTargetFile } from "./agents";

export type ChatMessageRole = "user" | "assistant" | "system";

export type ChatMessageStatus = "complete" | "streaming" | "error";

export type ChatContextFile = AgentContextFileSelection;

export type ChatContextTopic = {
  topicId: string;
  label: string;
};

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
    context_topics?: ChatContextTopic[];
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
    context_topics?: ChatContextTopic[];
  };
};

export type EditChatMessageRequest = {
  modelId?: string;
  content: string;
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
