import type {
  ApplyEditProposalRequest,
  Conversation,
  ConversationsResponse,
  EditChatMessageRequest,

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
  updateFileEditStatus: (
    projectSlug: string,
    conversationId: string,
    messageId: string,
    editIndex: number,
    status: "proposed" | "applied" | "rejected" | "failed",
    originalContent?: string | null,
  ) =>
    request<Conversation>(
      `${projectBase(projectSlug)}/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/file-edits/${editIndex}/status`,
      {
        method: "PATCH",
        body: JSON.stringify({ status, originalContent }),
      },
    ),
  markFileRenameApplied: (projectSlug: string, conversationId: string, messageId: string, renameIndex: number) =>
    request<Conversation>(
      `${projectBase(projectSlug)}/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/file-renames/${renameIndex}/status`,
      {
        method: "PATCH",
        body: JSON.stringify({ status: "applied" }),
      },
    ),
  markArtifactRenameApplied: (projectSlug: string, conversationId: string, messageId: string, renameIndex: number) =>
    request<Conversation>(
      `${projectBase(projectSlug)}/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/artifact-renames/${renameIndex}/status`,
      {
        method: "PATCH",
        body: JSON.stringify({ status: "applied" }),
      },
    ),
  cancelChatAgent: (projectSlug: string) =>
    request<{ ok: boolean; cancelled: boolean }>(`${projectBase(projectSlug)}/conversations/cancel-agent`, {
      method: "POST",
    }),
  openConversationEventSource: (projectSlug: string, conversationId: string) =>
    new EventSource(`${projectBase(projectSlug)}/conversations/${encodeURIComponent(conversationId)}/events`),
};
