import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { ChatConversationEvent, Conversation } from "../../contracts/api";
import { api } from "../../data/apiClient";
import { hasSettledAssistantReply } from "../../domain/conversation";

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
  onAgentComplete,
  onConversationTruncated,
  onNotice,
  projectSlug,
  refreshConversations,
  sending,
  setActiveConversation,
  setSending,
}: {
  conversationId: string | null | undefined;
  onAgentComplete?: () => void;
  onConversationTruncated: () => void;
  onNotice: (message: string) => void;
  projectSlug: string | null | undefined;
  refreshConversations: () => Promise<unknown>;
  sending: boolean;
  setActiveConversation: Dispatch<SetStateAction<Conversation | null>>;
  setSending: Dispatch<SetStateAction<boolean>>;
}) {
  const pendingDeltasRef = useRef<Array<Extract<ChatConversationEvent, { type: "message_delta" }>>>([]);
  const deltaFrameRef = useRef<number | null>(null);
  const onAgentCompleteRef = useRef(onAgentComplete);
  const onConversationTruncatedRef = useRef(onConversationTruncated);
  const onNoticeRef = useRef(onNotice);
  const refreshConversationsRef = useRef(refreshConversations);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);

  useEffect(() => {
    onAgentCompleteRef.current = onAgentComplete;
    onConversationTruncatedRef.current = onConversationTruncated;
    onNoticeRef.current = onNotice;
    refreshConversationsRef.current = refreshConversations;
  }, [onAgentComplete, onConversationTruncated, onNotice, refreshConversations]);

  useEffect(() => {
    if (!projectSlug || !conversationId) return;
    if (typeof EventSource !== "undefined") return;

    let closed = false;
    let pollTimeoutId: number | null = null;
    const pollConversation = async () => {
      try {
        const conversation = await api.conversation(projectSlug, conversationId);
        if (closed) return;

        setActiveConversation(conversation);
        void refreshConversationsRef.current();

        const settled = hasSettledAssistantReply(conversation);
        if (settled) {
          setSending(false);
        }
        return settled;
      } catch {
        // Reconnect remains the primary recovery path.
        return false;
      }
    };

    if (!sending) return;

    let pollAttempts = 0;
    const pollDelayMs = 3000;
    const maxPollAttempts = 20;
    const pollUntilSettled = () => {
      pollTimeoutId = window.setTimeout(() => {
        void (async () => {
          const settled = await pollConversation();
          if (closed || settled) return;

          pollAttempts += 1;
          if (pollAttempts >= maxPollAttempts) {
            setSending(false);
            onNoticeRef.current("Live chat updates are unavailable. The latest saved conversation was refreshed.");
            return;
          }

          pollUntilSettled();
        })();
      }, pollDelayMs);
    };

    pollUntilSettled();
    return () => {
      closed = true;
      if (pollTimeoutId !== null) window.clearTimeout(pollTimeoutId);
    };
  }, [conversationId, projectSlug, sending, setActiveConversation, setSending]);

  useEffect(() => {
    if (!projectSlug || !conversationId) return;
    if (typeof EventSource === "undefined") return;

    let closed = false;
    let reconnectTimeoutId: number | null = null;
    let pollTimeoutId: number | null = null;
    const pollConversation = async () => {
      try {
        const conversation = await api.conversation(projectSlug, conversationId);
        if (closed) return;

        setActiveConversation(conversation);
        void refreshConversationsRef.current();

        const settled = hasSettledAssistantReply(conversation);
        if (settled) {
          setSending(false);
        }
        return settled;
      } catch {
        // Reconnect remains the primary recovery path.
        return false;
      }
    };

    const eventSource = api.openConversationEventSource(projectSlug, conversationId);
    const flushDeltas = () => {
      deltaFrameRef.current = null;
      const deltas = pendingDeltasRef.current;
      pendingDeltasRef.current = [];
      if (!deltas.length) return;

      setActiveConversation((current) => {
        let next = current;
        for (const payload of deltas) {
          next =
            next && next.id === payload.conversationId
              ? applyStreamingDelta(next, payload.messageId, payload.delta, payload.updatedAt)
              : next;
        }
        return next;
      });
    };

    const handleEvent = (event: MessageEvent<string>) => {
      try {
        const payload = JSON.parse(event.data) as ChatConversationEvent;
        if (payload.type === "snapshot") {
          setReconnectAttempt(0);
          pendingDeltasRef.current = [];
          setActiveConversation((current) => {
            if (current?.id === payload.conversation.id && payload.conversation.messages.length < current.messages.length) {
              onConversationTruncatedRef.current();
            }
            return payload.conversation;
          });
          void refreshConversationsRef.current();
        } else if (payload.type === "message_delta") {
          pendingDeltasRef.current.push(payload);
          if (deltaFrameRef.current === null) {
            deltaFrameRef.current = window.requestAnimationFrame(flushDeltas);
          }
        } else if (payload.type === "message_complete") {
          setReconnectAttempt(0);
          flushDeltas();
          setActiveConversation(payload.conversation);
          setSending(false);
          void refreshConversationsRef.current();
          // Trigger file refresh — the agent may have edited files
          onAgentCompleteRef.current?.();
        } else if (payload.type === "error") {
          onNoticeRef.current(payload.message);
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
      if (closed) return;

      void pollConversation();
      const nextAttempt = reconnectAttempt + 1;
      const reconnectDelayMs = Math.min(1000 * 2 ** reconnectAttempt, 10000);
      reconnectTimeoutId = window.setTimeout(() => setReconnectAttempt(nextAttempt), reconnectDelayMs);

      if (nextAttempt >= 5) {
        pollTimeoutId = window.setTimeout(() => {
          void pollConversation().finally(() => setSending(false));
          onNoticeRef.current("Live chat updates disconnected. The latest saved conversation was refreshed.");
        }, 15000);
      }
    };

    return () => {
      closed = true;
      eventSource.close();
      if (reconnectTimeoutId !== null) window.clearTimeout(reconnectTimeoutId);
      if (pollTimeoutId !== null) window.clearTimeout(pollTimeoutId);
      pendingDeltasRef.current = [];
      if (deltaFrameRef.current !== null) {
        window.cancelAnimationFrame(deltaFrameRef.current);
        deltaFrameRef.current = null;
      }
    };
  }, [conversationId, projectSlug, reconnectAttempt, setActiveConversation, setSending]);
}
