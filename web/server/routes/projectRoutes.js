import { buildLogQuerySchema, createProjectBodySchema, parseRequestBody, parseRequestQuery } from "./requestSchemas.js";

export function registerProjectRoutes(app, {
  PROJECTS_ROOT,
  buildLogTabState,
  createProjectFromTemplate,
  discoverProjects,
  displayProjectName,
  getHumanAttentionItems,
  gitStatus,
  listCursorModels,
  pickRebuildModelId,
  readProjectJson,
  resolveCursorApiKey,
  httpError,
}) {
  app.get("/api/projects", async (_request, response, next) => {
    try {
      response.json({
        projectsRoot: PROJECTS_ROOT,
        projects: await discoverProjects(),
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/projects", async (request, response, next) => {
    try {
      response.status(201).json(await createProjectFromTemplate(parseRequestBody(createProjectBodySchema, request.body, httpError)));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/cursor/models", async (_request, response, next) => {
    try {
      const cursorApiKey = await resolveCursorApiKey();

      if (!cursorApiKey.available) {
        response.json({
          available: false,
          defaultModelId: null,
          models: [],
          source: null,
        });
        return;
      }

      const models = await listCursorModels(cursorApiKey.apiKey);
      response.json({
        available: true,
        defaultModelId: pickRebuildModelId(models),
        models,
        source: cursorApiKey.source,
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/projects/:projectSlug/status", async (request, response, next) => {
    try {
      const project = request.project;
      const harness = await readProjectJson(project.path, ".harness-state.json", {});
      const cursorApiKey = await resolveCursorApiKey();
      const humanAttentionItems = getHumanAttentionItems(harness);

      response.json({
        projectSlug: harness.project_slug ?? project.slug,
        projectName: displayProjectName(harness.project_name ?? project.name, harness.project_slug ?? project.slug),
        setupStatus: harness.setup?.status ?? "unknown",
        setupInitializedAt: harness.setup?.initialized_at ?? null,
        lastRunAt: harness.last_run_at ?? null,
        lastSuccessfulRunAt: harness.last_successful_run_at ?? null,
        scalingMode: harness.scaling_assessment?.selected_mode ?? null,
        rebuildStatus: harness.rebuild_scope?.status ?? null,
        lintStatus: harness.last_lint?.status ?? null,
        unresolvedReviewItems: harness.last_annotation_scan?.unresolved_review_items ?? [],
        blockedArtifacts: harness.rebuild_scope?.blocked_artifacts ?? [],
        staleOutputs: harness.rebuild_scope?.outputs_marked_stale ?? [],
        humanAttentionItems,
        humanAttentionCount: humanAttentionItems.length,
        cursorApiKeyAvailable: cursorApiKey.available,
        cursorApiKeySource: cursorApiKey.source,
        cursorApiKeyWarnings: cursorApiKey.warnings,
        gitStatus: await gitStatus(project.path),
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/projects/:projectSlug/build-log", async (request, response, next) => {
    try {
      const query = parseRequestQuery(buildLogQuerySchema, request.query, httpError);
      const requestedTabId = query.tab;
      const requestedPath = query.path || query.summary;
      const requestedSectionId = query.section;

      response.json(await buildLogTabState(request.project.path, requestedTabId, requestedPath, requestedSectionId));
    } catch (error) {
      next(error);
    }
  });
}
