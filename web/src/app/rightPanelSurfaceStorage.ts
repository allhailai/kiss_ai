import type { RightPanelKind } from "./hooks/useRightPanelSurface";

const rightPanelKindStorageKey = "kiss_ai.rightPanelKind";
const agentChatConversationStorageKeyPrefix = "kiss_ai.agentChatConversationId:";

function isRightPanelKind(value: string | null): value is RightPanelKind {
  return value === "agent-chat";
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
    // Keep the in-memory panel state even if browser storage is unavailable.
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
    // Keep the in-memory conversation state even if browser storage is unavailable.
  }
}
