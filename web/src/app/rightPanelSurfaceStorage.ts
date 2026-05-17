import type { RightPanelKind } from "./hooks/useRightPanelSurface";

const rightPanelKindStorageKey = "kiss_ai.rightPanelKind";
const agentChatConversationStorageKeyPrefix = "kiss_ai.agentChatConversationId:";

function isRightPanelKind(value: string | null): value is RightPanelKind {
  return value === "agent-chat" || value === "build-project";
}

function agentChatConversationStorageKey(projectSlug: string) {
  return `${agentChatConversationStorageKeyPrefix}${projectSlug}`;
}

export function readRightPanelKind() {
  if (typeof window === "undefined") return null;

  try {
    const value = window.sessionStorage.getItem(rightPanelKindStorageKey);
    return isRightPanelKind(value) ? value : null;
  } catch {
    return null;
  }
}

export function writeRightPanelKind(kind: RightPanelKind | null) {
  if (typeof window === "undefined") return;

  try {
    if (kind) {
      window.sessionStorage.setItem(rightPanelKindStorageKey, kind);
    } else {
      window.sessionStorage.removeItem(rightPanelKindStorageKey);
    }
  } catch {
    // Ignore storage failures; the caller-owned panel state is already updated.
  }
}

export function readAgentChatConversationId(projectSlug: string | null) {
  if (!projectSlug || typeof window === "undefined") return null;

  try {
    return window.sessionStorage.getItem(agentChatConversationStorageKey(projectSlug));
  } catch {
    return null;
  }
}

export function writeAgentChatConversationId(projectSlug: string | null, conversationId: string | null) {
  if (!projectSlug || typeof window === "undefined") return;

  try {
    if (conversationId) {
      window.sessionStorage.setItem(agentChatConversationStorageKey(projectSlug), conversationId);
    } else {
      window.sessionStorage.removeItem(agentChatConversationStorageKey(projectSlug));
    }
  } catch {
    // Ignore storage failures; the caller-owned conversation state is already updated.
  }
}
