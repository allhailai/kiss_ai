import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type SetStateAction } from "react";
import type { AgentContextFile, ChatContextFile, ChatMessage, Conversation, ConversationSummary, ProjectFile } from "../../contracts/api";
import { api } from "../../data/apiClient";
import { errorMessage } from "../../domain/errors";
import { useConversationStream } from "./useConversationStream";

type ChatSendContext = {
  currentFile?: AgentContextFile;
  ai_editable_files?: AgentContextFile[];
  context_files?: ChatContextFile[];
};

type ChatSendOptions = {
  content?: string;
  context?: ChatSendContext;
};

type ConversationFileContextState = {
  ai_editable_files: AgentContextFile[];
  context_files: ChatContextFile[];
};

function emptyConversationFileContext(): ConversationFileContextState {
  return { ai_editable_files: [], context_files: [] };
}

function uniqueByPath<T extends { path: string }>(files: T[]) {
  const seen = new Set<string>();
  return files.filter((file) => {
    if (seen.has(file.path)) return false;
    seen.add(file.path);
    return true;
  });
}

function conversationFileContextFromConversation(conversation: Conversation | null): ConversationFileContextState {
  if (!conversation?.fileContext) return emptyConversationFileContext();
  return {
    ai_editable_files: uniqueByPath(conversation.fileContext.ai_editable_files ?? []),
    context_files: uniqueByPath(conversation.fileContext.context_files ?? []),
  };
}

function hasSelectedFileContext(fileContext: ConversationFileContextState) {
  return Boolean(fileContext.ai_editable_files.length || fileContext.context_files.length);
}

function isChatContextFile(file: ProjectFile) {
  return Boolean(file.chatContextReadable);
}

function isNearScrollBottom(element: HTMLElement) {
  return element.scrollHeight - element.scrollTop - element.clientHeight < 120;
}

function hasSettledAssistantReply(conversation: Conversation) {
  const latestMessage = conversation.messages.at(-1);
  return latestMessage?.role === "assistant" && latestMessage.status !== "streaming";
}

