import { useCallback, useEffect, useMemo, useRef, useState, type SetStateAction } from "react";
import type { AgentContextFile, ChatContextFile, Conversation, ConversationSummary, ProjectFile } from "../../contracts/api";
import { api } from "../../data/apiClient";
import { errorMessage } from "../../domain/errors";
import { uniqueByPathPreserveFirst } from "../../domain/files";

type ConversationFileContextState = {
  ai_editable_files: AgentContextFile[];
  context_files: ChatContextFile[];
};

function emptyConversationFileContext(): ConversationFileContextState {
  return { ai_editable_files: [], context_files: [] };
}

export function conversationFileContextFromConversation(conversation: Conversation | null): ConversationFileContextState {
  if (!conversation?.fileContext) return emptyConversationFileContext();
  return {
    ai_editable_files: uniqueByPathPreserveFirst(conversation.fileContext.ai_editable_files ?? []),
    context_files: uniqueByPathPreserveFirst(conversation.fileContext.context_files ?? []),
  };
}

export function hasSelectedFileContext(fileContext: ConversationFileContextState) {
  return Boolean(fileContext.ai_editable_files.length || fileContext.context_files.length);
}

function isChatContextFile(file: ProjectFile) {
  return Boolean(file.chatContextReadable);
}

export function useProjectChatFileContext({
  activeConversation,
  onNotice,
  projectFiles,
  projectSlug,
  refreshConversations,
  sending,
  setActiveConversation,
}: {
  activeConversation: Conversation | null;
  onNotice: (message: string) => void;
  projectFiles: ProjectFile[];
  projectSlug: string | null;
  refreshConversations: () => Promise<ConversationSummary[]>;
  sending: boolean;
  setActiveConversation: (conversation: Conversation | null) => void;
}) {
  const [aiEditableFiles, setAiEditableFilesState] = useState<AgentContextFile[]>([]);
  const [contextFiles, setContextFilesState] = useState<ChatContextFile[]>([]);
  const fileContextRef = useRef<ConversationFileContextState>(emptyConversationFileContext());
  const contextPersistTimeoutRef = useRef<number | null>(null);
  const pendingContextPersistRef = useRef<{ conversationId: string; fileContext: ConversationFileContextState } | null>(null);
  const availableContextFiles = useMemo(() => projectFiles.filter(isChatContextFile), [projectFiles]);

  const applyConversationFileContext = (fileContext: ConversationFileContextState) => {
    const next = {
      ai_editable_files: uniqueByPathPreserveFirst(fileContext.ai_editable_files),
      context_files: uniqueByPathPreserveFirst(fileContext.context_files),
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
        ai_editable_files: uniqueByPathPreserveFirst(fileContext.ai_editable_files),
        context_files: uniqueByPathPreserveFirst(fileContext.context_files),
      };
      const updated = await api.updateConversation(projectSlug, conversationId, { fileContext: nextContext });
      setActiveConversation(updated);
      await refreshConversations();
      return updated;
    },
    [projectSlug, refreshConversations, setActiveConversation],
  );

  const clearPendingConversationFileContext = () => {
    if (contextPersistTimeoutRef.current !== null) {
      window.clearTimeout(contextPersistTimeoutRef.current);
      contextPersistTimeoutRef.current = null;
    }
    pendingContextPersistRef.current = null;
  };

  useEffect(() => clearPendingConversationFileContext, []);

  const updateConversationFileContext = (updater: SetStateAction<ConversationFileContextState>) => {
    const next = applyConversationFileContext(typeof updater === "function" ? updater(fileContextRef.current) : updater);
    if (!projectSlug || !activeConversation) return;
    pendingContextPersistRef.current = { conversationId: activeConversation.id, fileContext: next };
    if (contextPersistTimeoutRef.current !== null) window.clearTimeout(contextPersistTimeoutRef.current);
    contextPersistTimeoutRef.current = window.setTimeout(() => {
      const pending = pendingContextPersistRef.current;
      pendingContextPersistRef.current = null;
      contextPersistTimeoutRef.current = null;
      if (!pending) return;

      void persistConversationFileContext(pending.conversationId, pending.fileContext).catch((error) => {
        onNotice(errorMessage(error, "Could not save the conversation file context."));
      });
    }, 400);
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

  const addContextFile = (path: string) => {
    if (sending) return;
    const file = availableContextFiles.find((candidate) => candidate.path === path);
    if (!file || contextFiles.some((ref) => ref.path === file.path)) return;
    setContextFiles((current) => [...current, { path: file.path, label: file.name, kind: file.kind }]);
  };

  // Sync file context when activeConversation changes
  useEffect(() => {
    if (!activeConversation) return;
    applyConversationFileContext(conversationFileContextFromConversation(activeConversation));
  }, [activeConversation?.id, activeConversation?.fileContext]);

  return {
    addContextFile,
    aiEditableFiles,
    applyConversationFileContext,
    availableContextFiles,
    clearPendingConversationFileContext,
    contextFiles,
    fileContextRef,
    hasSelectedFileContext,
    persistConversationFileContext,
    setAiEditableFiles,
    setContextFiles,
  };
}

export type { ConversationFileContextState };
