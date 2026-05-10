export type AgentCapabilityRisk = "read" | "propose" | "write" | "run";
export type AgentContextFileKind = "human" | "ai" | "output" | "log" | "design";
export type AgentContextDraftState = "saved" | "unsaved" | "unknown";
export type AgentContextFileRole = "primary" | "secondary";

export type AgentCapability = {
  id: string;
  label: string;
  description: string;
  risk: AgentCapabilityRisk;
  available: boolean;
};

export type AgentCapabilitiesResponse = {
  capabilities: AgentCapability[];
};

export type AgentContextFile = {
  path: string;
  label?: string;
  kind?: AgentContextFileKind;
  editable?: boolean;
  annotation?: boolean;
  contentHash?: string;
  draftState?: AgentContextDraftState;
  role?: AgentContextFileRole;
};

export type AgentContextRef = {
  path: string;
  label?: string;
  kind?: AgentContextFileKind;
  source?: "active_file" | "manual";
};

export type AgentMessageContext = {
  activeFiles?: AgentContextFile[];
  fileRefs?: AgentContextRef[];
};

export type AgentToolCallStatus = "pending_approval" | "running" | "complete" | "failed";

export type AgentToolCall = {
  id: string;
  capabilityId: string;
  status: AgentToolCallStatus;
  arguments: Record<string, unknown>;
  result?: unknown;
  error?: string;
  createdAt: string;
  updatedAt: string;
};

export type AgentSession = {
  id: string;
  projectSlug: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: AgentSessionMessage[];
  toolCalls: AgentToolCall[];
};

export type AgentSessionMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
  updatedAt: string;
  modelId: string | null;
  status: "complete" | "streaming" | "error";
  context?: AgentMessageContext;
};

export type SendAgentSessionMessageRequest = {
  content: string;
  modelId?: string;
  context?: AgentMessageContext;
};
