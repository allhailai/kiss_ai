import type {
  ApplyEditProposalRequest,
  Conversation,
  ConversationsResponse,
  EditChatMessageRequest,
  GenerateEditProposalRequest,
  SendChatMessageRequest,
  UpdateConversationRequest,
  UpdateEditProposalRequest,
} from "../contracts/api";
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
  generateEditProposal: (projectSlug: string, conversationId: string, body: GenerateEditProposalRequest) =>
    request<Conversation>(`${projectBase(projectSlug)}/conversations/${encodeURIComponent(conversationId)}/edit-proposals`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateEditProposal: (projectSlug: string, conversationId: string, proposalId: string, body: UpdateEditProposalRequest) =>
    request<Conversation>(
      `${projectBase(projectSlug)}/conversations/${encodeURIComponent(conversationId)}/edit-proposals/${encodeURIComponent(proposalId)}`,
      {
        method: "PATCH",
        body: JSON.stringify(body),
      },
    ),
  applyEditProposal: (projectSlug: string, conversationId: string, proposalId: string, body: ApplyEditProposalRequest) =>
    request<Conversation>(
      `${projectBase(projectSlug)}/conversations/${encodeURIComponent(conversationId)}/edit-proposals/${encodeURIComponent(proposalId)}/apply`,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    ),
  openConversationEventSource: (projectSlug: string, conversationId: string) =>
    new EventSource(`${projectBase(projectSlug)}/conversations/${encodeURIComponent(conversationId)}/events`),
};
