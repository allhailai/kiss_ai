export function registerSystemRoutes(app, { updateKissAi }) {
  app.post("/api/system/update", async (_request, response, next) => {
    try {
      response.json(await updateKissAi());
    } catch (error) {
      next(error);
    }
  });
}