export function useProjectChat({
  preferredConversationId,
  projectSlug,
  selectedModelId,
  projectFiles,
  onNotice,
}: {
  preferredConversationId?: string | null;
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
  const [aiEditableFiles, setAiEditableFilesState] = useState<AgentContextFile[]>([]);
  const [contextFiles, setContextFilesState] = useState<ChatContextFile[]>([]);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const threadRef = useRef<HTMLDivElement | null>(null);
  const composerTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const shouldStickToLatestRef = useRef(true);
  const forceScrollToLatestRef = useRef(false);
  const fileContextRef = useRef<ConversationFileContextState>(emptyConversationFileContext());
  const availableContextFiles = useMemo(() => projectFiles.filter(isChatContextFile), [projectFiles]);
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

  const applyConversationFileContext = (fileContext: ConversationFileContextState) => {
    const next = {
      ai_editable_files: uniqueByPath(fileContext.ai_editable_files),
      context_files: uniqueByPath(fileContext.context_files),
    };
    fileContextRef.current = next;
    setAiEditableFilesState(next.ai_editable_files);
    setContextFilesState(next.context_files);
    return next;
  };

  const persistConversationFileContext = useCallback(
    async (conversationId: string, fileContext: ConversationFileContextState) => {
      if (!projectSlug) throw new Error("Select a project first.");
      const nextContext = {
        ai_editable_files: uniqueByPath(fileContext.ai_editable_files),
        context_files: uniqueByPath(fileContext.context_files),
      };
      const updated = await api.updateConversation(projectSlug, conversationId, { fileContext: nextContext });
      setActiveConversation(updated);
      await refreshConversations();
      return updated;
    },
    [projectSlug, refreshConversations],
  );

  const updateConversationFileContext = (updater: SetStateAction<ConversationFileContextState>) => {
    const next = applyConversationFileContext(typeof updater === "function" ? updater(fileContextRef.current) : updater);
    if (!projectSlug || !activeConversation) return;
    void persistConversationFileContext(activeConversation.id, next).catch((error) => {
      onNotice(errorMessage(error, "Could not save the conversation file context."));
    });
  };

  const setAiEditableFiles = (updater: SetStateAction<AgentContextFile[]>) => {
    updateConversationFileContext((current) => ({
      ...current,
      ai_editable_files: typeof updater === "function" ? updater(current.ai_editable_files) : updater,
    }));
  };

  const setContextFiles = (updater: SetStateAction<ChatContextFile[]>) => {
    updateConversationFileContext((current) => ({
      ...current,
      context_files: typeof updater === "function" ? updater(current.context_files) : updater,
    }));
  };

  const cancelEditingMessage = () => {
    setEditingMessageId(null);
    setEditDraft("");
  };

  const openConversation = async (conversationId: string) => {
    if (!projectSlug) return;
    setLoading(true);
    onNotice("");
    try {
      const conversation = await api.conversation(projectSlug, conversationId);
      setActiveConversation(conversation);
      applyConversationFileContext(conversationFileContextFromConversation(conversation));
      cancelEditingMessage();
      if (hasSettledAssistantReply(conversation)) setSending(false);
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
      applyConversationFileContext(conversationFileContextFromConversation(conversation));
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
    return conversation;
  };

  const startDraftConversation = () => {
    if (sending) return;
    setActiveConversation(null);
    setMessageDraft("");
    applyConversationFileContext(emptyConversationFileContext());
    setShowJumpToLatest(false);
    forceScrollToLatestRef.current = true;
    shouldStickToLatestRef.current = true;
    cancelEditingMessage();
    onNotice("");
    composerTextareaRef.current?.focus();
  };

  const sendMessage = async (options: ChatSendOptions = {}) => {
    if (!projectSlug) return false;
    const content = (options.content ?? messageDraft).trim();
    if (!content || sending) return false;
    const currentFileContext = fileContextRef.current;
    const context = options.context ?? (currentFileContext.context_files.length ? { context_files: currentFileContext.context_files } : undefined);

    setSending(true);
    onNotice("");
    try {
      let conversation = await ensureConversation();
      if (hasSelectedFileContext(currentFileContext)) {
        conversation = await persistConversationFileContext(conversation.id, currentFileContext);
      }
      if (options.content === undefined) setMessageDraft("");
      const next = await api.sendChatMessage(projectSlug, conversation.id, {
        modelId: selectedModelId,
        content,
        context,
      });
      setActiveConversation(next);
      if (hasSettledAssistantReply(next)) setSending(false);
      await refreshConversations();
      return true;
    } catch (error) {
      onNotice(errorMessage(error, "Could not send the chat message."));
      setSending(false);
      return false;
    }
  };

  const startEditingMessage = (message: ChatMessage) => {
    if (sending || message.role !== "user") return;
    setEditingMessageId(message.id);
    setEditDraft(message.content);
    onNotice("");
  };

  const saveEditedMessage = async (message: ChatMessage) => {
    const content = editDraft.trim();
    if (!projectSlug || !activeConversation || !content || sending || message.role !== "user") return;

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
      if (hasSettledAssistantReply(next)) setSending(false);
      setEditingMessageId(null);
      setEditDraft("");
      await refreshConversations();
      setSending(false);
    } catch (error) {
      onNotice(errorMessage(error, "Could not edit the chat message."));
      setSending(false);
    }
  };

  const handleComposerChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setMessageDraft(event.currentTarget.value);
  };

  const addContextFile = (path: string) => {
    if (sending) return;
    const file = availableContextFiles.find((candidate) => candidate.path === path);
    if (!file || contextFiles.some((ref) => ref.path === file.path)) return;
    setContextFiles((current) => [...current, { path: file.path, label: file.name, kind: file.kind }]);
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
      applyConversationFileContext(emptyConversationFileContext());
      cancelEditingMessage();
      setLoading(false);
      setSending(false);
      return;
    }

    setActiveConversation(null);
    setConversations([]);
    applyConversationFileContext(emptyConversationFileContext());
    cancelEditingMessage();
    void (async () => {
      setLoading(true);
      try {
        const nextConversations = await refreshConversations();
        const conversationId = preferredConversationId ?? nextConversations[0]?.id;
        if (conversationId) {
          try {
            const conversation = await api.conversation(projectSlug, conversationId);
            setActiveConversation(conversation);
            applyConversationFileContext(conversationFileContextFromConversation(conversation));
            if (hasSettledAssistantReply(conversation)) setSending(false);
          } catch {
            if (conversationId !== nextConversations[0]?.id && nextConversations[0]) {
              const conversation = await api.conversation(projectSlug, nextConversations[0].id);
              setActiveConversation(conversation);
              applyConversationFileContext(conversationFileContextFromConversation(conversation));
              if (hasSettledAssistantReply(conversation)) setSending(false);
            }
          }
        }
      } catch (error) {
        onNotice(errorMessage(error, "Could not load conversations."));
      } finally {
        setLoading(false);
      }
    })();
  }, [onNotice, preferredConversationId, projectSlug, refreshConversations]);

  useConversationStream({
    conversationId: activeConversation?.id,
    onConversationTruncated: handleConversationTruncated,
    onNotice,
    projectSlug,
    refreshConversations,
    sending,
    setActiveConversation,
    setSending,
  });

  useEffect(() => {
    if (!activeConversation) return;
    applyConversationFileContext(conversationFileContextFromConversation(activeConversation));
  }, [activeConversation?.id, activeConversation?.fileContext]);

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
    addContextFile,
    aiEditableFiles,
    cancelEditingMessage,
    availableContextFiles,
    contextFiles,
    selectedContextFiles: contextFiles,
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
    sending,
    setAiEditableFiles,
    setContextFiles,
    setSelectedContextFiles: setContextFiles,
    setConversationFilter,
    setEditDraft,
    showJumpToLatest,
    startDraftConversation,
    startEditingMessage,
    threadRef,
    composerTextareaRef,
    sendMessage,
  };
}

export type ProjectChatController = ReturnType<typeof useProjectChat>;
