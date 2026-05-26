import { openSseStream } from "../utils/sse.js";
import {
  applyEditProposalBodySchema,
  createConversationBodySchema,
  chatMessageParamsSchema,
  conversationParamsSchema,
  editChatMessageBodySchema,
  editProposalParamsSchema,
  fileEditStatusParamsSchema,
  generateEditProposalBodySchema,
  parseRequestBody,
  parseRequestParams,
  sendChatMessageBodySchema,
  updateConversationBodySchema,
  updateEditProposalBodySchema,
  updateFileEditStatusBodySchema,
} from "./requestSchemas.js";

export function registerChatRoutes(app, {
  applyEditProposal,
  cancelChatAgent,
  editChatMessage,
  generateEditProposal,
  httpError,
  listConversations,
  createConversation,
  readConversation,
  sendChatMessage,
  subscribeToConversation,
  updateConversation,
  updateEditProposal,
  updateMessageFileEditStatus,
}) {
  app.get("/api/projects/:projectSlug/conversations", async (request, response, next) => {
    try {
      response.json(await listConversations(request.project));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/projects/:projectSlug/conversations", async (request, response, next) => {
    try {
      response.status(201).json(await createConversation(request.project, parseRequestBody(createConversationBodySchema, request.body, httpError)));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/projects/:projectSlug/conversations/:conversationId", async (request, response, next) => {
    try {
      const { conversationId } = parseRequestParams(conversationParamsSchema, request.params, httpError);
      response.json(await readConversation(request.project, conversationId));
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/projects/:projectSlug/conversations/:conversationId", async (request, response, next) => {
    try {
      const { conversationId } = parseRequestParams(conversationParamsSchema, request.params, httpError);
      response.json(await updateConversation(request.project, conversationId, parseRequestBody(updateConversationBodySchema, request.body, httpError)));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/projects/:projectSlug/conversations/:conversationId/messages", async (request, response, next) => {
    try {
      const { conversationId } = parseRequestParams(conversationParamsSchema, request.params, httpError);
      response.json(await sendChatMessage(request.project, conversationId, parseRequestBody(sendChatMessageBodySchema, request.body, httpError)));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/projects/:projectSlug/conversations/:conversationId/messages/:messageId/edit", async (request, response, next) => {
    try {
      const { conversationId, messageId } = parseRequestParams(chatMessageParamsSchema, request.params, httpError);
      response.json(await editChatMessage(request.project, conversationId, messageId, parseRequestBody(editChatMessageBodySchema, request.body, httpError)));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/projects/:projectSlug/conversations/:conversationId/edit-proposals", async (request, response, next) => {
    try {
      const { conversationId } = parseRequestParams(conversationParamsSchema, request.params, httpError);
      response.json(await generateEditProposal(request.project, conversationId, parseRequestBody(generateEditProposalBodySchema, request.body, httpError)));
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/projects/:projectSlug/conversations/:conversationId/edit-proposals/:proposalId", async (request, response, next) => {
    try {
      const { conversationId, proposalId } = parseRequestParams(editProposalParamsSchema, request.params, httpError);
      response.json(await updateEditProposal(request.project, conversationId, proposalId, parseRequestBody(updateEditProposalBodySchema, request.body, httpError)));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/projects/:projectSlug/conversations/:conversationId/edit-proposals/:proposalId/apply", async (request, response, next) => {
    try {
      const { conversationId, proposalId } = parseRequestParams(editProposalParamsSchema, request.params, httpError);
      response.json(await applyEditProposal(request.project, conversationId, proposalId, parseRequestBody(applyEditProposalBodySchema, request.body, httpError)));
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/projects/:projectSlug/conversations/:conversationId/messages/:messageId/file-edits/:editIndex/status", async (request, response, next) => {
    try {
      const { conversationId, messageId, editIndex } = parseRequestParams(fileEditStatusParamsSchema, request.params, httpError);
      const { status } = parseRequestBody(updateFileEditStatusBodySchema, request.body, httpError);
      response.json(await updateMessageFileEditStatus(request.project, conversationId, messageId, editIndex, status));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/projects/:projectSlug/conversations/:conversationId/events", async (request, response, next) => {
    try {
      const { conversationId } = parseRequestParams(conversationParamsSchema, request.params, httpError);
      const conversation = await readConversation(request.project, conversationId);
      const stream = openSseStream(request, response);
      const unsubscribe = subscribeToConversation(request.project.slug, conversationId, (event) => {
        stream.send(event.type === "error" ? "chat_error" : event.type, event);
      });

      stream.send("snapshot", {
        type: "snapshot",
        conversation,
      });
      stream.closeWith(unsubscribe);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/projects/:projectSlug/conversations/cancel-agent", async (request, response, next) => {
    try {
      response.json(cancelChatAgent(request.project.slug));
    } catch (error) {
      next(error);
    }
  });
}
