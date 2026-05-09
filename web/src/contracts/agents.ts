export type AgentCapabilityRisk = "read" | "write" | "run";

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
};

export type SendAgentSessionMessageRequest = {
  content: string;
  modelId?: string;
};
