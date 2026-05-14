import { memo, useState } from "react";
import type { ChatMessage, ChatMessageFileEdit, EditProposal } from "../../contracts/api";
import { formatChatDateTime, renderMarkdownMessageContent } from "./chatRendering";

function linkedProposalLabel(proposal: EditProposal) {
  const count = proposal.conceptualDiffs.length;
  const plural = count === 1 ? "" : "s";
  if (proposal.status === "partial") return `Partially applied proposal · ${count} change${plural} · View`;
  return `Applied proposal · ${count} change${plural} · View`;
}

function ChatMessageBubbleComponent({
  disabled,
  editDraft,
  editable = true,
  isEditing,
  linkedEditProposals = [],
  message,
  onCancelEdit,
  onEditDraftChange,
  onApplyFileEdit,
  onSaveEdit,
  onStartEdit,
  onViewEditProposal,
}: {
  disabled: boolean;
  editDraft: string;
  editable?: boolean;
  isEditing: boolean;
  linkedEditProposals?: EditProposal[];
  message: ChatMessage;
  onCancelEdit: () => void;
  onEditDraftChange: (value: string) => void;
  onApplyFileEdit?: (edit: ChatMessageFileEdit) => void | Promise<void>;
  onSaveEdit: (message: ChatMessage) => void;
  onStartEdit: (message: ChatMessage) => void;
  onViewEditProposal?: (proposalId: string) => void;
}) {
  const canEdit = editable && message.role === "user";
  const fileEdits = message.metadata?.fileEdits ?? [];
  const viewableEditProposals = linkedEditProposals.filter((proposal) => proposal.status === "applied" || proposal.status === "partial");
  const [applyingEditKey, setApplyingEditKey] = useState<string | null>(null);
  const currentFilePath = message.context?.currentFile?.path;
  const currentFileIsEditable = Boolean(
    currentFilePath && message.context?.ai_editable_files?.some((file) => file.path === currentFilePath),
  );
  const contextEntries = [
    ...(message.context?.currentFile
      ? [
          {
            key: `current:${message.context.currentFile.path}`,
            label: currentFileIsEditable ? "AI Editable" : "Viewing",
            path: message.context.currentFile.path,
          },
        ]
      : []),
    ...(message.context?.ai_editable_files ?? [])
      .filter((file) => file.path !== currentFilePath)
      .map((file) => ({ key: `editable:${file.path}`, label: "AI Editable", path: file.path })),
    ...(message.context?.context_files ?? []).map((file) => ({ key: `context:${file.path}`, label: "Context", path: file.path })),
  ];

  return (
    <article className={`chat-message chat-message-${message.role} chat-message-${message.status}`} data-message-id={message.id}>
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
        <div className="chat-message-content">{renderMarkdownMessageContent(message.content)}</div>
      )}
      {contextEntries.length ? (
        <div className="chat-message-context">
          {contextEntries.map((entry) => (
            <code key={entry.key}>
              {entry.label}: {entry.path}
            </code>
          ))}
        </div>
      ) : null}
      {fileEdits.length ? (
        <div className="chat-message-context">
          {fileEdits.map((edit) => {
            const editKey = `${edit.path}-${edit.summary}`;
            const applying = applyingEditKey === editKey;
            return (
              <button
                className="chat-context-chip"
                disabled={disabled || applying || !edit.proposedContent || edit.status !== "proposed"}
                key={editKey}
                onClick={() => {
                  setApplyingEditKey(editKey);
                  void Promise.resolve(onApplyFileEdit?.(edit))
                    .catch((error: unknown) => {
                      console.error("[kiss_ai UI warning] Could not apply chat file edit.", error);
                    })
                    .finally(() => setApplyingEditKey(null));
                }}
                title={edit.summary}
                type="button"
              >
                {applying ? "Applying draft edit:" : "Apply draft edit:"} {edit.path}
              </button>
            );
          })}
        </div>
      ) : null}
      {viewableEditProposals.length ? (
        <div className="chat-message-context" aria-label="Applied edit proposals">
          {viewableEditProposals.map((proposal) => (
            <button
              className="chat-context-chip"
              disabled={disabled}
              key={proposal.id}
              onClick={() => onViewEditProposal?.(proposal.id)}
              type="button"
            >
              {linkedProposalLabel(proposal)}
            </button>
          ))}
        </div>
      ) : null}
      {message.status === "streaming" ? <span className="agent-event-status">Streaming</span> : null}
    </article>
  );
}

export const ChatMessageBubble = memo(ChatMessageBubbleComponent);
