import { memo } from "react";
import type { ChatMessage } from "../../contracts/api";
import { formatChatDateTime, renderMessageContent } from "./chatRendering";

function ChatMessageBubbleComponent({
  disabled,
  editDraft,
  editable = true,
  isEditing,
  message,
  onCancelEdit,
  onEditDraftChange,
  onSaveEdit,
  onStartEdit,
}: {
  disabled: boolean;
  editDraft: string;
  editable?: boolean;
  isEditing: boolean;
  message: ChatMessage;
  onCancelEdit: () => void;
  onEditDraftChange: (value: string) => void;
  onSaveEdit: (message: ChatMessage) => void;
  onStartEdit: (message: ChatMessage) => void;
}) {
  const canEdit = editable && message.role === "user";
  const contextPaths = [
    ...new Set([
      ...(message.context?.activeFiles ?? []).map((file) => file.path),
      ...(message.context?.fileRefs ?? []).map((ref) => ref.path),
    ]),
  ];

  return (
    <article className={`chat-message chat-message-${message.role} chat-message-${message.status}`}>
      <header>
        <strong>{message.role === "assistant" ? "Agent" : message.role === "system" ? "System" : "You"}</strong>
        <div className="chat-message-actions">
          <span>{formatChatDateTime(message.updatedAt ?? message.createdAt)}</span>
          {canEdit ? (
            <button
              aria-label="Edit message"
              className="chat-message-edit-button"
              disabled={disabled || isEditing}
              onClick={() => onStartEdit(message)}
              title="Edit message"
              type="button"
            >
              <svg aria-hidden="true" viewBox="0 0 16 16">
                <path d="M11.9 1.7a1.5 1.5 0 0 1 2.1 2.1l-8.6 8.6-2.8.7.7-2.8 8.6-8.6Zm-1 2.1 1.3 1.3 1.1-1.1a.5.5 0 0 0-.7-.7l-1.7.5ZM4.2 10.8l-.3 1 1-.3 6.5-6.5-1.2-1.2-6 7Z" />
              </svg>
            </button>
          ) : null}
        </div>
      </header>
      {isEditing ? (
        <form
          className="chat-message-edit-form"
          onSubmit={(event) => {
            event.preventDefault();
            onSaveEdit(message);
          }}
        >
          <textarea
            aria-label="Edit message"
            className="chat-message-edit-textarea"
            disabled={disabled}
            onChange={(event) => onEditDraftChange(event.currentTarget.value)}
            value={editDraft}
          />
          <div className="chat-message-edit-actions">
            <button disabled={disabled} onClick={onCancelEdit} type="button">
              Cancel
            </button>
            <button disabled={disabled || !editDraft.trim()} type="submit">
              {disabled ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      ) : (
        <div className="chat-message-content">{renderMessageContent(message.content)}</div>
      )}
      {contextPaths.length ? (
        <div className="chat-message-context">
          {contextPaths.map((contextPath) => (
            <code key={contextPath}>{contextPath}</code>
          ))}
        </div>
      ) : null}
      {message.status === "streaming" ? <span className="agent-event-status">Streaming</span> : null}
    </article>
  );
}

export const ChatMessageBubble = memo(ChatMessageBubbleComponent);
