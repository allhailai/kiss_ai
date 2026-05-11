import type { Conversation, ConversationSummary } from "../../contracts/api";
import { formatChatDateTime } from "../../shared/chat/chatRendering";

type ChatConversationHistoryController = {
  activeConversation: Conversation | null;
  conversationFilter: string;
  conversations: ConversationSummary[];
  filteredConversations: ConversationSummary[];
  openConversation: (conversationId: string) => Promise<void>;
  sending: boolean;
  setConversationFilter: (query: string) => void;
};

export function ProjectChatConversationHistory({
  chat,
  onSelectConversation,
}: {
  chat: ChatConversationHistoryController;
  onSelectConversation?: (conversationId: string) => void;
}) {
  return (
    <aside className="content-card chat-sidebar">
      <div className="section-heading">
        <div>
          <h3>Conversations</h3>
          <p>{chat.conversations.length.toLocaleString()} saved conversation{chat.conversations.length === 1 ? "" : "s"}</p>
        </div>
      </div>
      <input
        aria-label="Filter conversations"
        className="chat-filter"
        onChange={(event) => chat.setConversationFilter(event.target.value)}
        placeholder="Search conversations"
        value={chat.conversationFilter}
      />
      <div className="chat-conversation-list">
        {chat.filteredConversations.length ? (
          chat.filteredConversations.map((conversation) => (
            <button
              className={chat.activeConversation?.id === conversation.id ? "chat-conversation-item active" : "chat-conversation-item"}
              disabled={chat.sending}
              key={conversation.id}
              onClick={() => {
                if (onSelectConversation) {
                  onSelectConversation(conversation.id);
                } else {
                  void chat.openConversation(conversation.id);
                }
              }}
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
          <p className="chat-empty-state">No conversations match this filter.</p>
        )}
      </div>
    </aside>
  );
}
