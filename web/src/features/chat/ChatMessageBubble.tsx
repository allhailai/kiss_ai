import type { ChatMessage } from "../../contracts/api";
import { formatChatDateTime, renderMessageContent } from "./chatRendering";

export function ChatMessageBubble({
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

  return (
    <article className={`chat-message chat-message-${message.role} chat-message-${message.status}`}>
      <header>
        <strong>{message.role === "assistant" ? "Agent" : message.role === "system" ? "System" : "You"}</strong>
        <div className="chat-message-actions">
          <span>{formatChatDateTime(message.updatedAt ?? message.createdAt)}</span>
          {canEdit ? (
            <button
              className="chat-message-edit-button"
              disabled={disabled || isEditing}
              onClick={() => onStartEdit(message)}
              type="button"
            >
              Edit
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
      {message.context?.fileRefs?.length ? (
        <div className="chat-message-context">
          {message.context.fileRefs.map((ref) => (
            <code key={ref.path}>{ref.path}</code>
          ))}
        </div>
      ) : null}
      {message.status === "streaming" ? <span className="agent-event-status">Streaming</span> : null}
    </article>
  );
}
