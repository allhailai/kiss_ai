import { useRef, useState, type RefObject } from "react";
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

function contextFileLabel(file: AgentContextFile) {
  return file.label || file.path;
}

export function RightPanelAgentChat({
  activeFiles,
  chat,
  models,
  onModelChange,
  projectFiles,
  selectedModelId,
}: {
  activeFiles: AgentContextFile[];
  chat: RightPanelChatController;
  models: RebuildModel[];
  onModelChange: (modelId: string) => void;
  projectFiles: ProjectFile[];
  selectedModelId: string;
}) {
  const [contextRefs, setContextRefs] = useState<ChatContextRef[]>([]);
  const [draft, setDraft] = useState("");
  const [selectedContextPath, setSelectedContextPath] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const startNewConversation = () => {
    if (chat.sending) return;
    chat.startDraftConversation();
    setDraft("");
    setContextRefs([]);
    setSelectedContextPath("");
    textareaRef.current?.focus();
  };

  const addContextRef = (path = selectedContextPath) => {
    if (chat.sending) return;
    const file = projectFiles.find((candidate) => candidate.path === path);
    if (!file || contextRefs.some((ref) => ref.path === file.path)) return;

    setContextRefs((current) => [...current, { path: file.path, label: file.name, kind: file.kind }]);
    setSelectedContextPath("");
  };

  const removeContextRef = (path: string) => {
    setContextRefs((current) => current.filter((ref) => ref.path !== path));
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
        <span className="agent-context-label">Active files</span>
        {activeFiles.length ? (
          <div className="agent-context-chips">
            {activeFiles.map((file) => (
              <code key={file.path} title={file.path}>
                {contextFileLabel(file)}
                {file.draftState === "unsaved" ? " (unsaved)" : ""}
              </code>
            ))}
          </div>
        ) : (
          <p>No active file selected.</p>
        )}
      </div>
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
        submitLabel="Ask"
        textareaRef={textareaRef}
      />
    </div>
  );
}
