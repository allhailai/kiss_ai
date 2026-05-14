import { buildLogQuerySchema, createProjectBodySchema, parseRequestBody, parseRequestQuery, updateProjectUiStateBodySchema } from "./requestSchemas.js";

function extractOpenQuestions(content) {
  const lines = content.split("\n");
  const openSection = [];
  let inOpenQuestions = false;

  for (const line of lines) {
    if (/^##\s+Open Questions\s*$/i.test(line.trim())) {
      inOpenQuestions = true;
      continue;
    }
    if (inOpenQuestions && /^##\s+/.test(line.trim())) break;
    if (inOpenQuestions) openSection.push(line.trim());
  }

  return openSection
    .filter((line) => /^[-*]\s+\S/.test(line) || /^\d+\.\s+\S/.test(line) || /\?$/.test(line))
    .filter((line) => !/^no open questions/i.test(line.replace(/^[-*]\s+|^\d+\.\s+/, "")))
    .slice(0, 20);
}

async function readOpenQuestions(readTextFile, projectRoot) {
  try {
    const file = await readTextFile(projectRoot, "human_open_questions.md");
    return extractOpenQuestions(file.content);
  } catch {
    return [];
  }
}

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
  readProjectUiState,
  readTextFile,
  resolveCursorApiKey,
  httpError,
  writeProjectUiState,
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

  app.get("/api/projects/:projectSlug/ui-state", async (request, response, next) => {
    try {
      response.json(await readProjectUiState(request.project.path));
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/projects/:projectSlug/ui-state", async (request, response, next) => {
    try {
      const body = parseRequestBody(updateProjectUiStateBodySchema, request.body, httpError);
      if (body.lastRoute && !body.lastRoute.hash.startsWith(`#/p/${encodeURIComponent(request.project.slug)}/`)) {
        throw httpError("Last route must belong to the selected project.", 400, "invalid_project_route");
      }

      response.json(await writeProjectUiState(request.project.path, body));
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
      const openQuestions = await readOpenQuestions(readTextFile, project.path);

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
        openQuestions,
        openQuestionsCount: openQuestions.length,
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
