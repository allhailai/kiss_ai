import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import type { ChatContextRef, ChatMessage, Conversation, ConversationSummary, ProjectFile } from "../../contracts/api";
import { api } from "../../data/apiClient";
import { errorMessage } from "../../domain/errors";
import { projectPathPrefixes } from "../../domain/projectPaths";
import { useConversationStream } from "./useConversationStream";

function isChatContextFile(file: ProjectFile) {
  return (
    /^human_[^/]+\.md$/i.test(file.path) ||
    file.path.startsWith(projectPathPrefixes.humanInput) ||
    file.path.startsWith(projectPathPrefixes.aiInput) ||
    file.path.startsWith(projectPathPrefixes.output)
  );
}

function isNearScrollBottom(element: HTMLElement) {
  return element.scrollHeight - element.scrollTop - element.clientHeight < 120;
}

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

  const cancelEditingMessage = () => {
    setEditingMessageId(null);
    setEditDraft("");
  };

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

  const addContextRef = (path = selectedContextPath) => {
    if (sending) return;
    const file = contextFiles.find((candidate) => candidate.path === path);
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

export type ProjectChatController = ReturnType<typeof useProjectChat>;
