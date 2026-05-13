import { useEffect, useRef, useState } from "react";
import type { ProjectChatController } from "./useProjectChat";
import type { View } from "../../navigation/views";
import { readAgentChatConversationId, writeAgentChatConversationId } from "../rightPanelSurfaceStorage";
import { panelForKind, type RightPanelState } from "./useRightPanelSurface";

const agentChatPanel = panelForKind("agent-chat");

type RightPanelSurfaceController = {
  closePanel: () => void;
  openPanel: (panel: NonNullable<RightPanelState>) => void;
  rightPanel: RightPanelState;
};

export function useAgentChatPanel({
  projectChat,
  projectSlug,
  rightPanelSurface,
  view,
}: {
  projectChat: ProjectChatController;
  projectSlug: string | null;
  rightPanelSurface: RightPanelSurfaceController;
  view: View;
}) {
  const [chatPanelDismissed, setChatPanelDismissed] = useState(false);
  const projectChatVisitKeyRef = useRef<string | null>(null);
  const mirroredConversationRef = useRef<{ projectSlug: string | null; conversationId: string | null }>({
    projectSlug: null,
    conversationId: null,
  });
  const isAgentPanelOpen = rightPanelSurface.rightPanel?.kind === agentChatPanel.kind;

  const openAgentChatPanel = () => {
    setChatPanelDismissed(false);
    rightPanelSurface.openPanel(agentChatPanel);
  };

  const selectProjectChatConversation = (conversationId: string) => {
    openAgentChatPanel();
    writeAgentChatConversationId(projectSlug, conversationId);
    void projectChat.openConversation(conversationId);
  };

  const toggleAgentPanel = () => {
    if (isAgentPanelOpen) {
      if (view === "chat") setChatPanelDismissed(true);
      rightPanelSurface.closePanel();
      return;
    }

    openAgentChatPanel();
  };

  const closeAgentPanel = () => {
    if (view === "chat" && rightPanelSurface.rightPanel) {
      setChatPanelDismissed(true);
    }
    rightPanelSurface.closePanel();
  };

  useEffect(() => {
    if (!projectSlug || view !== "chat") {
      projectChatVisitKeyRef.current = null;
      if (chatPanelDismissed) setChatPanelDismissed(false);
      return;
    }

    if (projectChatVisitKeyRef.current !== projectSlug) {
      projectChatVisitKeyRef.current = projectSlug;
      if (chatPanelDismissed) setChatPanelDismissed(false);
      openAgentChatPanel();
      return;
    }

    if (!chatPanelDismissed && !rightPanelSurface.rightPanel) {
      openAgentChatPanel();
    }
  }, [chatPanelDismissed, projectSlug, rightPanelSurface.rightPanel, view]);

  useEffect(() => {
    const conversationId = projectChat.activeConversation?.id ?? null;
    const previous = mirroredConversationRef.current;

    if (!projectSlug) {
      mirroredConversationRef.current = { projectSlug: null, conversationId: null };
      return;
    }

    if (previous.projectSlug !== projectSlug) {
      mirroredConversationRef.current = { projectSlug, conversationId: null };
      return;
    }

    if (conversationId) {
      writeAgentChatConversationId(projectSlug, conversationId);
    } else if (previous.conversationId) {
      writeAgentChatConversationId(projectSlug, null);
    }

    mirroredConversationRef.current = { projectSlug, conversationId };
  }, [projectSlug, projectChat.activeConversation?.id]);

  useEffect(() => {
    if (!isAgentPanelOpen || !projectSlug) return;

    const storedConversationId = readAgentChatConversationId(projectSlug);
    if (!storedConversationId || projectChat.activeConversation?.id === storedConversationId) return;

    void projectChat.openConversation(storedConversationId);
  }, [isAgentPanelOpen, projectSlug, projectChat.activeConversation?.id]);

  return {
    closeAgentPanel,
    isAgentPanelOpen,
    openAgentChatPanel,
    selectProjectChatConversation,
    toggleAgentPanel,
  };
}
