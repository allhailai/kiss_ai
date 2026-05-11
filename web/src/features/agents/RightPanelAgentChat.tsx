import { useMemo, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import type { AgentContextFile, ChatContextRef, ChatMessageFileEdit, Conversation, ProjectFile, RebuildModel } from "../../contracts/api";
import { ChatComposer } from "../../shared/chat/ChatComposer";
import { ChatThread } from "../../shared/chat/ChatThread";

type RightPanelChatController = {
  activeConversation: Conversation | null;
  handleThreadScroll: () => void;
  loading: boolean;
  scrollToLatest: () => void;
  sendMessage: (options: {
    content?: string;
    context?: { currentFile?: AgentContextFile; editableFiles?: AgentContextFile[]; sourceFiles?: ChatContextRef[] };
  }) => Promise<boolean>;
  sending: boolean;
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
  return file.name || file.path.split("/").at(-1) || file.path;
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
  const [selectedContextPath, setSelectedContextPath] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const currentFileInActive = Boolean(currentFile && activeFiles.some((file) => file.path === currentFile.path));
  const currentFileInContext = Boolean(currentFile && contextRefs.some((ref) => ref.path === currentFile.path));
  const filePickerOptions = useMemo(() => {
    if (!filePickerOpen) return [];
    const selectedPaths = new Set(contextRefs.map((file) => file.path));
    const query = filePickerQuery.trim().toLowerCase();
    return projectFiles
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
    setSelectedContextPath("");
    textareaRef.current?.focus();
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

  const addContextRef = (path = selectedContextPath) => {
    if (chat.sending) return;
    const file = projectFiles.find((candidate) => candidate.path === path);
    if (!file || contextRefs.some((ref) => ref.path === file.path)) return;

    onContextRefsChange((current) => [...current, { path: file.path, label: file.name, kind: file.kind }]);
    setSelectedContextPath("");
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
        <div>
          <span>AI Chat</span>
          <strong>{chat.activeConversation?.title || "New AI Chat"}</strong>
        </div>
        <button disabled={chat.loading || chat.sending} onClick={startNewConversation} type="button">
          New AI Chat
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
                <span className="agent-current-file-help">
                  <button aria-describedby="agent-current-file-help-text" aria-label="Explain AI Context and AI Editable" type="button">
                    ?
                  </button>
                  <span className="agent-current-file-help-text" id="agent-current-file-help-text" role="tooltip">
                    <strong>AI Context</strong> tells AI this file may be helpful when answering your questions. AI can still look at other project
                    files if needed.
                    <strong>AI Editable</strong> lets AI change this file if you ask it to make an edit. Use this only for files you want AI to modify.
                  </span>
                </span>
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
        onSelectedContextPathChange={setSelectedContextPath}
        onSubmit={() => void sendMessage()}
        placeholder="Ask the side-panel agent..."
        selectedContextPath={selectedContextPath}
        selectedModelId={selectedModelId}
        showContextControls={false}
        submitLabel="Ask"
        textareaRef={textareaRef}
      />
    </div>
  );
}
