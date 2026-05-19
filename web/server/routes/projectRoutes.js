import { buildLogQuerySchema, createProjectBodySchema, parseRequestBody, parseRequestQuery, updateProjectUiStateBodySchema } from "./requestSchemas.js";
import { readQuestions, answerQuestion, getQuestionCounts } from "../services/questionsService.js";

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
  // Try v2 questions.md first, then fall back to v1 human_open_questions.md
  for (const questionsPath of ["questions.md", "human_open_questions.md"]) {
    try {
      const file = await readTextFile(projectRoot, questionsPath);
      return extractOpenQuestions(file.content);
    } catch {
      // try next
    }
  }
  return [];
}

export function registerProjectRoutes(app, {
  PROJECTS_ROOT,
  assistQuestion,
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
      // Try v2 manifest first, fall back to v1 harness-state
      const manifest = await readProjectJson(project.path, ".build/manifest.json", null);
      const harness = manifest ? {} : await readProjectJson(project.path, ".harness-state.json", {});
      const cursorApiKey = await resolveCursorApiKey();
      const humanAttentionItems = getHumanAttentionItems(harness);
      const questionCounts = await getQuestionCounts(project.path);

      response.json({
        projectSlug: manifest?.project_slug ?? harness.project_slug ?? project.slug,
        projectName: displayProjectName(manifest?.project_name ?? harness.project_name ?? project.name, project.slug),
        setupStatus: manifest ? (manifest.last_build ? "built" : "initialized") : (harness.setup?.status ?? "unknown"),
        setupInitializedAt: manifest?.created_at ?? harness.setup?.initialized_at ?? null,
        lastRunAt: manifest?.last_build?.finished_at ?? harness.last_run_at ?? null,
        lastSuccessfulRunAt: manifest?.last_build?.finished_at ?? harness.last_successful_run_at ?? null,
        scalingMode: harness.scaling_assessment?.selected_mode ?? null,
        rebuildStatus: harness.rebuild_scope?.status ?? null,
        lintStatus: harness.last_lint?.status ?? null,
        unresolvedReviewItems: harness.last_annotation_scan?.unresolved_review_items ?? [],
        blockedArtifacts: harness.rebuild_scope?.blocked_artifacts ?? [],
        staleOutputs: harness.rebuild_scope?.outputs_marked_stale ?? [],
        humanAttentionItems,
        humanAttentionCount: humanAttentionItems.length,
        openQuestionsCount: questionCounts.openQuestionsCount,
        blockingQuestionsCount: questionCounts.blockingQuestionsCount,
        totalQuestionsCount: questionCounts.totalQuestionsCount,
        cursorApiKeyAvailable: cursorApiKey.available,
        cursorApiKeySource: cursorApiKey.source,
        cursorApiKeyWarnings: cursorApiKey.warnings,
        gitStatus: await gitStatus(project.path),
        // v2 annotation counts from manifest
        annotationCounts: manifest ? {
          feedbackApplied: manifest.feedback_applied ?? 0,
          suggestionsAdded: manifest.suggestions_added ?? 0,
          suggestionsAccepted: manifest.suggestions_accepted ?? 0,
          suggestionsDismissed: manifest.suggestions_dismissed ?? 0,
        } : null,
        buildNotes: manifest?.build_notes ?? null,
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

  // ── Questions API ──

  app.get("/api/projects/:projectSlug/questions", async (request, response, next) => {
    try {
      response.json(await readQuestions(request.project.path));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/projects/:projectSlug/questions/:questionId/answer", async (request, response, next) => {
    try {
      const { questionId } = request.params;
      const answer = request.body?.answer;

      if (!answer || typeof answer !== "string" || !answer.trim()) {
        throw httpError("Answer text is required.", 400, "missing_answer");
      }

      const updated = await answerQuestion(request.project.path, questionId, answer.trim());

      if (!updated) {
        throw httpError(`Question '${questionId}' not found.`, 404, "question_not_found");
      }

      response.json(updated);
    } catch (error) {
      next(error);
    }
  });

  // ── Question AI Assist ──

  app.post("/api/projects/:projectSlug/questions/ai-assist", async (request, response, next) => {
    try {
      const result = await assistQuestion(request.project, request.body);
      response.json(result);
    } catch (error) {
      next(error);
    }
  });
}

