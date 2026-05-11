import { useEffect, useRef, type RefObject } from "react";
import type { ChatMessage, ChatMessageFileEdit } from "../../contracts/api";
import { ChatMessageBubble } from "./ChatMessageBubble";

export function ChatThread({
  disabled,
  editDraft = "",
  editable = true,
  editingMessageId = null,
  emptyTitle,
  emptyDescription,
  messages,
  onCancelEdit = () => undefined,
  onEditDraftChange = () => undefined,
  onApplyFileEdit,
  onJumpToLatest,
  onSaveEdit = () => undefined,
  onScroll,
  onStartEdit = () => undefined,
  scrollToMessageId = null,
  showThinking = false,
  showJumpToLatest = false,
  threadRef,
}: {
  disabled: boolean;
  editDraft?: string;
  editable?: boolean;
  editingMessageId?: string | null;
  emptyTitle: string;
  emptyDescription: string;
  messages: ChatMessage[];
  onCancelEdit?: () => void;
  onEditDraftChange?: (value: string) => void;
  onApplyFileEdit?: (edit: ChatMessageFileEdit) => void | Promise<void>;
  onJumpToLatest?: () => void;
  onSaveEdit?: (message: ChatMessage) => void;
  onScroll?: () => void;
  onStartEdit?: (message: ChatMessage) => void;
  scrollToMessageId?: string | null;
  showThinking?: boolean;
  showJumpToLatest?: boolean;
  threadRef?: RefObject<HTMLDivElement | null>;
}) {
  const internalThreadRef = useRef<HTMLDivElement | null>(null);
  const resolvedThreadRef = threadRef ?? internalThreadRef;

  useEffect(() => {
    const thread = resolvedThreadRef.current;
    if (!thread || !scrollToMessageId) return;
    const target = thread.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(scrollToMessageId)}"]`);
    target?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [resolvedThreadRef, scrollToMessageId]);

  useEffect(() => {
    const thread = resolvedThreadRef.current;
    if (!thread || !showThinking) return;
    window.requestAnimationFrame(() => {
      thread.scrollTo({ top: thread.scrollHeight, behavior: "smooth" });
    });
  }, [resolvedThreadRef, showThinking]);

  return (
    <div className="chat-thread-shell">
      <div className="chat-thread" aria-live="polite" onScroll={onScroll} ref={resolvedThreadRef}>
        {messages.length ? (
          messages.map((message) => (
            <ChatMessageBubble
              disabled={disabled}
              editDraft={editDraft}
              editable={editable}
              isEditing={editingMessageId === message.id}
              key={message.id}
              message={message}
              onApplyFileEdit={onApplyFileEdit}
              onCancelEdit={onCancelEdit}
              onEditDraftChange={onEditDraftChange}
              onSaveEdit={onSaveEdit}
              onStartEdit={onStartEdit}
            />
          ))
        ) : (
          <div className="chat-thread-empty">
            <h3>{emptyTitle}</h3>
            <p>{emptyDescription}</p>
          </div>
        )}
        {showThinking ? (
          <article className="chat-message chat-message-assistant chat-message-thinking" aria-label="AI is thinking">
            <header>
              <strong>Agent</strong>
            </header>
            <div className="chat-thinking-indicator" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
          </article>
        ) : null}
      </div>
      {showJumpToLatest && onJumpToLatest ? (
        <button className="chat-jump-latest" onClick={onJumpToLatest} type="button">
          Jump to latest
        </button>
      ) : null}
    </div>
  );
}
