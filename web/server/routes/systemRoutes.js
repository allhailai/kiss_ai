import { parseRequestBody, saveCursorApiKeyBodySchema } from "./requestSchemas.js";

export function registerSystemRoutes(app, { authMiddleware, checkKissAiUpdate, httpError, KISS_AI_MODE, readKeybindings, readPinnedProjects, readProjectsViewPreference, readUxPreferences, saveCursorApiKey, systemSettings, updateAndRestart, updateKissAi, writePinnedProjects, writeProjectsViewPreference, writeUxPreferences }) {
  // In server mode, system mutation routes require admin. In standalone, no-op passthrough.
  const adminOnly = KISS_AI_MODE === "server" && authMiddleware ? authMiddleware.requireAdmin : (_req, _res, next) => next();

  app.get("/api/system/keybindings", async (_request, response, next) => {
    try {
      response.json(await readKeybindings());
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/system/projects-view", async (_request, response, next) => {
    try {
      response.json(await readProjectsViewPreference());
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/system/projects-view", async (request, response, next) => {
    try {
      const view = request.body?.view;
      if (view !== "cards" && view !== "table") {
        throw httpError("Invalid view. Must be 'cards' or 'table'.", 400, "invalid_projects_view");
      }
      response.json(await writeProjectsViewPreference(view));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/system/pinned-projects", async (_request, response, next) => {
    try {
      response.json(await readPinnedProjects());
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/system/pinned-projects", async (request, response, next) => {
    try {
      const pinned = request.body?.pinned;
      if (!Array.isArray(pinned)) {
        throw httpError("Invalid pinned list. Must be an array of project slugs.", 400, "invalid_pinned_projects");
      }
      response.json(await writePinnedProjects(pinned));
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

  app.get("/api/system/ux-preferences", async (_request, response, next) => {
    try {
      response.json(await readUxPreferences());
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/system/ux-preferences", async (request, response, next) => {
    try {
      const updates = request.body;
      if (!updates || typeof updates !== "object") {
        throw httpError("Invalid UX preferences. Must be an object.", 400, "invalid_ux_preferences");
      }
      response.json(await writeUxPreferences(updates));
    } catch (error) {
      next(error);
    }
  });
}

