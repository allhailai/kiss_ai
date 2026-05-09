export function registerAgentRoutes(app, { listAgentCapabilities, readAgentSession, sendAgentSessionMessage }) {
  app.get("/api/projects/:projectSlug/agent-capabilities", async (request, response, next) => {
    try {
      response.json(await listAgentCapabilities(request.project));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/projects/:projectSlug/agent-sessions/default", async (request, response, next) => {
    try {
      response.json(await readAgentSession(request.project));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/projects/:projectSlug/agent-sessions/default/messages", async (request, response, next) => {
    try {
      response.json(await sendAgentSessionMessage(request.project, request.body));
    } catch (error) {
      next(error);
    }
  });
}
