import { useRef, useState, type RefObject } from "react";
import type { ConversationSummary } from "../../contracts/api";
import { formatChatDateTime } from "../../shared/chat/chatRendering";

export function AgentConversationHeader({
  activeConversationId,
  activeTitle,
  controlsDisabled,
  conversationFilter,
  filteredConversations,
  onFilterChange,
  onNewConversation,
  onSelectConversation,
}: {
  activeConversationId: string | undefined;
  activeTitle: string;
  controlsDisabled: boolean;
  conversationFilter: string;
  filteredConversations: ConversationSummary[];
  onFilterChange: (query: string) => void;
  onNewConversation: () => void;
  onSelectConversation: (conversationId: string) => void;
}) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const titleTriggerRef = useRef<HTMLButtonElement | null>(null);

  const selectConversation = (conversationId: string) => {
    if (controlsDisabled) return;
    setHistoryOpen(false);
    onSelectConversation(conversationId);
    titleTriggerRef.current?.focus();
  };

  return (
    <div className="agent-conversation-header">
      <div className="agent-conversation-title">
        <button
          aria-expanded={historyOpen}
          aria-haspopup="listbox"
          aria-label="Select chat conversation"
          className="agent-conversation-title-trigger"
          onClick={() => setHistoryOpen((open) => !open)}
          onKeyDown={(event) => {
            if (event.key === "Escape" && historyOpen) {
              event.preventDefault();
              setHistoryOpen(false);
            }
          }}
          ref={titleTriggerRef}
          type="button"
        >
          <strong>{activeTitle}</strong>
          <span aria-hidden="true" className="agent-conversation-title-chevron">
            ▾
          </span>
        </button>
        {historyOpen ? (
          <section
            aria-label="Saved chat conversations"
            className="agent-history-popover"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                setHistoryOpen(false);
                titleTriggerRef.current?.focus();
              }
            }}
          >
            <input
              aria-label="Filter conversations"
              className="agent-history-filter"
              onChange={(event) => onFilterChange(event.currentTarget.value)}
              placeholder="Search conversations"
              type="search"
              value={conversationFilter}
            />
            <div className="agent-history-list" role="listbox">
              {filteredConversations.length ? (
                filteredConversations.map((conversation) => (
                  <button
                    aria-selected={activeConversationId === conversation.id}
                    className={activeConversationId === conversation.id ? "agent-history-item active" : "agent-history-item"}
                    disabled={controlsDisabled}
                    key={conversation.id}
                    onClick={() => selectConversation(conversation.id)}
                    role="option"
                    type="button"
                  >
                    <strong>{conversation.title}</strong>
                    <span>{conversation.summary || "No summary yet."}</span>
                    <small>
                      {formatChatDateTime(conversation.updatedAt)} · {conversation.messageCount} message
                      {conversation.messageCount === 1 ? "" : "s"}
                    </small>
                  </button>
                ))
              ) : (
                <p className="agent-history-empty">No conversations match this filter.</p>
              )}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
