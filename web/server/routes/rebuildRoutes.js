import { openSseStream } from "../utils/sse.js";
import { parseRequestBody, resolveHumanAttentionBodySchema, startRebuildBodySchema } from "./requestSchemas.js";

export function registerRebuildRoutes(app, {
  getRebuildState,
  httpError,
  startBatchDeepen,
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
      const snapshot = await getRebuildState(request.project.slug);
      const stream = openSseStream(request, response);
      const unsubscribe = subscribeToRebuild(request.project.slug, ({ state, event }) => {
        stream.send("event", { state, event });
      });

      stream.send("snapshot", snapshot);
      stream.closeWith(unsubscribe);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/projects/:projectSlug/rebuild/start", async (request, response, next) => {
    try {
      const body = parseRequestBody(startRebuildBodySchema, request.body, httpError);
      response.json(await startRebuild(request.project, body.modelId));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/projects/:projectSlug/human-attention/resolve", async (request, response, next) => {
    try {
      response.json(await startHumanAttentionResolution(request.project, parseRequestBody(resolveHumanAttentionBodySchema, request.body, httpError)));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/projects/:projectSlug/rebuild/deepen", async (request, response, next) => {
    try {
      const modelId = request.body?.modelId ?? null;
      response.json(await startBatchDeepen(request.project, modelId));
    } catch (error) {
      next(error);
    }
  });
}
