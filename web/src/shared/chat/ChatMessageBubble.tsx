import { memo, useState } from "react";
import type { ChatMessage, ChatMessageArtifactProposal, ChatMessageFileEdit, ChatMessageTopicProposal, EditProposal } from "../../contracts/api";
import { formatChatDateTime, renderMarkdownMessageContent } from "./chatRendering";

function linkedProposalLabel(proposal: EditProposal) {
  const count = proposal.conceptualDiffs.length;
  const plural = count === 1 ? "" : "s";
  if (proposal.status === "partial") return `Partially applied proposal · ${count} change${plural} · View`;
  return `Applied proposal · ${count} change${plural} · View`;
}

function ChatMessageBubbleComponent({
  createdTopicLabels,
  createdArtifactTitles,
  disabled,
  editDraft,
  editable = true,
  isEditing,
  linkedEditProposals = [],
  message,
  onCancelEdit,
  onEditDraftChange,
  onApplyFileEdit,
  onCreateArtifact,
  onCreateTopic,
  onSaveEdit,
  onStartEdit,
  onViewEditProposal,
}: {
  createdTopicLabels?: Set<string>;
  createdArtifactTitles?: Set<string>;
  disabled: boolean;
  editDraft: string;
  editable?: boolean;
  isEditing: boolean;
  linkedEditProposals?: EditProposal[];
  message: ChatMessage;
  onCancelEdit: () => void;
  onEditDraftChange: (value: string) => void;
  onApplyFileEdit?: (edit: ChatMessageFileEdit) => void | Promise<void>;
  onCreateArtifact?: (proposal: ChatMessageArtifactProposal) => void;
  onCreateTopic?: (proposal: ChatMessageTopicProposal) => void;
  onSaveEdit: (message: ChatMessage) => void;
  onStartEdit: (message: ChatMessage) => void;
  onViewEditProposal?: (proposalId: string) => void;
}) {
  const canEdit = editable && message.role === "user";
  const fileEdits = message.metadata?.fileEdits ?? [];
  const topicProposals = message.metadata?.topicProposals ?? [];
  const artifactProposals = message.metadata?.artifactProposals ?? [];
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
      {fileEdits.some((edit) => edit.path.includes("artifact_specs/") && edit.status === "applied") ? (
        <div className="chat-spec-edit-indicator" aria-label="Spec updated">
          <span aria-hidden="true">✅</span> Spec updated
        </div>
      ) : null}
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
                className={edit.path.includes("artifact_specs/") ? "chat-artifact-apply-btn" : "chat-context-chip"}
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
              {edit.path.includes("artifact_specs/")
                ? (applying ? "Applying…" : "Update Artifact \u2014 with the change above?")
                : (<>{applying ? "Applying draft edit:" : "Apply draft edit:"} {edit.path}</>)}
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
      {topicProposals.length ? (
        <div className="chat-message-context" aria-label="Topic proposals">
          {topicProposals.map((proposal) => {
            const alreadyCreated = createdTopicLabels?.has(proposal.label.toLowerCase()) ?? false;
            return (
              <button
                className={alreadyCreated ? "chat-topic-proposal-chip chat-topic-proposal-created" : "chat-topic-proposal-chip"}
                disabled={disabled || alreadyCreated}
                key={proposal.label}
                onClick={() => onCreateTopic?.(proposal)}
                title={alreadyCreated ? `Topic already created: ${proposal.label}` : (proposal.justification || `Create topic: ${proposal.label}`)}
                type="button"
              >
                {alreadyCreated ? "✅" : "🔬"} {alreadyCreated ? "Topic created:" : "Create topic:"} {proposal.label}
              </button>
            );
          })}
        </div>
      ) : null}
      {artifactProposals.length ? (
        <div className="chat-message-context" aria-label="Artifact proposals">
          {artifactProposals.map((proposal) => {
            const alreadyCreated = createdArtifactTitles?.has(proposal.title.toLowerCase()) ?? false;
            return (
              <button
                className={alreadyCreated ? "chat-artifact-proposal-chip chat-artifact-proposal-created" : "chat-artifact-proposal-chip"}
                disabled={disabled || alreadyCreated}
                key={proposal.title}
                onClick={() => onCreateArtifact?.(proposal)}
                title={alreadyCreated ? `Artifact already created: ${proposal.title}` : (proposal.summary || `Create artifact: ${proposal.title}`)}
                type="button"
              >
                {alreadyCreated ? "✅" : "📄"} {alreadyCreated ? "Artifact created:" : "Create artifact:"} {proposal.title}
              </button>
            );
          })}
        </div>
      ) : null}
      {message.status === "streaming" ? <span className="agent-event-status">Streaming</span> : null}
    </article>
  );
}

export const ChatMessageBubble = memo(ChatMessageBubbleComponent);
