import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatContextRef, ChatConversationEvent, ChatMessage, Conversation, ConversationSummary, ProjectFile, RebuildModel } from "../../contracts/api";
import { api } from "../../data/apiClient";
import { formatModelLabel, modelTierLabels, modelTierOrder } from "../../domain/modelLabels";

function formatLocalDateTime(value: string | null | undefined) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function isChatContextFile(file: ProjectFile) {
  return /^human_[^/]+\.md$/i.test(file.path) || file.path.startsWith("inputs_human/") || file.path.startsWith("inputs_ai/") || file.path.startsWith("outputs_ai/");
}

function contextLabel(ref: ChatContextRef) {
  return ref.label || ref.path;
}

function applyStreamingDelta(conversation: Conversation, messageId: string, delta: string, updatedAt: string): Conversation {
  const existingIndex = conversation.messages.findIndex((message) => message.id === messageId);
  const messages = [...conversation.messages];

  if (existingIndex >= 0) {
    const existing = messages[existingIndex];
    messages[existingIndex] = {
      ...existing,
      content: `${existing.content}${delta}`,
      updatedAt,
      status: "streaming",
    };
  } else {
    messages.push({
      id: messageId,
      role: "assistant",
      content: delta,
      createdAt: updatedAt,
      updatedAt,
      modelId: conversation.defaultModelId,
      status: "streaming",
    });
  }

  return { ...conversation, messages, updatedAt };
}

const chatMarkdownComponents: Components = {
  a({ children, href, ...props }) {
    return (
      <a href={href} rel="noopener noreferrer" target="_blank" {...props}>
        {children}
      </a>
    );
  },
};

function renderMessageContent(content: string) {
  if (!content.trim()) return <p>No content recorded.</p>;
  return (
    <div className="chat-markdown">
      <ReactMarkdown components={chatMarkdownComponents} remarkPlugins={[remarkGfm]} skipHtml>
        {content}
      </ReactMarkdown>
    </div>
  );
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
  const selectedModel = models.find((model) => model.id === selectedModelId) ?? null;
  const contextFiles = useMemo(() => projectFiles.filter(isChatContextFile), [projectFiles]);
  const filteredConversations = useMemo(() => {
    const query = conversationFilter.trim().toLowerCase();
    if (!query) return conversations;
    return conversations.filter((conversation) =>
      `${conversation.title} ${conversation.summary} ${conversation.modelId ?? ""}`.toLowerCase().includes(query),
    );
  }, [conversationFilter, conversations]);

  const refreshConversations = async () => {
    const response = await api.conversations(projectSlug);
    setConversations(response.conversations);
    return response.conversations;
  };

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

  const handleComposerKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.metaKey || event.ctrlKey || event.altKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    void sendMessage();
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
  }, [projectSlug]);

  useEffect(() => {
    if (!activeConversation || typeof EventSource === "undefined") return;

    const eventSource = new EventSource(api.conversationEventsUrl(projectSlug, activeConversation.id));
    const handleEvent = (event: MessageEvent<string>) => {
      try {
        const payload = JSON.parse(event.data) as ChatConversationEvent;
        if (payload.type === "snapshot") {
          setActiveConversation((current) => {
            if (current?.id === payload.conversation.id && payload.conversation.messages.length < current.messages.length) {
              forceScrollToLatestRef.current = true;
              shouldStickToLatestRef.current = true;
            }
            return payload.conversation;
          });
          void refreshConversations();
        } else if (payload.type === "message_delta") {
          setActiveConversation((current) =>
            current && current.id === payload.conversationId
              ? applyStreamingDelta(current, payload.messageId, payload.delta, payload.updatedAt)
              : current,
          );
        } else if (payload.type === "message_complete") {
          setActiveConversation(payload.conversation);
          setSending(false);
          void refreshConversations();
        } else if (payload.type === "error") {
          onNotice(payload.message);
          setSending(false);
        }
      } catch {
        // Poll/list refresh remains the fallback for malformed live events.
      }
    };

    eventSource.addEventListener("snapshot", handleEvent);
    eventSource.addEventListener("message_delta", handleEvent);
    eventSource.addEventListener("message_complete", handleEvent);
    eventSource.addEventListener("chat_error", handleEvent);
    eventSource.onerror = () => {
      eventSource.close();
    };

    return () => eventSource.close();
  }, [activeConversation?.id, projectSlug]);

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
                    {formatLocalDateTime(conversation.updatedAt)} · {conversation.messageCount} message
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

          <div className="chat-thread-shell">
            <div className="chat-thread" aria-live="polite" onScroll={handleThreadScroll} ref={threadRef}>
              {activeConversation?.messages.length ? (
                activeConversation.messages.map((message) => (
                  <ChatMessageBubble
                    disabled={sending}
                    editDraft={editDraft}
                    isEditing={editingMessageId === message.id}
                    key={message.id}
                    message={message}
                    onCancelEdit={cancelEditingMessage}
                    onEditDraftChange={setEditDraft}
                    onSaveEdit={saveEditedMessage}
                    onStartEdit={startEditingMessage}
                  />
                ))
              ) : (
                <div className="chat-thread-empty">
                  <h3>{loading ? "Loading conversation..." : "Start a project conversation"}</h3>
                  <p>Ask a question, attach relevant project files as context, or create a new conversation to clear prior chat history.</p>
                </div>
              )}
            </div>
            {showJumpToLatest ? (
              <button className="chat-jump-latest" onClick={() => scrollToLatest()} type="button">
                Jump to latest
              </button>
            ) : null}
          </div>

          <form
            className="chat-composer"
            onSubmit={(event) => {
              event.preventDefault();
              void sendMessage();
            }}
          >
            <textarea
              disabled={sending}
              ref={composerTextareaRef}
              onKeyDown={handleComposerKeyDown}
              onChange={handleComposerChange}
              placeholder="Ask about this project... Enter to send, Shift+Enter for a new line"
              value={messageDraft}
            />
            <div className="chat-composer-meta">
              <div className="chat-context-compact">
                {contextRefs.length ? (
                  <div className="chat-context-chips" aria-label="Selected file context">
                    {contextRefs.map((ref) => (
                      <button
                        className="chat-context-chip"
                        key={ref.path}
                        onClick={() => setContextRefs((current) => current.filter((candidate) => candidate.path !== ref.path))}
                        title={`Remove ${ref.path}`}
                        type="button"
                      >
                        {contextLabel(ref)} <span aria-hidden="true">x</span>
                      </button>
                    ))}
                  </div>
                ) : null}
                <div className="chat-context-controls">
                  <select
                    aria-label="Add file context"
                    disabled={sending}
                    onChange={(event) => setSelectedContextPath(event.target.value)}
                    value={selectedContextPath}
                  >
                    <option value="">Add Context</option>
                    {contextFiles.map((file) => (
                      <option key={file.path} value={file.path}>
                        {file.path}
                      </option>
                    ))}
                  </select>
                  <button disabled={sending || !selectedContextPath} onClick={addContextRef} type="button">
                    Add
                  </button>
                </div>
              </div>
              <div className="chat-composer-actions">
                <label className="chat-model-field">
                  <span>Model</span>
                  <select disabled={sending || !models.length} onChange={(event) => onModelChange(event.target.value)} value={selectedModelId}>
                    {models.length ? (
                      modelTierOrder.map((tier) => {
                        const tierModels = models
                          .filter((model) => model.tier === tier)
                          .sort((left, right) =>
                            (left.displayName || left.id).localeCompare(right.displayName || right.id, undefined, { sensitivity: "base" }),
                          );
                        if (!tierModels.length) return null;

                        return (
                          <optgroup key={tier} label={modelTierLabels[tier]}>
                            {tierModels.map((model) => (
                              <option key={model.id} value={model.id}>
                                {formatModelLabel(model)}
                              </option>
                            ))}
                          </optgroup>
                        );
                      })
                    ) : (
                      <option value="">No models loaded</option>
                    )}
                  </select>
                </label>
                {selectedModel ? <span className="chat-model-note">{modelTierLabels[selectedModel.tier]}</span> : null}
                <button disabled={sending || !messageDraft.trim() || !selectedModelId} type="submit">
                  {sending ? "Sending..." : "Send"}
                </button>
              </div>
            </div>
          </form>
        </section>
      </section>
    </div>
  );
}

