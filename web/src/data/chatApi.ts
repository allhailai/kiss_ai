import type { Conversation, ConversationsResponse, EditChatMessageRequest, SendChatMessageRequest, UpdateConversationRequest } from "../contracts/api";
import { projectBase, request } from "./request";

export const chatApi = {
  conversations: (projectSlug: string) => request<ConversationsResponse>(`${projectBase(projectSlug)}/conversations`),
  createConversation: (projectSlug: string, body: { modelId?: string; title?: string }) =>
    request<Conversation>(`${projectBase(projectSlug)}/conversations`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  conversation: (projectSlug: string, conversationId: string) =>
    request<Conversation>(`${projectBase(projectSlug)}/conversations/${encodeURIComponent(conversationId)}`),
  updateConversation: (projectSlug: string, conversationId: string, body: UpdateConversationRequest) =>
    request<Conversation>(`${projectBase(projectSlug)}/conversations/${encodeURIComponent(conversationId)}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  sendChatMessage: (projectSlug: string, conversationId: string, body: SendChatMessageRequest) =>
    request<Conversation>(`${projectBase(projectSlug)}/conversations/${encodeURIComponent(conversationId)}/messages`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  editChatMessage: (projectSlug: string, conversationId: string, messageId: string, body: EditChatMessageRequest) =>
    request<Conversation>(
      `${projectBase(projectSlug)}/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/edit`,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    ),
  conversationEventsUrl: (projectSlug: string, conversationId: string) =>
    `${projectBase(projectSlug)}/conversations/${encodeURIComponent(conversationId)}/events`,
};
