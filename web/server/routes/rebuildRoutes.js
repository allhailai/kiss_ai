import { openSseStream } from "../utils/sse.js";
import { parseRequestBody, resolveHumanAttentionBodySchema, startRebuildBodySchema } from "./requestSchemas.js";

export function registerRebuildRoutes(app, {
  cancelAgentJob,
  getOutputStatus,
  getRebuildState,
  httpError,
  startFullRebuild,
  startHumanAttentionResolution,
  startKnowledgeBuild,
  startOutputBuild,
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

  // Deepen is now folded into the normal build — a normal rebuild will pick up queued topics.
  // Keep the route for backwards compatibility but redirect to normal rebuild.
  app.post("/api/projects/:projectSlug/rebuild/deepen", async (request, response, next) => {
    try {
      const modelId = request.body?.modelId ?? null;
      response.json(await startRebuild(request.project, modelId));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/projects/:projectSlug/rebuild/full-rebuild", async (request, response, next) => {
    try {
      const modelId = request.body?.modelId ?? null;
      response.json(await startFullRebuild(request.project, modelId));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/projects/:projectSlug/rebuild/cancel", async (request, response, next) => {
    try {
      response.json(await cancelAgentJob(request.project.slug));
    } catch (error) {
      next(error);
    }
  });

  // ── Two-Phase Build Routes ──

  app.post("/api/projects/:projectSlug/build-knowledge", async (request, response, next) => {
    try {
      const modelId = request.body?.modelId ?? null;
      response.json(await startKnowledgeBuild(request.project, modelId));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/projects/:projectSlug/build-outputs", async (request, response, next) => {
    try {
      const { files, type, modelId } = request.body ?? {};
      if (!Array.isArray(files) || files.length === 0) {
        throw httpError("files must be a non-empty array of file paths.", 400);
      }
      const outputType = type === "artifact" ? "artifact" : "report";
      response.json(await startOutputBuild(request.project, modelId ?? null, files, outputType));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/projects/:projectSlug/outputs/status", async (request, response, next) => {
    try {
      response.json(await getOutputStatus(request.project.path));
    } catch (error) {
      next(error);
    }
  });
}
