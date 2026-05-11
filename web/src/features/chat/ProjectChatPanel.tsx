import type { RebuildModel } from "../../contracts/api";
import { ChatComposer } from "../../shared/chat/ChatComposer";
import { ChatThread } from "../../shared/chat/ChatThread";
import type { ProjectChatController } from "./useProjectChat";

export function ProjectChatPanel({
  chat,
  models,
  selectedModelId,
  onModelChange,
}: {
  chat: ProjectChatController;
  models: RebuildModel[];
  selectedModelId: string;
  onModelChange: (modelId: string) => void;
}) {
  return (
    <section className="content-card chat-main">
      <div className="chat-topbar">
        <div>
          <span>Project Chat</span>
          <strong>{chat.activeConversation?.title || "New conversation"}</strong>
        </div>
        <button disabled={chat.loading || chat.sending} onClick={() => void chat.createConversation()} type="button">
          New Conversation
        </button>
      </div>

      <ChatThread
        disabled={chat.sending}
        editDraft={chat.editDraft}
        editingMessageId={chat.editingMessageId}
        emptyDescription="Ask a question, attach relevant project files as context, or create a new conversation to clear prior chat history."
        emptyTitle={chat.loading ? "Loading conversation..." : "Start a project conversation"}
        messages={chat.activeConversation?.messages ?? []}
        onCancelEdit={chat.cancelEditingMessage}
        onEditDraftChange={chat.setEditDraft}
        onJumpToLatest={() => chat.scrollToLatest()}
        onSaveEdit={chat.saveEditedMessage}
        onScroll={chat.handleThreadScroll}
        onStartEdit={chat.startEditingMessage}
        showJumpToLatest={chat.showJumpToLatest}
        threadRef={chat.threadRef}
      />

      <ChatComposer
        contextFiles={chat.contextFiles}
        contextRefs={chat.contextRefs}
        disabled={chat.sending}
        draft={chat.messageDraft}
        models={models}
        onAddContextRef={chat.addContextRef}
        onChangeDraft={chat.handleComposerChange}
        onModelChange={onModelChange}
        onRemoveContextRef={(path) => chat.setContextRefs((current) => current.filter((candidate) => candidate.path !== path))}
        onSubmit={() => void chat.sendMessage()}
        selectedModelId={selectedModelId}
        textareaRef={chat.composerTextareaRef}
      />
    </section>
  );
}
