export function registerAiRoutes(app, {
  lintDesignIdentity,
  parseDesignIdentity,
  readTextFile,
}) {
  app.get("/api/projects/:projectSlug/design", async (request, response, next) => {
    try {
      const file = await readTextFile(request.project.path, "human_design_identity.md");
      response.json({
        file,
        parsed: parseDesignIdentity(file.content),
        lint: await lintDesignIdentity(request.project.path),
      });
    } catch (error) {
      next(error);
    }
  });
}
