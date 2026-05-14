export function registerSystemRoutes(app, { checkKissAiUpdate, updateKissAi }) {
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
}
