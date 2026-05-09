export function registerAiRoutes(app, {
  acceptRequirementsAutoUpdate,
  lintDesignIdentity,
  parseDesignIdentity,
  readTextFile,
  runAiAssistProposal,
  runRequirementsAutoUpdateProposal,
}) {
  app.post("/api/projects/:projectSlug/ai-assist/propose", async (request, response, next) => {
    try {
      response.json(await runAiAssistProposal(request.project, request.body));
    } catch (error) {
      next(error);
    }
  });

  // Refine is a stable API alias that sends prior proposal context to the same proposal service.
  app.post("/api/projects/:projectSlug/ai-assist/refine", async (request, response, next) => {
    try {
      response.json(await runAiAssistProposal(request.project, request.body));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/projects/:projectSlug/requirements/auto-update/propose", async (request, response, next) => {
    try {
      response.json(await runRequirementsAutoUpdateProposal(request.project, request.body));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/projects/:projectSlug/requirements/auto-update/accept", async (request, response, next) => {
    try {
      response.json(await acceptRequirementsAutoUpdate(request.project, request.body));
    } catch (error) {
      next(error);
    }
  });

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
