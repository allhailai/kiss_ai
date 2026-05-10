import { useMemo, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import type { AgentContextFile, ChatContextRef, Conversation, ProjectFile, RebuildModel } from "../../contracts/api";
import { ChatComposer } from "../../shared/chat/ChatComposer";
import { ChatThread } from "../../shared/chat/ChatThread";

type RightPanelChatController = {
  activeConversation: Conversation | null;
  handleThreadScroll: () => void;
  loading: boolean;
  scrollToLatest: () => void;
  sendMessage: (options: { content?: string; context?: { activeFiles?: AgentContextFile[]; fileRefs?: ChatContextRef[] } }) => Promise<boolean>;
  sending: boolean;
  showJumpToLatest: boolean;
  startDraftConversation: () => void;
  threadRef: RefObject<HTMLDivElement | null>;
};

type FilePickerTarget = "active" | "context";

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
  chooserFile,
  contextRefs,
  highlightedContext,
  models,
  onAddActiveFile,
  onAddContextRef,
  onCloseChooser,
  onContextRefsChange,
  onModelChange,
  onRemoveActiveFile,
  projectFiles,
  selectedModelId,
}: {
  activeFiles: AgentContextFile[];
  chat: RightPanelChatController;
  chooserFile: ProjectFile | null;
  contextRefs: ChatContextRef[];
  highlightedContext: { path: string; target: "active" | "context" } | null;
  models: RebuildModel[];
  onAddActiveFile: (path: string) => void;
  onAddContextRef: (path: string) => void;
  onCloseChooser: () => void;
  onContextRefsChange: Dispatch<SetStateAction<ChatContextRef[]>>;
  onModelChange: (modelId: string) => void;
  onRemoveActiveFile: (path: string) => void;
  projectFiles: ProjectFile[];
  selectedModelId: string;
}) {
  const [draft, setDraft] = useState("");
  const [filePickerQuery, setFilePickerQuery] = useState("");
  const [filePickerTarget, setFilePickerTarget] = useState<FilePickerTarget | null>(null);
  const [selectedContextPath, setSelectedContextPath] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const chooserInActive = Boolean(chooserFile && activeFiles.some((file) => file.path === chooserFile.path));
  const chooserInContext = Boolean(chooserFile && contextRefs.some((ref) => ref.path === chooserFile.path));
  const filePickerOptions = useMemo(() => {
    if (!filePickerTarget) return [];
    const selectedPaths = new Set((filePickerTarget === "active" ? activeFiles : contextRefs).map((file) => file.path));
    const query = filePickerQuery.trim().toLowerCase();
    return projectFiles
      .filter((file) => !selectedPaths.has(file.path))
      .filter((file) => {
        if (!query) return true;
        return `${file.path} ${file.name} ${file.kind}`.toLowerCase().includes(query);
      });
  }, [activeFiles, contextRefs, filePickerQuery, filePickerTarget, projectFiles]);

  const startNewConversation = () => {
    if (chat.sending) return;
    chat.startDraftConversation();
    setDraft("");
    onContextRefsChange([]);
    setFilePickerQuery("");
    setFilePickerTarget(null);
    setSelectedContextPath("");
    onCloseChooser();
    textareaRef.current?.focus();
  };

  const toggleFilePicker = (target: FilePickerTarget) => {
    if (chat.sending) return;
    setFilePickerQuery("");
    setFilePickerTarget((current) => (current === target ? null : target));
  };

  const addPickerFile = (path: string) => {
    if (!filePickerTarget) return;
    if (filePickerTarget === "active") {
      onAddActiveFile(path);
    } else {
      onAddContextRef(path);
    }
    setFilePickerQuery("");
    setFilePickerTarget(null);
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
      context: activeFiles.length || contextRefs.length ? { activeFiles, fileRefs: contextRefs } : undefined,
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
          onJumpToLatest={() => chat.scrollToLatest()}
          onScroll={chat.handleThreadScroll}
          showJumpToLatest={chat.showJumpToLatest}
          showThinking={chat.sending}
          threadRef={chat.threadRef}
        />
      </div>
      <div className="agent-active-context" aria-label="Active editable files">
        <button className="agent-context-label agent-context-label-button" onClick={() => toggleFilePicker("active")} type="button">
          Active files
        </button>
        {activeFiles.length ? (
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
                <button aria-label={`Remove ${file.path} from active files`} onClick={() => onRemoveActiveFile(file.path)} type="button">
                  x
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p>No active file selected.</p>
        )}
      </div>
      <div className="agent-active-context" aria-label="Source context files">
        <button className="agent-context-label agent-context-label-button" onClick={() => toggleFilePicker("context")} type="button">
          Context
        </button>
        {contextRefs.length ? (
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
        ) : (
          <p>No source context selected.</p>
        )}
      </div>
      {filePickerTarget ? (
        <section className="agent-file-picker" aria-label={`Add ${filePickerTarget === "active" ? "active" : "context"} file`}>
          <div className="agent-file-picker-topbar">
            <strong>{filePickerTarget === "active" ? "Add active file" : "Add context file"}</strong>
            <button onClick={() => setFilePickerTarget(null)} type="button">
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
      {chooserFile && !chooserInActive ? (
        <section className="agent-file-chooser" aria-label="Add selected file to AI chat">
          <div>
            <span className="agent-context-label">Selected file</span>
            <strong title={chooserFile.path}>{projectFileLabel(chooserFile)}</strong>
            {chooserInContext ? <p>Already added as source context.</p> : <p>Add this file to the current AI chat.</p>}
          </div>
          <div className="agent-file-chooser-actions">
            <button onClick={() => onAddActiveFile(chooserFile.path)} type="button">
              + Add to Active
            </button>
            {!chooserInContext ? (
              <button onClick={() => onAddContextRef(chooserFile.path)} type="button">
                + Add to Context
              </button>
            ) : null}
            <button className="secondary" onClick={onCloseChooser} type="button">
              Dismiss
            </button>
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
