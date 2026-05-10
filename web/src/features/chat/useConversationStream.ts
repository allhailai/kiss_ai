import { useEffect, type Dispatch, type SetStateAction } from "react";
import type { ChatConversationEvent, Conversation } from "../../contracts/api";
import { api } from "../../data/apiClient";

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

export function useConversationStream({
  conversationId,
  onConversationTruncated,
  onNotice,
  projectSlug,
  refreshConversations,
  setActiveConversation,
  setSending,
}: {
  conversationId: string | null | undefined;
  onConversationTruncated: () => void;
  onNotice: (message: string) => void;
  projectSlug: string | null | undefined;
  refreshConversations: () => Promise<unknown>;
  setActiveConversation: Dispatch<SetStateAction<Conversation | null>>;
  setSending: Dispatch<SetStateAction<boolean>>;
}) {
  useEffect(() => {
    if (!projectSlug || !conversationId || typeof EventSource === "undefined") return;

    const eventSource = new EventSource(api.conversationEventsUrl(projectSlug, conversationId));
    const handleEvent = (event: MessageEvent<string>) => {
      try {
        const payload = JSON.parse(event.data) as ChatConversationEvent;
        if (payload.type === "snapshot") {
          setActiveConversation((current) => {
            if (current?.id === payload.conversation.id && payload.conversation.messages.length < current.messages.length) {
              onConversationTruncated();
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
  }, [conversationId, onConversationTruncated, onNotice, projectSlug, refreshConversations, setActiveConversation, setSending]);
}
