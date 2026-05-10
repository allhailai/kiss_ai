export type AgentContextFileKind = "human" | "ai" | "output" | "log" | "design";
export type AgentContextDraftState = "saved" | "unsaved" | "unknown";
export type AgentContextFileRole = "primary" | "secondary";

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
