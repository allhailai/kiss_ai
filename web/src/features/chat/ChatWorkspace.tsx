import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChatContextRef, ChatMessage, Conversation, ConversationSummary, ProjectFile, RebuildModel } from "../../contracts/api";
import { api } from "../../data/apiClient";
import { ChatComposer } from "./ChatComposer";
import { ChatThread } from "./ChatThread";
import { formatChatDateTime } from "./chatRendering";
import { useConversationStream } from "./useConversationStream";

function isChatContextFile(file: ProjectFile) {
  return /^human_[^/]+\.md$/i.test(file.path) || file.path.startsWith("inputs_human/") || file.path.startsWith("inputs_ai/") || file.path.startsWith("outputs_ai/");
}

function isNearScrollBottom(element: HTMLElement) {
  return element.scrollHeight - element.scrollTop - element.clientHeight < 120;
}

const CHAT_COMPOSER_MAX_ROWS = 8;

export function ChatWorkspace({
  projectSlug,
  models,
  selectedModelId,
  projectFiles,
  onModelChange,
  onNotice,
}: {
  projectSlug: string;
  models: RebuildModel[];
  selectedModelId: string;
  projectFiles: ProjectFile[];
  onModelChange: (modelId: string) => void;
  onNotice: (message: string) => void;
}) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [conversationFilter, setConversationFilter] = useState("");
  const [messageDraft, setMessageDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [selectedContextPath, setSelectedContextPath] = useState("");
  const [contextRefs, setContextRefs] = useState<ChatContextRef[]>([]);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const threadRef = useRef<HTMLDivElement | null>(null);
  const composerTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const shouldStickToLatestRef = useRef(true);
  const forceScrollToLatestRef = useRef(false);
  const contextFiles = useMemo(() => projectFiles.filter(isChatContextFile), [projectFiles]);
  const filteredConversations = useMemo(() => {
    const query = conversationFilter.trim().toLowerCase();
    if (!query) return conversations;
    return conversations.filter((conversation) =>
      `${conversation.title} ${conversation.summary} ${conversation.modelId ?? ""}`.toLowerCase().includes(query),
    );
  }, [conversationFilter, conversations]);

  const refreshConversations = useCallback(async () => {
    const response = await api.conversations(projectSlug);
    setConversations(response.conversations);
    return response.conversations;
  }, [projectSlug]);

  const handleConversationTruncated = useCallback(() => {
    forceScrollToLatestRef.current = true;
    shouldStickToLatestRef.current = true;
  }, []);

  const openConversation = async (conversationId: string) => {
    setLoading(true);
    onNotice("");
    try {
      setActiveConversation(await api.conversation(projectSlug, conversationId));
      setContextRefs([]);
      cancelEditingMessage();
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "Could not open the conversation.");
    } finally {
      setLoading(false);
    }
  };

  const createConversation = async () => {
    setLoading(true);
    onNotice("");
    try {
      const conversation = await api.createConversation(projectSlug, { modelId: selectedModelId });
      setActiveConversation(conversation);
      setContextRefs([]);
      cancelEditingMessage();
      await refreshConversations();
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "Could not create a conversation.");
    } finally {
      setLoading(false);
    }
  };

  const ensureConversation = async () => {
    if (activeConversation) return activeConversation;
    const conversation = await api.createConversation(projectSlug, { modelId: selectedModelId });
    setActiveConversation(conversation);
    await refreshConversations();
    return conversation;
  };

  const resizeComposer = (textarea = composerTextareaRef.current) => {
    if (!textarea) return;

    textarea.style.height = "auto";
    const styles = window.getComputedStyle(textarea);
    const lineHeight = Number.parseFloat(styles.lineHeight) || 20;
    const paddingY = Number.parseFloat(styles.paddingTop) + Number.parseFloat(styles.paddingBottom);
    const borderY = Number.parseFloat(styles.borderTopWidth) + Number.parseFloat(styles.borderBottomWidth);
    const maxHeight = Math.ceil(lineHeight * CHAT_COMPOSER_MAX_ROWS + paddingY + borderY);
    const contentHeight = textarea.scrollHeight + borderY;
    const nextHeight = Math.min(contentHeight, maxHeight);

    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = contentHeight > maxHeight ? "auto" : "hidden";
  };

  const sendMessage = async () => {
    const content = messageDraft.trim();
    if (!content || sending) return;

    setSending(true);
    onNotice("");
    try {
      const conversation = await ensureConversation();
      setMessageDraft("");
      const next = await api.sendChatMessage(projectSlug, conversation.id, {
        modelId: selectedModelId,
        content,
        context: contextRefs.length ? { fileRefs: contextRefs } : undefined,
      });
      setActiveConversation(next);
      await refreshConversations();
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "Could not send the chat message.");
      setSending(false);
    }
  };

  const startEditingMessage = (message: ChatMessage) => {
    if (sending || message.role !== "user") return;
    setEditingMessageId(message.id);
    setEditDraft(message.content);
    onNotice("");
  };

  const cancelEditingMessage = () => {
    setEditingMessageId(null);
    setEditDraft("");
  };

  const saveEditedMessage = async (message: ChatMessage) => {
    const content = editDraft.trim();
    if (!activeConversation || !content || sending || message.role !== "user") return;

    setSending(true);
    onNotice("");
    try {
      const next = await api.editChatMessage(projectSlug, activeConversation.id, message.id, {
        modelId: selectedModelId || undefined,
        content,
      });
      forceScrollToLatestRef.current = true;
      shouldStickToLatestRef.current = true;
      setActiveConversation(next);
      setEditingMessageId(null);
      setEditDraft("");
      await refreshConversations();
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "Could not edit the chat message.");
      setSending(false);
    }
  };

  const handleComposerChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessageDraft(event.currentTarget.value);
    resizeComposer(event.currentTarget);
  };

  const addContextRef = () => {
    if (sending) return;
    const file = contextFiles.find((candidate) => candidate.path === selectedContextPath);
    if (!file || contextRefs.some((ref) => ref.path === file.path)) return;
    setContextRefs((current) => [...current, { path: file.path, label: file.name, kind: file.kind }]);
    setSelectedContextPath("");
  };

  const scrollToLatest = (behavior: ScrollBehavior = "smooth") => {
    const thread = threadRef.current;
    if (!thread) return;
    thread.scrollTo({ top: thread.scrollHeight, behavior });
    shouldStickToLatestRef.current = true;
    setShowJumpToLatest(false);
  };

  const handleThreadScroll = () => {
    const thread = threadRef.current;
    if (!thread) return;
    const nearBottom = isNearScrollBottom(thread);
    shouldStickToLatestRef.current = nearBottom;
    setShowJumpToLatest(!nearBottom && Boolean(activeConversation?.messages.length));
  };

  useEffect(() => {
    setActiveConversation(null);
    setConversations([]);
    setContextRefs([]);
    cancelEditingMessage();
    void (async () => {
      setLoading(true);
      try {
        const nextConversations = await refreshConversations();
        if (nextConversations[0]) {
          setActiveConversation(await api.conversation(projectSlug, nextConversations[0].id));
        }
      } catch (error) {
        onNotice(error instanceof Error ? error.message : "Could not load conversations.");
      } finally {
        setLoading(false);
      }
    })();
  }, [onNotice, projectSlug, refreshConversations]);

  useConversationStream({
    conversationId: activeConversation?.id,
    onConversationTruncated: handleConversationTruncated,
    onNotice,
    projectSlug,
    refreshConversations,
    setActiveConversation,
    setSending,
  });

  useEffect(() => {
    window.requestAnimationFrame(() => scrollToLatest("auto"));
  }, [activeConversation?.id]);

  useEffect(() => {
    if (!activeConversation?.messages.length) return;
    if (forceScrollToLatestRef.current || shouldStickToLatestRef.current) {
      forceScrollToLatestRef.current = false;
      window.requestAnimationFrame(() => scrollToLatest("auto"));
    } else {
      setShowJumpToLatest(true);
    }
  }, [activeConversation?.messages.length, activeConversation?.messages.at(-1)?.content.length]);

  useEffect(() => {
    resizeComposer();
  }, [messageDraft]);

  return (
    <div className="chat-workspace">
      <section className="chat-layout">
        <aside className="content-card chat-sidebar">
          <div className="section-heading">
            <div>
              <h3>Conversations</h3>
              <p>{conversations.length.toLocaleString()} saved conversation{conversations.length === 1 ? "" : "s"}</p>
            </div>
            <button disabled={loading || sending} onClick={() => void createConversation()} type="button">
              New
            </button>
          </div>
          <input
            aria-label="Filter conversations"
            className="chat-filter"
            onChange={(event) => setConversationFilter(event.target.value)}
            placeholder="Search conversations"
            value={conversationFilter}
          />
          <div className="chat-conversation-list">
            {filteredConversations.length ? (
              filteredConversations.map((conversation) => (
                <button
                  className={activeConversation?.id === conversation.id ? "chat-conversation-item active" : "chat-conversation-item"}
                  disabled={sending}
                  key={conversation.id}
                  onClick={() => void openConversation(conversation.id)}
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
              <p className="chat-empty-state">No conversations match this filter.</p>
            )}
          </div>
        </aside>

        <section className="content-card chat-main">
          <div className="chat-topbar">
            <div>
              <span>Project Chat</span>
              <strong>{activeConversation?.title || "New conversation"}</strong>
            </div>
            <button disabled={loading || sending} onClick={() => void createConversation()} type="button">
              New Conversation
            </button>
          </div>

          <ChatThread
            disabled={sending}
            editDraft={editDraft}
            editingMessageId={editingMessageId}
            emptyDescription="Ask a question, attach relevant project files as context, or create a new conversation to clear prior chat history."
            emptyTitle={loading ? "Loading conversation..." : "Start a project conversation"}
            messages={activeConversation?.messages ?? []}
            onCancelEdit={cancelEditingMessage}
            onEditDraftChange={setEditDraft}
            onJumpToLatest={() => scrollToLatest()}
            onSaveEdit={saveEditedMessage}
            onScroll={handleThreadScroll}
            onStartEdit={startEditingMessage}
            showJumpToLatest={showJumpToLatest}
            threadRef={threadRef}
          />

          <ChatComposer
            contextFiles={contextFiles}
            contextRefs={contextRefs}
            disabled={sending}
            draft={messageDraft}
            models={models}
            onAddContextRef={addContextRef}
            onChangeDraft={handleComposerChange}
            onModelChange={onModelChange}
            onRemoveContextRef={(path) => setContextRefs((current) => current.filter((candidate) => candidate.path !== path))}
            onSelectedContextPathChange={setSelectedContextPath}
            onSubmit={() => void sendMessage()}
            selectedContextPath={selectedContextPath}
            selectedModelId={selectedModelId}
            textareaRef={composerTextareaRef}
          />
        </section>
      </section>
    </div>
  );
}

