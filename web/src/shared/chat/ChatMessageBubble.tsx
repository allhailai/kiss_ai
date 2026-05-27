import { memo, useState } from "react";
import type { ChatMessage, ChatMessageArtifactProposal, ChatMessageArtifactRename, ChatMessageFileEdit, ChatMessageFileRename, ChatMessageTopicProposal, EditProposal } from "../../contracts/api";
import { formatChatDateTime, renderMarkdownMessageContent } from "./chatRendering";

function linkedProposalLabel(proposal: EditProposal) {
  const count = proposal.conceptualDiffs.length;
  const plural = count === 1 ? "" : "s";
  if (proposal.status === "partial") return `Partially applied proposal · ${count} change${plural} · View`;
  return `Applied proposal · ${count} change${plural} · View`;
}

/** Shorten a path to just the filename for display */
function shortPath(path: string) {
  return path.split("/").pop() ?? path;
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
  onApplyFileRename,
  onApplyArtifactRename,
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
  onApplyFileEdit?: (edit: ChatMessageFileEdit, editIndex: number, messageId: string) => Promise<boolean>;
  onApplyFileRename?: (rename: ChatMessageFileRename, renameIndex: number, messageId: string) => Promise<boolean>;
  onApplyArtifactRename?: (rename: ChatMessageArtifactRename, renameIndex: number, messageId: string) => Promise<boolean>;
  onCreateArtifact?: (proposal: ChatMessageArtifactProposal) => void;
  onCreateTopic?: (proposal: ChatMessageTopicProposal) => void;
  onSaveEdit: (message: ChatMessage) => void;
  onStartEdit: (message: ChatMessage) => void;
  onViewEditProposal?: (proposalId: string) => void;
}) {
  const canEdit = editable && message.role === "user";
  const fileEdits = message.metadata?.fileEdits ?? [];
  const fileRenames = message.metadata?.fileRenames ?? [];
  const artifactRenames = message.metadata?.artifactRenames ?? [];
  const topicProposals = message.metadata?.topicProposals ?? [];
  const artifactProposals = message.metadata?.artifactProposals ?? [];
  const viewableEditProposals = linkedEditProposals.filter((proposal) => proposal.status === "applied" || proposal.status === "partial");
  const [applyingKeys, setApplyingKeys] = useState<Set<string>>(new Set());
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

  const hasFileActions = fileEdits.length > 0 || fileRenames.length > 0 || artifactRenames.length > 0;
  const pendingEdits = fileEdits.filter((e) => e.status === "proposed" && e.proposedContent);
  const pendingRenames = fileRenames.filter((r) => r.status === "proposed");
  const pendingArtifactRenames = artifactRenames.filter((r) => r.status === "proposed");
  const pendingCount = pendingEdits.length + pendingRenames.length + pendingArtifactRenames.length;

  const markApplying = (key: string) => setApplyingKeys((prev) => new Set(prev).add(key));
  const clearApplying = (key: string) =>
    setApplyingKeys((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });

  const handleApplyAll = async () => {
    for (let i = 0; i < fileEdits.length; i++) {
      const edit = fileEdits[i];
      if (edit.status !== "proposed" || !edit.proposedContent) continue;
      const key = `edit:${i}`;
      markApplying(key);
      try {
        await onApplyFileEdit?.(edit, i, message.id);
      } catch {
        /* logged by caller */
      }
      clearApplying(key);
    }
    for (let i = 0; i < fileRenames.length; i++) {
      const rename = fileRenames[i];
      if (rename.status !== "proposed") continue;
      const key = `rename:${i}`;
      markApplying(key);
      try {
        await onApplyFileRename?.(rename, i, message.id);
      } catch {
        /* logged by caller */
      }
      clearApplying(key);
    }
    for (let i = 0; i < artifactRenames.length; i++) {
      const rename = artifactRenames[i];
      if (rename.status !== "proposed") continue;
      const key = `artifact:${i}`;
      markApplying(key);
      try {
        await onApplyArtifactRename?.(rename, i, message.id);
      } catch {
        /* logged by caller */
      }
      clearApplying(key);
    }
  };

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
      {hasFileActions ? (
        <div className="chat-file-actions" aria-label="File actions">
          {fileEdits.map((edit, editIndex) => {
            const key = `edit:${editIndex}`;
            const applying = applyingKeys.has(key);
            const isApplied = edit.status === "applied";
            const isArtifactSpec = edit.path.includes("artifact_specs/");
            return (
              <div key={key} className={`chat-file-action-card${isApplied ? " chat-file-action-card-applied" : ""}`}>
                <span className="chat-file-action-icon" aria-hidden="true">
                  {isApplied ? "✅" : isArtifactSpec ? "📄" : "✏️"}
                </span>
                <div className="chat-file-action-details">
                  <span className="chat-file-action-label">
                    {isApplied ? `Applied ${shortPath(edit.path)}` : isArtifactSpec ? "Update Artifact" : edit.summary}
                  </span>
                  <span className="chat-file-action-path">{edit.path}</span>
                </div>
                {!isApplied ? (
                  <button
                    className="chat-file-action-apply"
                    disabled={disabled || applying || !edit.proposedContent || edit.status !== "proposed"}
                    onClick={async () => {
                      markApplying(key);
                      try {
                        await onApplyFileEdit?.(edit, editIndex, message.id);
                      } catch (error: unknown) {
                        console.error("[kiss_ai] Could not apply chat file edit.", error);
                      }
                      clearApplying(key);
                    }}
                    title={edit.summary}
                    type="button"
                  >
                    {applying ? "Applying\u2026" : "Apply"}
                  </button>
                ) : null}
              </div>
            );
          })}
          {fileRenames.map((rename, renameIndex) => {
            const key = `rename:${renameIndex}`;
            const applying = applyingKeys.has(key);
            const isApplied = rename.status === "applied";
            return (
              <div key={key} className={`chat-file-action-card${isApplied ? " chat-file-action-card-applied" : ""}`}>
                <span className="chat-file-action-icon" aria-hidden="true">
                  {isApplied ? "✅" : "📝"}
                </span>
                <div className="chat-file-action-details">
                  <span className="chat-file-action-label">
                    {isApplied ? `Applied ${shortPath(rename.to)}` : `Rename ${shortPath(rename.from)}`}
                  </span>
                  <span className="chat-file-action-path">
                    {isApplied ? rename.to : <>{rename.from} &rarr; {rename.to}</>}
                  </span>
                </div>
                {!isApplied ? (
                  <button
                    className="chat-file-action-apply"
                    disabled={disabled || applying}
                    onClick={async () => {
                      markApplying(key);
                      try {
                        await onApplyFileRename?.(rename, renameIndex, message.id);
                      } catch (error: unknown) {
                        console.error("[kiss_ai] Could not apply chat file rename.", error);
                      }
                      clearApplying(key);
                    }}
                    title={rename.summary}
                    type="button"
                  >
                    {applying ? "Renaming\u2026" : "Apply"}
                  </button>
                ) : null}
              </div>
            );
          })}
          {artifactRenames.map((rename, renameIndex) => {
            const key = `artifact:${renameIndex}`;
            const applying = applyingKeys.has(key);
            const isApplied = rename.status === "applied";
            return (
              <div key={key} className={`chat-file-action-card${isApplied ? " chat-file-action-card-applied" : ""}`}>
                <span className="chat-file-action-icon" aria-hidden="true">
                  {isApplied ? "✅" : "📦"}
                </span>
                <div className="chat-file-action-details">
                  <span className="chat-file-action-label">
                    {isApplied ? `Applied ${rename.to}` : `Rename artifact ${rename.from}`}
                  </span>
                  <span className="chat-file-action-path">
                    {isApplied ? rename.to : <>{rename.from} &rarr; {rename.to}</>}
                  </span>
                </div>
                {!isApplied ? (
                  <button
                    className="chat-file-action-apply"
                    disabled={disabled || applying}
                    onClick={async () => {
                      markApplying(key);
                      try {
                        await onApplyArtifactRename?.(rename, renameIndex, message.id);
                      } catch (error: unknown) {
                        console.error("[kiss_ai] Could not apply artifact rename.", error);
                      }
                      clearApplying(key);
                    }}
                    title={rename.summary}
                    type="button"
                  >
                    {applying ? "Renaming\u2026" : "Apply"}
                  </button>
                ) : null}
              </div>
            );
          })}
          {pendingCount >= 2 ? (
            <div className="chat-file-actions-batch">
              <button
                className="chat-apply-all-btn"
                disabled={disabled || applyingKeys.size > 0}
                onClick={handleApplyAll}
                type="button"
              >
                {applyingKeys.size > 0 ? "Applying\u2026" : `\u25B6 Apply All (${pendingCount})`}
              </button>
            </div>
          ) : null}
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
