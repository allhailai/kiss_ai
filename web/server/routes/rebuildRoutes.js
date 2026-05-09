import { openSseStream } from "../utils/sse.js";

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
      const stream = openSseStream(request, response);
      const unsubscribe = subscribeToRebuild(request.project.slug, ({ state, event }) => {
        stream.send("event", { state, event });
      });

      stream.send("snapshot", await getRebuildState(request.project.slug));
      stream.closeWith(unsubscribe);
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
