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
  draftContent?: string;
  draftState?: AgentContextDraftState;
  role?: AgentContextFileRole;
};

export type AgentContextFileSelection = {
  path: string;
  label?: string;
  kind?: AgentContextFileKind;
  source?: "active_file" | "manual";
};

export type AgentEditableTargetFile = AgentContextFile;
export type AgentContextSourceFile = AgentContextFileSelection;

export type AgentMessageContext = {
  /** Read-only context for the file currently open in the editor. */
  currentFile?: AgentContextFile;
  /** Files explicitly permitted as editable targets for proposal/apply-to-draft flows. */
  ai_editable_files?: AgentEditableTargetFile[];
  /** Files explicitly selected as read-only source context. */
  context_files?: AgentContextSourceFile[];
};
