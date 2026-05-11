import { useMemo, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import type { AgentContextFile, ChatContextFile, ChatMessageFileEdit, Conversation, ConversationSummary, ProjectFile, RebuildModel } from "../../contracts/api";
import { fileBasename } from "../../domain/files";
import { ChatComposer } from "../../shared/chat/ChatComposer";
import { ChatThread } from "../../shared/chat/ChatThread";
import { formatChatDateTime } from "../../shared/chat/chatRendering";

type RightPanelChatController = {
  activeConversation: Conversation | null;
  conversationFilter: string;
  conversations: ConversationSummary[];
  filteredConversations: ConversationSummary[];
  handleThreadScroll: () => void;
  loading: boolean;
  openConversation: (conversationId: string) => Promise<void>;
  scrollToLatest: () => void;
  sendMessage: (options: {
    content?: string;
    context?: { currentFile?: AgentContextFile; ai_editable_files?: AgentContextFile[]; context_files?: ChatContextFile[] };
  }) => Promise<boolean>;
  sending: boolean;
  setConversationFilter: (query: string) => void;
  showJumpToLatest: boolean;
  startDraftConversation: () => void;
  threadRef: RefObject<HTMLDivElement | null>;
};

type VisibleEditableTarget = {
  file: AgentContextFile;
  isCurrent: boolean;
  isTemporary: boolean;
};

function contextFileLabel(file: AgentContextFile) {
  return file.label || file.path;
}

function contextFileSelectionLabel(file: ChatContextFile) {
  return file.label || file.path;
}

function projectFileLabel(file: ProjectFile) {
  return file.name || fileBasename(file.path);
}

function uniqueEditableFiles(files: AgentContextFile[]) {
  const seen = new Set<string>();
  return files.filter((file) => {
    if (seen.has(file.path)) return false;
    seen.add(file.path);
    return true;
  });
}

export function RightPanelAgentChat({
  aiEditableFiles,
  chat,
  contextFiles,
  currentFile,
  highlightedContext,
  models,
  onAddContextFile,
  onApplyFileEdit,
  onContextFilesChange,
  onModelChange,
  onModifyCurrentFile,
  onRemoveAiEditableFile,
  projectFiles,
  selectedModelId,
}: {
  aiEditableFiles: AgentContextFile[];
  chat: RightPanelChatController;
  contextFiles: ChatContextFile[];
  currentFile: AgentContextFile | null;
  highlightedContext: { path: string; target: "editable" | "context" } | null;
  models: RebuildModel[];
  onAddContextFile: (path: string) => void;
  onApplyFileEdit: (edit: ChatMessageFileEdit) => void;
  onContextFilesChange: Dispatch<SetStateAction<ChatContextFile[]>>;
  onModelChange: (modelId: string) => void;
  onModifyCurrentFile: () => void;
  onRemoveAiEditableFile: (path: string) => void;
  projectFiles: ProjectFile[];
  selectedModelId: string;
}) {
  const [draft, setDraft] = useState("");
  const [excludedCurrentEditablePaths, setExcludedCurrentEditablePaths] = useState<Set<string>>(() => new Set());
  const [filePickerQuery, setFilePickerQuery] = useState("");
  const [filePickerOpen, setFilePickerOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const titleTriggerRef = useRef<HTMLButtonElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const currentFileInAiEditable = Boolean(currentFile && aiEditableFiles.some((file) => file.path === currentFile.path));
  const currentFileInContext = Boolean(currentFile && contextFiles.some((file) => file.path === currentFile.path));
  const currentFileIsEditable = Boolean(currentFile?.editable);
  const currentFileTemporarilyExcluded = Boolean(currentFile && excludedCurrentEditablePaths.has(currentFile.path));
  const visibleEditableTargets = useMemo<VisibleEditableTarget[]>(() => {
    const seen = new Set<string>();
    const targets: VisibleEditableTarget[] = [];

    if (currentFileIsEditable && currentFile && (!currentFileTemporarilyExcluded || currentFileInAiEditable)) {
      seen.add(currentFile.path);
      targets.push({
        file: currentFile,
        isCurrent: true,
        isTemporary: !currentFileInAiEditable,
      });
    }

    aiEditableFiles.forEach((file) => {
      if (seen.has(file.path)) return;
      seen.add(file.path);
      targets.push({
        file,
        isCurrent: currentFile?.path === file.path,
        isTemporary: false,
      });
    });

    return targets;
  }, [aiEditableFiles, currentFile, currentFileInAiEditable, currentFileIsEditable, currentFileTemporarilyExcluded]);
  const requestAiEditableFiles = useMemo(() => uniqueEditableFiles(visibleEditableTargets.map((target) => target.file)), [visibleEditableTargets]);
  const filePickerOptions = useMemo(() => {
    if (!filePickerOpen) return [];
    const selectedPaths = new Set(contextFiles.map((file) => file.path));
    const query = filePickerQuery.trim().toLowerCase();
    return projectFiles
      .filter((file) => file.chatContextReadable)
      .filter((file) => !selectedPaths.has(file.path))
      .filter((file) => {
        if (!query) return true;
        return `${file.path} ${file.name} ${file.kind}`.toLowerCase().includes(query);
      });
  }, [contextFiles, filePickerOpen, filePickerQuery, projectFiles]);

  const startNewConversation = () => {
    if (chat.sending) return;
    chat.startDraftConversation();
    setDraft("");
    onContextFilesChange([]);
    setFilePickerQuery("");
    setFilePickerOpen(false);
    setHistoryOpen(false);
    textareaRef.current?.focus();
  };

  const selectConversation = (conversationId: string) => {
    if (chat.sending) return;
    setHistoryOpen(false);
    void chat.openConversation(conversationId);
    titleTriggerRef.current?.focus();
  };

  const toggleFilePicker = () => {
    if (chat.sending) return;
    setFilePickerQuery("");
    setFilePickerOpen((current) => !current);
  };

  const addPickerFile = (path: string) => {
    if (!filePickerOpen) return;
    onAddContextFile(path);
    setFilePickerQuery("");
    setFilePickerOpen(false);
  };

  const addContextFile = (path: string) => {
    if (chat.sending) return;
    const file = projectFiles.find((candidate) => candidate.path === path);
    if (!file || contextFiles.some((contextFile) => contextFile.path === file.path)) return;

    onContextFilesChange((current) => [...current, { path: file.path, label: file.name, kind: file.kind }]);
  };

  const removeContextFile = (path: string) => {
    onContextFilesChange((current) => current.filter((file) => file.path !== path));
  };

  const excludeTemporaryEditableCurrentFile = (path: string) => {
    setExcludedCurrentEditablePaths((current) => new Set(current).add(path));
  };

  const includeTemporaryEditableCurrentFile = (path: string) => {
    setExcludedCurrentEditablePaths((current) => {
      if (!current.has(path)) return current;
      const next = new Set(current);
      next.delete(path);
      return next;
    });
  };

  const pinCurrentFileAsEditableTarget = () => {
    if (!currentFile) return;
    includeTemporaryEditableCurrentFile(currentFile.path);
    onModifyCurrentFile();
  };

  const sendMessage = async () => {
    const content = draft.trim();
    if (!content || chat.sending) return;

    const sent = await chat.sendMessage({
      content,
      context:
        currentFile || requestAiEditableFiles.length || contextFiles.length
          ? {
              currentFile: currentFile ?? undefined,
              ai_editable_files: requestAiEditableFiles.length ? requestAiEditableFiles : undefined,
              context_files: contextFiles.length ? contextFiles : undefined,
            }
          : undefined,
    });
    if (sent) {
      setDraft("");
    }
  };

  return (
    <div className="right-panel-agent-chat">
      <div className="agent-conversation-header">
        <div className="agent-conversation-title">
          <button
            aria-expanded={historyOpen}
            aria-haspopup="listbox"
            aria-label="Select chat conversation"
            className="agent-conversation-title-trigger"
            onClick={() => setHistoryOpen((open) => !open)}
            ref={titleTriggerRef}
            type="button"
          >
            <span>AI Chat</span>
            <strong>{chat.activeConversation?.title || "New AI Chat"}</strong>
            <span aria-hidden="true" className="agent-conversation-title-chevron">
              ▾
            </span>
          </button>
          {historyOpen ? (
            <section
              aria-label="Saved chat conversations"
              className="agent-history-popover"
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  setHistoryOpen(false);
                  titleTriggerRef.current?.focus();
                }
              }}
            >
              <input
                aria-label="Filter conversations"
                className="agent-history-filter"
                onChange={(event) => chat.setConversationFilter(event.currentTarget.value)}
                placeholder="Search conversations"
                type="search"
                value={chat.conversationFilter}
              />
              <div className="agent-history-list" role="listbox">
                {chat.filteredConversations.length ? (
                  chat.filteredConversations.map((conversation) => (
                    <button
                      aria-selected={chat.activeConversation?.id === conversation.id}
                      className={chat.activeConversation?.id === conversation.id ? "agent-history-item active" : "agent-history-item"}
                      disabled={chat.sending}
                      key={conversation.id}
                      onClick={() => selectConversation(conversation.id)}
                      role="option"
                      type="button"
                    >
                      <strong>{conversation.title}</strong>
                      <span>{conversation.summary || "No summary yet."}</span>
                      <small>
                        {formatChatDateTime(conversation.updatedAt)} · {conversation.messageCount} message
                        {conversation.messageCount === 1 ? "" : "s"}
                      </small>
                    </button>
                  ))
                ) : (
                  <p className="agent-history-empty">No conversations match this filter.</p>
                )}
              </div>
            </section>
          ) : null}
        </div>
        <button
          aria-label="New AI Chat"
          className="agent-new-conversation-button"
          disabled={chat.loading || chat.sending}
          onClick={startNewConversation}
          title="New AI Chat"
          type="button"
        >
          <span aria-hidden="true" className="agent-new-conversation-icon">
            ✎
          </span>
          <span className="agent-new-conversation-label">New AI Chat</span>
        </button>
      </div>
      <div className="right-panel-agent-thread">
        <ChatThread
          disabled={chat.sending}
          editable={false}
          emptyDescription="Ask the side-panel agent about this project."
          emptyTitle={chat.loading ? "Loading conversation..." : "Start AI chat"}
          messages={chat.activeConversation?.messages ?? []}
          onApplyFileEdit={onApplyFileEdit}
          onJumpToLatest={() => chat.scrollToLatest()}
          onScroll={chat.handleThreadScroll}
          showJumpToLatest={chat.showJumpToLatest}
          showThinking={chat.sending}
          threadRef={chat.threadRef}
        />
      </div>
      <div className="agent-current-file" aria-label="Current file context">
        <span className="agent-context-label">Viewing</span>
        {currentFile ? (
          <div className="agent-current-file-main">
            <code title={currentFile.path}>
              {contextFileLabel(currentFile)}
              {currentFile.draftState === "unsaved" ? " (unsaved)" : ""}
            </code>
            {!currentFileInContext || (currentFile.editable && !currentFileInAiEditable) ? (
              <div className="agent-current-file-actions" aria-label="Current file actions">
                <details className="agent-current-file-help">
                  <summary aria-label="Explain AI Context and AI Editable">?</summary>
                  <span className="agent-current-file-help-text" role="tooltip">
                    <strong>Current file</strong>
                    The open file appears as a temporary AI Editable target when the file allows edits.
                    <strong>AI Context</strong> tells AI this file may be helpful when answering your questions. AI can still look at other project
                    files if needed.
                    <strong>Editable targets</strong> stay editable when you switch files, so use them for multi-file edits.
                  </span>
                </details>
                {!currentFileInContext ? (
                  <button className="agent-current-file-action-button" disabled={chat.sending} onClick={() => onAddContextFile(currentFile.path)} type="button">
                    + AI Context
                  </button>
                ) : null}
                {currentFile.editable && !currentFileInAiEditable ? (
                  <button className="agent-current-file-action-button" disabled={chat.sending} onClick={pinCurrentFileAsEditableTarget} type="button">
                    + Editable target
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : (
          <span className="agent-current-file-status">No file open</span>
        )}
      </div>
      {visibleEditableTargets.length || (currentFileIsEditable && currentFileTemporarilyExcluded && currentFile) ? (
        <div className="agent-file-context" aria-label="Editable target files">
          <div className="agent-context-header">
            <span className="agent-context-label">AI Editable</span>
          </div>
          <div className="agent-context-chips">
            {visibleEditableTargets.map(({ file, isCurrent, isTemporary }) => (
              <span
                className={
                  highlightedContext?.target === "editable" && highlightedContext.path === file.path
                    ? `agent-context-chip highlighted${isTemporary ? " temporary" : ""}`
                    : `agent-context-chip${isTemporary ? " temporary" : ""}`
                }
                key={file.path}
              >
                <code title={file.path}>
                  {contextFileLabel(file)}
                  {file.draftState === "unsaved" ? " (unsaved)" : ""}
                </code>
                {isCurrent ? <small>Current</small> : null}
                <button
                  aria-label={`Remove ${file.path} from editable targets`}
                  onClick={() => (isTemporary ? excludeTemporaryEditableCurrentFile(file.path) : onRemoveAiEditableFile(file.path))}
                  type="button"
                >
                  x
                </button>
              </span>
            ))}
            {currentFileIsEditable && currentFileTemporarilyExcluded && currentFile ? (
              <button
                className="agent-context-chip agent-context-chip-action"
                disabled={chat.sending}
                onClick={() => includeTemporaryEditableCurrentFile(currentFile.path)}
                type="button"
              >
                + AI Editable
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      {contextFiles.length ? (
        <div className="agent-file-context" aria-label="Source context files">
          <button className="agent-context-label agent-context-label-button" onClick={toggleFilePicker} type="button">
            Context
          </button>
          <div className="agent-context-chips">
            {contextFiles.map((file) => (
              <span
                className={
                  highlightedContext?.target === "context" && highlightedContext.path === file.path
                    ? "agent-context-chip highlighted"
                    : "agent-context-chip"
                }
                key={file.path}
              >
                <code title={file.path}>{contextFileSelectionLabel(file)}</code>
                <button aria-label={`Remove ${file.path} from context`} onClick={() => removeContextFile(file.path)} type="button">
                  x
                </button>
              </span>
            ))}
          </div>
        </div>
      ) : null}
      {contextFiles.length && filePickerOpen ? (
        <section className="agent-file-picker" aria-label="Add context file">
          <div className="agent-file-picker-topbar">
            <strong>Add context file</strong>
            <button onClick={() => setFilePickerOpen(false)} type="button">
              Close
            </button>
          </div>
          <input
            aria-label="Search project files"
            autoComplete="off"
            onChange={(event) => setFilePickerQuery(event.currentTarget.value)}
            placeholder="Search files..."
            type="search"
            value={filePickerQuery}
          />
          <div className="agent-file-picker-results">
            {filePickerOptions.length ? (
              filePickerOptions.map((file) => (
                <button key={file.path} onClick={() => addPickerFile(file.path)} title={file.path} type="button">
                  <strong>{projectFileLabel(file)}</strong>
                  <span>{file.path}</span>
                </button>
              ))
            ) : (
              <p>No matching files.</p>
            )}
          </div>
        </section>
      ) : null}
      <ChatComposer
        contextFiles={projectFiles}
        selectedContextFiles={contextFiles}
        disabled={chat.sending}
        draft={draft}
        models={models}
        onAddContextFile={addContextFile}
        onChangeDraft={(event) => setDraft(event.currentTarget.value)}
        onModelChange={onModelChange}
        onRemoveContextFile={removeContextFile}
        onSubmit={() => void sendMessage()}
        placeholder="Ask the side-panel agent..."
        selectedModelId={selectedModelId}
        showContextControls={false}
        submitLabel="Ask"
        textareaRef={textareaRef}
      />
    </div>
  );
}
