import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from "react";
import type { AgentContextFile, ChatContextFile, ChatMessage, Conversation, ConversationSummary, ProjectFile } from "../../contracts/api";
import { api } from "../../data/apiClient";
import { hasSettledAssistantReply } from "../../domain/conversation";
import { errorMessage } from "../../domain/errors";
import { useConversationStream } from "./useConversationStream";
import { useProjectChatScroll } from "./useProjectChatScroll";
import { useProjectChatFileContext, conversationFileContextFromConversation, type ConversationFileContextState } from "./useProjectChatFileContext";

type ChatSendContext = {
  currentFile?: AgentContextFile;
  ai_editable_files?: AgentContextFile[];
  context_files?: ChatContextFile[];
};

type ChatSendOptions = {
  content?: string;
  context?: ChatSendContext;
};

function emptyConversationFileContext(): ConversationFileContextState {
  return { ai_editable_files: [], context_files: [] };
}

export function useProjectChat({
  preferredConversationId,
  projectSlug,
  selectedModelId,
  projectFiles,
  onAgentComplete,
  onNotice,
  onProposalApplied,
}: {
  preferredConversationId?: string | null;
  projectSlug: string | null;
  selectedModelId: string;
  projectFiles: ProjectFile[];
  onAgentComplete?: () => void;
  onNotice: (message: string) => void;
  onProposalApplied?: () => Promise<void> | void;
}) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [conversationFilter, setConversationFilter] = useState("");
  const [messageDraft, setMessageDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [proposalUpdating, setProposalUpdating] = useState(false);

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

  // --- Sub-hooks ---

  const scroll = useProjectChatScroll(activeConversation);

  const fileContext = useProjectChatFileContext({
    activeConversation,
    onNotice,
    projectFiles,
    projectSlug,
    refreshConversations,
    sending,
    setActiveConversation,
  });

  // --- Conversation lifecycle ---

  const handleConversationTruncated = useCallback(() => {
    scroll.forceScrollToLatestRef.current = true;
    scroll.shouldStickToLatestRef.current = true;
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
      fileContext.clearPendingConversationFileContext();
      const conversation = await api.conversation(projectSlug, conversationId);
      setActiveConversation(conversation);
      fileContext.applyConversationFileContext(conversationFileContextFromConversation(conversation));
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
      fileContext.clearPendingConversationFileContext();
      const conversation = await api.createConversation(projectSlug, { modelId: selectedModelId });
      setActiveConversation(conversation);
      fileContext.applyConversationFileContext(conversationFileContextFromConversation(conversation));
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

  const startDraftConversation = (initialFileContext: ConversationFileContextState = emptyConversationFileContext()) => {
    if (loading || sending || proposalUpdating) return;
    fileContext.clearPendingConversationFileContext();
    setActiveConversation(null);
    setMessageDraft("");
    fileContext.applyConversationFileContext(initialFileContext);
    scroll.setShowJumpToLatest(false);
    scroll.forceScrollToLatestRef.current = true;
    scroll.shouldStickToLatestRef.current = true;
    cancelEditingMessage();
    onNotice("");
    scroll.composerTextareaRef.current?.focus();
  };

  // --- Messaging ---

  const sendMessage = async (options: ChatSendOptions = {}) => {
    if (!projectSlug) return false;
    const content = (options.content ?? messageDraft).trim();
    if (!content || sending) return false;
    const currentFileContext = fileContext.fileContextRef.current;
    const context = options.context ?? (currentFileContext.context_files.length ? { context_files: currentFileContext.context_files } : undefined);

    setSending(true);
    onNotice("");
    try {
      let conversation = await ensureConversation();
      if (fileContext.hasSelectedFileContext(currentFileContext)) {
        fileContext.clearPendingConversationFileContext();
        conversation = await fileContext.persistConversationFileContext(conversation.id, currentFileContext);
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
      scroll.forceScrollToLatestRef.current = true;
      scroll.shouldStickToLatestRef.current = true;
      setActiveConversation(next);
      setEditingMessageId(null);
      setEditDraft("");
      await refreshConversations();
    } catch (error) {
      onNotice(errorMessage(error, "Could not edit the chat message."));
    } finally {
      setSending(false);
    }
  };

  const handleComposerChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setMessageDraft(event.currentTarget.value);
  };

  // --- Edit proposals ---

  const generateEditProposal = async (proposalFileContext: ConversationFileContextState, content = "") => {
    if (!projectSlug || loading || sending || proposalUpdating) return false;
    setSending(true);
    onNotice("");
    try {
      let conversation = await ensureConversation();
      const nextContext = fileContext.applyConversationFileContext(proposalFileContext);
      fileContext.clearPendingConversationFileContext();
      conversation = await fileContext.persistConversationFileContext(conversation.id, nextContext);
      const next = await api.generateEditProposal(projectSlug, conversation.id, {
        modelId: selectedModelId,
        content: content.trim() || undefined,
        fileContext: nextContext,
      });
      setActiveConversation(next);
      await refreshConversations();
      const latestProposal = next.editProposals.at(-1);
      if (latestProposal?.notice) onNotice(latestProposal.notice);
      return true;
    } catch (error) {
      onNotice(errorMessage(error, "Could not generate proposed changes."));
      return false;
    } finally {
      setSending(false);
    }
  };

  const updateEditProposal = async (proposalId: string, conceptualDiffs: Array<{ id: string; status: "accepted" | "rejected" }>) => {
    if (!projectSlug || !activeConversation || loading || sending || proposalUpdating) return false;
    setProposalUpdating(true);
    onNotice("");
    try {
      const next = await api.updateEditProposal(projectSlug, activeConversation.id, proposalId, { conceptualDiffs });
      setActiveConversation(next);
      await refreshConversations();
      return true;
    } catch (error) {
      onNotice(errorMessage(error, "Could not update the proposed changes."));
      return false;
    } finally {
      setProposalUpdating(false);
    }
  };

  const applyEditProposal = async (proposalId: string) => {
    if (!projectSlug || !activeConversation || loading || sending || proposalUpdating) return false;
    setSending(true);
    onNotice("");
    try {
      const next = await api.applyEditProposal(projectSlug, activeConversation.id, proposalId, {
        modelId: selectedModelId,
      });
      setActiveConversation(next);
      await refreshConversations();
      await onProposalApplied?.();
      const proposal = next.editProposals.find((candidate) => candidate.id === proposalId);
      onNotice(proposal?.notice || "Applied the proposal.");
      return true;
    } catch (error) {
      onNotice(errorMessage(error, "Could not apply the proposal."));
      return false;
    } finally {
      setSending(false);
    }
  };

  const cancelAgent = async () => {
    if (!projectSlug) return;
    try {
      await api.cancelChatAgent(projectSlug);
    } catch {
      // Cancellation is best-effort
    }
    setSending(false);
  };

  // --- Project/conversation initialization ---

  useEffect(() => {
    if (!projectSlug) {
      setActiveConversation(null);
      setConversations([]);
      fileContext.applyConversationFileContext(emptyConversationFileContext());
      cancelEditingMessage();
      setLoading(false);
      setSending(false);
      return;
    }

    setActiveConversation(null);
    setConversations([]);
    fileContext.applyConversationFileContext(emptyConversationFileContext());
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
            fileContext.applyConversationFileContext(conversationFileContextFromConversation(conversation));
            if (hasSettledAssistantReply(conversation)) setSending(false);
          } catch {
            if (conversationId !== nextConversations[0]?.id && nextConversations[0]) {
              const conversation = await api.conversation(projectSlug, nextConversations[0].id);
              setActiveConversation(conversation);
              fileContext.applyConversationFileContext(conversationFileContextFromConversation(conversation));
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
    onAgentComplete,
    onConversationTruncated: handleConversationTruncated,
    onNotice,
    projectSlug,
    refreshConversations,
    sending,
    setActiveConversation,
    setSending,
  });

  return {
    activeConversation,
    addContextFile: fileContext.addContextFile,
    aiEditableFiles: fileContext.aiEditableFiles,
    cancelAgent,
    cancelEditingMessage,
    availableContextFiles: fileContext.availableContextFiles,
    contextFiles: fileContext.contextFiles,
    conversationFilter,
    conversations,
    createConversation,
    editDraft,
    editingMessageId,
    filteredConversations,
    handleComposerChange,
    handleThreadScroll: scroll.handleThreadScroll,
    generateEditProposal,
    loading,
    messageDraft,
    setMessageDraft,
    openConversation,
    saveEditedMessage,
    scrollToLatest: scroll.scrollToLatest,
    sending,
    proposalUpdating,
    setActiveConversation,
    setAiEditableFiles: fileContext.setAiEditableFiles,
    setContextFiles: fileContext.setContextFiles,
    setConversationFilter,
    setEditDraft,
    showJumpToLatest: scroll.showJumpToLatest,
    startDraftConversation,
    startEditingMessage,
    threadRef: scroll.threadRef,
    composerTextareaRef: scroll.composerTextareaRef,
    sendMessage,
    applyEditProposal,
    updateEditProposal,
  };
}

export type ProjectChatController = ReturnType<typeof useProjectChat>;
