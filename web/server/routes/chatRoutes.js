import { openSseStream } from "../utils/sse.js";

export function registerChatRoutes(app, { editChatMessage, listConversations, createConversation, readConversation, sendChatMessage, subscribeToConversation, updateConversation }) {
  app.get("/api/projects/:projectSlug/conversations", async (request, response, next) => {
    try {
      response.json(await listConversations(request.project));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/projects/:projectSlug/conversations", async (request, response, next) => {
    try {
      response.status(201).json(await createConversation(request.project, request.body));
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
      response.json(await updateConversation(request.project, request.params.conversationId, request.body));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/projects/:projectSlug/conversations/:conversationId/messages", async (request, response, next) => {
    try {
      response.json(await sendChatMessage(request.project, request.params.conversationId, request.body));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/projects/:projectSlug/conversations/:conversationId/messages/:messageId/edit", async (request, response, next) => {
    try {
      response.json(await editChatMessage(request.project, request.params.conversationId, request.params.messageId, request.body));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/projects/:projectSlug/conversations/:conversationId/events", async (request, response, next) => {
    try {
      const stream = openSseStream(request, response);
      const unsubscribe = subscribeToConversation(request.project.slug, request.params.conversationId, (event) => {
        stream.send(event.type === "error" ? "chat_error" : event.type, event);
      });

      stream.send("snapshot", {
        type: "snapshot",
        conversation: await readConversation(request.project, request.params.conversationId),
      });
      stream.closeWith(unsubscribe);
    } catch (error) {
      next(error);
    }
  });
}
