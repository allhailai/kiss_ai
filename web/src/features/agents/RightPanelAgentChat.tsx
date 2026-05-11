import { useMemo, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import type { AgentContextFile, ChatContextRef, ChatMessageFileEdit, Conversation, ConversationSummary, ProjectFile, RebuildModel } from "../../contracts/api";
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
    context?: { currentFile?: AgentContextFile; editableFiles?: AgentContextFile[]; sourceFiles?: ChatContextRef[] };
  }) => Promise<boolean>;
  sending: boolean;
  setConversationFilter: (query: string) => void;
  showJumpToLatest: boolean;
  startDraftConversation: () => void;
  threadRef: RefObject<HTMLDivElement | null>;
};

function contextFileLabel(file: AgentContextFile) {
  return file.label || file.path;
}

function contextRefLabel(ref: ChatContextRef) {
  return ref.label || ref.path;
}

function projectFileLabel(file: ProjectFile) {
  return file.name || fileBasename(file.path);
}

export function RightPanelAgentChat({
  activeFiles,
  chat,
  contextRefs,
  currentFile,
  highlightedContext,
  models,
  onAddContextRef,
  onApplyFileEdit,
  onContextRefsChange,
  onModelChange,
  onModifyCurrentFile,
  onRemoveActiveFile,
  projectFiles,
  selectedModelId,
}: {
  activeFiles: AgentContextFile[];
  chat: RightPanelChatController;
  contextRefs: ChatContextRef[];
  currentFile: AgentContextFile | null;
  highlightedContext: { path: string; target: "active" | "context" } | null;
  models: RebuildModel[];
  onAddContextRef: (path: string) => void;
  onApplyFileEdit: (edit: ChatMessageFileEdit) => void;
  onContextRefsChange: Dispatch<SetStateAction<ChatContextRef[]>>;
  onModelChange: (modelId: string) => void;
  onModifyCurrentFile: () => void;
  onRemoveActiveFile: (path: string) => void;
  projectFiles: ProjectFile[];
  selectedModelId: string;
}) {
  const [draft, setDraft] = useState("");
  const [filePickerQuery, setFilePickerQuery] = useState("");
  const [filePickerOpen, setFilePickerOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const titleTriggerRef = useRef<HTMLButtonElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const currentFileInActive = Boolean(currentFile && activeFiles.some((file) => file.path === currentFile.path));
  const currentFileInContext = Boolean(currentFile && contextRefs.some((ref) => ref.path === currentFile.path));
  const filePickerOptions = useMemo(() => {
    if (!filePickerOpen) return [];
    const selectedPaths = new Set(contextRefs.map((file) => file.path));
    const query = filePickerQuery.trim().toLowerCase();
    return projectFiles
      .filter((file) => file.chatContextReadable)
      .filter((file) => !selectedPaths.has(file.path))
      .filter((file) => {
        if (!query) return true;
        return `${file.path} ${file.name} ${file.kind}`.toLowerCase().includes(query);
      });
  }, [contextRefs, filePickerOpen, filePickerQuery, projectFiles]);

  const startNewConversation = () => {
    if (chat.sending) return;
    chat.startDraftConversation();
    setDraft("");
    onContextRefsChange([]);
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
    onAddContextRef(path);
    setFilePickerQuery("");
    setFilePickerOpen(false);
  };

  const addContextRef = (path: string) => {
    if (chat.sending) return;
    const file = projectFiles.find((candidate) => candidate.path === path);
    if (!file || contextRefs.some((ref) => ref.path === file.path)) return;

    onContextRefsChange((current) => [...current, { path: file.path, label: file.name, kind: file.kind }]);
  };

  const removeContextRef = (path: string) => {
    onContextRefsChange((current) => current.filter((ref) => ref.path !== path));
  };

  const sendMessage = async () => {
    const content = draft.trim();
    if (!content || chat.sending) return;

    const sent = await chat.sendMessage({
      content,
      context:
        currentFile || activeFiles.length || contextRefs.length
          ? {
              currentFile: currentFile ?? undefined,
              editableFiles: activeFiles.length ? activeFiles : undefined,
              sourceFiles: contextRefs.length ? contextRefs : undefined,
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
            {!currentFileInContext || (currentFile.editable && !currentFileInActive) ? (
              <div className="agent-current-file-actions" aria-label="Current file actions">
                <details className="agent-current-file-help">
                  <summary aria-label="Explain AI Context and AI Editable">?</summary>
                  <span className="agent-current-file-help-text" role="tooltip">
                    <strong>AI Context</strong> tells AI this file may be helpful when answering your questions. AI can still look at other project
                    files if needed.
                    <strong>AI Editable</strong> lets AI change this file if you ask it to make an edit. Use this only for files you want AI to modify.
                  </span>
                </details>
                {!currentFileInContext ? (
                  <button className="agent-current-file-action-button" disabled={chat.sending} onClick={() => onAddContextRef(currentFile.path)} type="button">
                    + AI Context
                  </button>
                ) : null}
                {currentFile.editable && !currentFileInActive ? (
                  <button className="agent-current-file-action-button" disabled={chat.sending} onClick={onModifyCurrentFile} type="button">
                    + AI Editable
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : (
          <span className="agent-current-file-status">No file open</span>
        )}
      </div>
      {activeFiles.length ? (
        <div className="agent-active-context" aria-label="Editable target files">
          <span className="agent-context-label">Editable targets</span>
          <div className="agent-context-chips">
            {activeFiles.map((file) => (
              <span
                className={
                  highlightedContext?.target === "active" && highlightedContext.path === file.path
                    ? "agent-context-chip highlighted"
                    : "agent-context-chip"
                }
                key={file.path}
              >
                <code title={file.path}>
                  {contextFileLabel(file)}
                  {file.draftState === "unsaved" ? " (unsaved)" : ""}
                </code>
                <button aria-label={`Remove ${file.path} from editable targets`} onClick={() => onRemoveActiveFile(file.path)} type="button">
                  x
                </button>
              </span>
            ))}
          </div>
        </div>
      ) : null}
      {contextRefs.length ? (
        <div className="agent-active-context" aria-label="Source context files">
          <button className="agent-context-label agent-context-label-button" onClick={toggleFilePicker} type="button">
            Context
          </button>
          <div className="agent-context-chips">
            {contextRefs.map((ref) => (
              <span
                className={
                  highlightedContext?.target === "context" && highlightedContext.path === ref.path
                    ? "agent-context-chip highlighted"
                    : "agent-context-chip"
                }
                key={ref.path}
              >
                <code title={ref.path}>{contextRefLabel(ref)}</code>
                <button aria-label={`Remove ${ref.path} from context`} onClick={() => removeContextRef(ref.path)} type="button">
                  x
                </button>
              </span>
            ))}
          </div>
        </div>
      ) : null}
      {contextRefs.length && filePickerOpen ? (
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
        contextRefs={contextRefs}
        disabled={chat.sending}
        draft={draft}
        models={models}
        onAddContextRef={addContextRef}
        onChangeDraft={(event) => setDraft(event.currentTarget.value)}
        onModelChange={onModelChange}
        onRemoveContextRef={removeContextRef}
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
