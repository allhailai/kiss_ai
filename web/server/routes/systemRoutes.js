import { parseRequestBody, saveCursorApiKeyBodySchema } from "./requestSchemas.js";

export function registerSystemRoutes(app, { authMiddleware, checkKissAiUpdate, httpError, KISS_AI_MODE, readKeybindings, saveCursorApiKey, systemSettings, updateAndRestart, updateKissAi }) {
  // In server mode, system mutation routes require admin. In standalone, no-op passthrough.
  const adminOnly = KISS_AI_MODE === "server" && authMiddleware ? authMiddleware.requireAdmin : (_req, _res, next) => next();

  app.get("/api/system/keybindings", async (_request, response, next) => {
    try {
      response.json(await readKeybindings());
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/system/settings", async (_request, response, next) => {
    try {
      response.json(await systemSettings());
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/system/settings/cursor-api-key", adminOnly, async (request, response, next) => {
    try {
      const body = parseRequestBody(saveCursorApiKeyBodySchema, request.body, httpError);
      response.json(await saveCursorApiKey(body.cursorApiKey));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/system/update/check", adminOnly, async (_request, response, next) => {
    try {
      response.json(await checkKissAiUpdate());
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/system/update", adminOnly, async (_request, response, next) => {
    try {
      response.json(await updateKissAi());
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/system/update-and-restart", adminOnly, async (_request, response, next) => {
    try {
      response.json(await updateAndRestart());
    } catch (error) {
      next(error);
    }
  });
}

