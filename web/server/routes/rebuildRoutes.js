export function registerRebuildRoutes(app, {
  getRebuildState,
  startHumanAttentionResolution,
  startRebuild,
  subscribeToRebuild,
}) {
  app.get("/api/projects/:projectSlug/rebuild", async (request, response, next) => {
    try {
      response.json(await getRebuildState(request.project.slug));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/projects/:projectSlug/rebuild/events", async (request, response, next) => {
    try {
      response.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      });
      response.flushHeaders?.();

      const send = (eventName, payload) => {
        response.write(`event: ${eventName}\n`);
        response.write(`data: ${JSON.stringify(payload)}\n\n`);
      };
      const unsubscribe = subscribeToRebuild(request.project.slug, ({ state, event }) => {
        send("event", { state, event });
      });

      send("snapshot", await getRebuildState(request.project.slug));

      request.on("close", () => {
        unsubscribe();
        response.end();
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/projects/:projectSlug/rebuild/start", async (request, response, next) => {
    try {
      response.json(await startRebuild(request.project, request.body.modelId));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/projects/:projectSlug/human-attention/resolve", async (request, response, next) => {
    try {
      response.json(await startHumanAttentionResolution(request.project, request.body));
    } catch (error) {
      next(error);
    }
  });
}
