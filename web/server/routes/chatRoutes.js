import { openSseStream } from "../utils/sse.js";
import {
  createConversationBodySchema,
  editChatMessageBodySchema,
  parseRequestBody,
  sendChatMessageBodySchema,
  updateConversationBodySchema,
} from "./requestSchemas.js";

export function registerChatRoutes(app, { editChatMessage, httpError, listConversations, createConversation, readConversation, sendChatMessage, subscribeToConversation, updateConversation }) {
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
      response.json(await readConversation(request.project, request.params.conversationId));
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/projects/:projectSlug/conversations/:conversationId", async (request, response, next) => {
    try {
      response.json(await updateConversation(request.project, request.params.conversationId, parseRequestBody(updateConversationBodySchema, request.body, httpError)));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/projects/:projectSlug/conversations/:conversationId/messages", async (request, response, next) => {
    try {
      response.json(await sendChatMessage(request.project, request.params.conversationId, parseRequestBody(sendChatMessageBodySchema, request.body, httpError)));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/projects/:projectSlug/conversations/:conversationId/messages/:messageId/edit", async (request, response, next) => {
    try {
      response.json(await editChatMessage(request.project, request.params.conversationId, request.params.messageId, parseRequestBody(editChatMessageBodySchema, request.body, httpError)));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/projects/:projectSlug/conversations/:conversationId/events", async (request, response, next) => {
    try {
      const conversation = await readConversation(request.project, request.params.conversationId);
      const stream = openSseStream(request, response);
      const unsubscribe = subscribeToConversation(request.project.slug, request.params.conversationId, (event) => {
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
}
