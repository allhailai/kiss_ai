import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import type { ChatContextRef, ChatMessage, Conversation, ConversationSummary, ProjectFile, RebuildModel } from "../../contracts/api";
import { api } from "../../data/apiClient";
import { errorMessage } from "../../domain/errors";
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

export type ProjectChatController = ReturnType<typeof useProjectChat>;

export function useProjectChat({
  projectSlug,
  selectedModelId,
  projectFiles,
  onNotice,
}: {
  projectSlug: string | null;
  selectedModelId: string;
  projectFiles: ProjectFile[];
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
    if (!projectSlug) return [];
    const response = await api.conversations(projectSlug);
    setConversations(response.conversations);
    return response.conversations;
  }, [projectSlug]);

  const handleConversationTruncated = useCallback(() => {
    forceScrollToLatestRef.current = true;
    shouldStickToLatestRef.current = true;
  }, []);

  const openConversation = async (conversationId: string) => {
    if (!projectSlug) return;
    setLoading(true);
    onNotice("");
    try {
      setActiveConversation(await api.conversation(projectSlug, conversationId));
      setContextRefs([]);
      cancelEditingMessage();
    } catch (error) {
      onNotice(errorMessage(error, "Could not open the conversation."));
    } finally {
      setLoading(false);
    }
  };

  const createConversation = async () => {
    if (!projectSlug) return;
    setLoading(true);
    onNotice("");
    try {
      const conversation = await api.createConversation(projectSlug, { modelId: selectedModelId });
      setActiveConversation(conversation);
      setContextRefs([]);
      cancelEditingMessage();
      await refreshConversations();
    } catch (error) {
      onNotice(errorMessage(error, "Could not create a conversation."));
    } finally {
      setLoading(false);
    }
  };

  const ensureConversation = async () => {
    if (activeConversation) return activeConversation;
    if (!projectSlug) throw new Error("Select a project first.");
    const conversation = await api.createConversation(projectSlug, { modelId: selectedModelId });
    setActiveConversation(conversation);
    await refreshConversations();
    return conversation;
  };

  const sendMessage = async () => {
    if (!projectSlug) return;
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
      onNotice(errorMessage(error, "Could not send the chat message."));
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
      onNotice(errorMessage(error, "Could not edit the chat message."));
      setSending(false);
    }
  };

  const handleComposerChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setMessageDraft(event.currentTarget.value);
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
    if (!projectSlug) {
      setActiveConversation(null);
      setConversations([]);
      setContextRefs([]);
      cancelEditingMessage();
      setLoading(false);
      setSending(false);
      return;
    }

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
        onNotice(errorMessage(error, "Could not load conversations."));
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

  return {
    activeConversation,
    addContextRef,
    cancelEditingMessage,
    contextFiles,
    contextRefs,
    conversationFilter,
    conversations,
    createConversation,
    editDraft,
    editingMessageId,
    filteredConversations,
    handleComposerChange,
    handleThreadScroll,
    loading,
    messageDraft,
    openConversation,
    saveEditedMessage,
    scrollToLatest,
    selectedContextPath,
    sending,
    setContextRefs,
    setConversationFilter,
    setEditDraft,
    setSelectedContextPath,
    showJumpToLatest,
    startEditingMessage,
    threadRef,
    composerTextareaRef,
    sendMessage,
  };
}

export function ProjectChatConversationHistory({
  chat,
  onSelectConversation,
}: {
  chat: ProjectChatController;
  onSelectConversation?: (conversationId: string) => void;
}) {
  return (
    <aside className="content-card chat-sidebar">
      <div className="section-heading">
        <div>
          <h3>Conversations</h3>
          <p>{chat.conversations.length.toLocaleString()} saved conversation{chat.conversations.length === 1 ? "" : "s"}</p>
        </div>
        <button disabled={chat.loading || chat.sending} onClick={() => void chat.createConversation()} type="button">
          New
        </button>
      </div>
      <input
        aria-label="Filter conversations"
        className="chat-filter"
        onChange={(event) => chat.setConversationFilter(event.target.value)}
        placeholder="Search conversations"
        value={chat.conversationFilter}
      />
      <div className="chat-conversation-list">
        {chat.filteredConversations.length ? (
          chat.filteredConversations.map((conversation) => (
            <button
              className={chat.activeConversation?.id === conversation.id ? "chat-conversation-item active" : "chat-conversation-item"}
              disabled={chat.sending}
              key={conversation.id}
              onClick={() => {
                if (onSelectConversation) {
                  onSelectConversation(conversation.id);
                } else {
                  void chat.openConversation(conversation.id);
                }
              }}
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
  );
}

export function ProjectChatPanel({
  chat,
  models,
  selectedModelId,
  onModelChange,
}: {
  chat: ProjectChatController;
  models: RebuildModel[];
  selectedModelId: string;
  onModelChange: (modelId: string) => void;
}) {
  return (
    <section className="content-card chat-main">
      <div className="chat-topbar">
        <div>
          <span>Project Chat</span>
          <strong>{chat.activeConversation?.title || "New conversation"}</strong>
        </div>
        <button disabled={chat.loading || chat.sending} onClick={() => void chat.createConversation()} type="button">
          New Conversation
        </button>
      </div>

      <ChatThread
        disabled={chat.sending}
        editDraft={chat.editDraft}
        editingMessageId={chat.editingMessageId}
        emptyDescription="Ask a question, attach relevant project files as context, or create a new conversation to clear prior chat history."
        emptyTitle={chat.loading ? "Loading conversation..." : "Start a project conversation"}
        messages={chat.activeConversation?.messages ?? []}
        onCancelEdit={chat.cancelEditingMessage}
        onEditDraftChange={chat.setEditDraft}
        onJumpToLatest={() => chat.scrollToLatest()}
        onSaveEdit={chat.saveEditedMessage}
        onScroll={chat.handleThreadScroll}
        onStartEdit={chat.startEditingMessage}
        showJumpToLatest={chat.showJumpToLatest}
        threadRef={chat.threadRef}
      />

      <ChatComposer
        contextFiles={chat.contextFiles}
        contextRefs={chat.contextRefs}
        disabled={chat.sending}
        draft={chat.messageDraft}
        models={models}
        onAddContextRef={chat.addContextRef}
        onChangeDraft={chat.handleComposerChange}
        onModelChange={onModelChange}
        onRemoveContextRef={(path) => chat.setContextRefs((current) => current.filter((candidate) => candidate.path !== path))}
        onSelectedContextPathChange={chat.setSelectedContextPath}
        onSubmit={() => void chat.sendMessage()}
        selectedContextPath={chat.selectedContextPath}
        selectedModelId={selectedModelId}
        textareaRef={chat.composerTextareaRef}
      />
    </section>
  );
}

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
  const chat = useProjectChat({ projectSlug, selectedModelId, projectFiles, onNotice });

  return (
    <div className="chat-workspace">
      <section className="chat-layout">
        <ProjectChatConversationHistory chat={chat} />
        <ProjectChatPanel chat={chat} models={models} selectedModelId={selectedModelId} onModelChange={onModelChange} />
      </section>
    </div>
  );
}

