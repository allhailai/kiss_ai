import { parseRequestBody, saveCursorApiKeyBodySchema } from "./requestSchemas.js";

export function registerSystemRoutes(app, { checkKissAiUpdate, httpError, readKeybindings, saveCursorApiKey, systemSettings, updateAndRestart, updateKissAi }) {
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

  app.post("/api/system/settings/cursor-api-key", async (request, response, next) => {
    try {
      const body = parseRequestBody(saveCursorApiKeyBodySchema, request.body, httpError);
      response.json(await saveCursorApiKey(body.cursorApiKey));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/system/update/check", async (_request, response, next) => {
    try {
      response.json(await checkKissAiUpdate());
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/system/update", async (_request, response, next) => {
    try {
      response.json(await updateKissAi());
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/system/update-and-restart", async (_request, response, next) => {
    try {
      response.json(await updateAndRestart());
    } catch (error) {
      next(error);
    }
  });
}