function ChatMessageBubble({
  disabled,
  editDraft,
  isEditing,
  message,
  onCancelEdit,
  onEditDraftChange,
  onSaveEdit,
  onStartEdit,
}: {
  disabled: boolean;
  editDraft: string;
  isEditing: boolean;
  message: ChatMessage;
  onCancelEdit: () => void;
  onEditDraftChange: (value: string) => void;
  onSaveEdit: (message: ChatMessage) => void;
  onStartEdit: (message: ChatMessage) => void;
}) {
  const canEdit = message.role === "user";

  return (
    <article className={`chat-message chat-message-${message.role} chat-message-${message.status}`}>
      <header>
        <strong>{message.role === "assistant" ? "Agent" : message.role === "system" ? "System" : "You"}</strong>
        <div className="chat-message-actions">
          <span>{formatLocalDateTime(message.updatedAt ?? message.createdAt)}</span>
          {canEdit ? (
            <button
              className="chat-message-edit-button"
              disabled={disabled || isEditing}
              onClick={() => onStartEdit(message)}
              type="button"
            >
              Edit
            </button>
          ) : null}
        </div>
      </header>
      {isEditing ? (
        <form
          className="chat-message-edit-form"
          onSubmit={(event) => {
            event.preventDefault();
            onSaveEdit(message);
          }}
        >
          <textarea
            aria-label="Edit message"
            className="chat-message-edit-textarea"
            disabled={disabled}
            onChange={(event) => onEditDraftChange(event.currentTarget.value)}
            value={editDraft}
          />
          <div className="chat-message-edit-actions">
            <button disabled={disabled} onClick={onCancelEdit} type="button">
              Cancel
            </button>
            <button disabled={disabled || !editDraft.trim()} type="submit">
              {disabled ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      ) : (
        <div className="chat-message-content">{renderMessageContent(message.content)}</div>
      )}
      {message.context?.fileRefs?.length ? (
        <div className="chat-message-context">
          {message.context.fileRefs.map((ref) => (
            <code key={ref.path}>{ref.path}</code>
          ))}
        </div>
      ) : null}
      {message.status === "streaming" ? <span className="agent-event-status">Streaming</span> : null}
    </article>
  );
}
