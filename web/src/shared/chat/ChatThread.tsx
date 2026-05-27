import { useEffect, useRef, type RefObject } from "react";
import type { ChatMessage, ChatMessageArtifactProposal, ChatMessageArtifactRename, ChatMessageFileEdit, ChatMessageFileRename, ChatMessageTopicProposal, EditProposal } from "../../contracts/api";
import { ChatMessageBubble } from "./ChatMessageBubble";

export function ChatThread({
  createdTopicLabels,
  createdArtifactTitles,
  disabled,
  editDraft = "",
  editable = true,
  editingMessageId = null,
  emptyTitle,
  emptyDescription,
  editProposals = [],
  messages,
  onCancelEdit = () => undefined,
  onCreateArtifact,
  onCreateTopic,
  onEditDraftChange = () => undefined,
  onApplyFileEdit,
  onApplyFileRename,
  onApplyArtifactRename,
  onJumpToLatest,
  onViewEditProposal,
  onSaveEdit = () => undefined,
  onScroll,
  onStartEdit = () => undefined,
  scrollToMessageId = null,
  showThinking = false,
  showJumpToLatest = false,
  threadRef,
}: {
  createdTopicLabels?: Set<string>;
  createdArtifactTitles?: Set<string>;
  disabled: boolean;
  editDraft?: string;
  editable?: boolean;
  editingMessageId?: string | null;
  emptyTitle: string;
  emptyDescription: string;
  editProposals?: EditProposal[];
  messages: ChatMessage[];
  onCancelEdit?: () => void;
  onCreateArtifact?: (proposal: ChatMessageArtifactProposal) => void;
  onCreateTopic?: (proposal: ChatMessageTopicProposal) => void;
  onEditDraftChange?: (value: string) => void;
  onApplyFileEdit?: (edit: ChatMessageFileEdit, editIndex: number, messageId: string) => Promise<boolean>;
  onApplyFileRename?: (rename: ChatMessageFileRename, renameIndex: number, messageId: string) => Promise<boolean>;
  onApplyArtifactRename?: (rename: ChatMessageArtifactRename, renameIndex: number, messageId: string) => Promise<boolean>;
  onJumpToLatest?: () => void;
  onViewEditProposal?: (proposalId: string) => void;
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

  // Scroll to bottom on initial mount when messages are already present
  // (e.g. when the right panel opens with a pre-loaded conversation)
  useEffect(() => {
    const thread = resolvedThreadRef.current;
    if (!thread || !messages.length) return;
    window.requestAnimationFrame(() => {
      thread.scrollTo({ top: thread.scrollHeight, behavior: "auto" });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally runs only on mount
  }, []);

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
              createdTopicLabels={createdTopicLabels}
              createdArtifactTitles={createdArtifactTitles}
              disabled={disabled}
              editDraft={editDraft}
              editable={editable}
              isEditing={editingMessageId === message.id}
              key={message.id}
              message={message}
              linkedEditProposals={editProposals.filter((proposal) => proposal.sourceMessageId === message.id)}
              onApplyFileEdit={onApplyFileEdit}
              onApplyFileRename={onApplyFileRename}
              onApplyArtifactRename={onApplyArtifactRename}
              onCancelEdit={onCancelEdit}
              onCreateArtifact={onCreateArtifact}
              onCreateTopic={onCreateTopic}
              onEditDraftChange={onEditDraftChange}
              onSaveEdit={onSaveEdit}
              onStartEdit={onStartEdit}
              onViewEditProposal={onViewEditProposal}
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
