import type { RefObject } from "react";
import type { ChatMessage } from "../../contracts/api";
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
  onJumpToLatest,
  onSaveEdit = () => undefined,
  onScroll,
  onStartEdit = () => undefined,
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
  onJumpToLatest?: () => void;
  onSaveEdit?: (message: ChatMessage) => void;
  onScroll?: () => void;
  onStartEdit?: (message: ChatMessage) => void;
  showJumpToLatest?: boolean;
  threadRef?: RefObject<HTMLDivElement | null>;
}) {
  return (
    <div className="chat-thread-shell">
      <div className="chat-thread" aria-live="polite" onScroll={onScroll} ref={threadRef}>
        {messages.length ? (
          messages.map((message) => (
            <ChatMessageBubble
              disabled={disabled}
              editDraft={editDraft}
              editable={editable}
              isEditing={editingMessageId === message.id}
              key={message.id}
              message={message}
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
      </div>
      {showJumpToLatest && onJumpToLatest ? (
        <button className="chat-jump-latest" onClick={onJumpToLatest} type="button">
          Jump to latest
        </button>
      ) : null}
    </div>
  );
}
