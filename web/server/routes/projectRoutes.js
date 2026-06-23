import { buildLogQuerySchema, createProjectBodySchema, parseRequestBody, parseRequestQuery, updateProjectUiStateBodySchema } from "./requestSchemas.js";
import { readQuestions, answerQuestion, getQuestionCounts, deleteQuestion } from "../services/questionsService.js";
import { readFailedSources, deleteFailedSource } from "../services/failedSources.js";

import { readTopics, resolveTopic, updateTopic, setDisposition, getTopicCounts, toggleDeepenQueue, queueAllShallowForDeepen, getDeepenLog, createTopic } from "../services/topicsService.js";



import { getProjectStatus } from "../services/projectStatus.js";

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
  uploadExternalRepoZip,
  cloneExternalRepo,
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

  app.get("/api/projects/:projectSlug/export", async (request, response, next) => {
    try {
      const AdmZip = (await import("adm-zip")).default;
      const zip = new AdmZip();
      zip.addLocalFolder(request.project.path);
      const buffer = zip.toBuffer();
      
      response.set("Content-Type", "application/zip");
      response.set("Content-Disposition", `attachment; filename="${request.project.slug}.zip"`);
      response.send(buffer);
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
      const status = await getProjectStatus({
        project: request.project,
        readProjectJson,
        resolveCursorApiKey,
        getHumanAttentionItems,
        getQuestionCounts,
        getTopicCounts,
        gitStatus,
        displayProjectName,
      });
      response.json(status);
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

  app.delete("/api/projects/:projectSlug/questions/:questionId", async (request, response, next) => {
    try {
      const { questionId } = request.params;
      const success = await deleteQuestion(request.project.path, questionId);

      if (!success) {
        throw httpError(`Question '${questionId}' not found.`, 404, "question_not_found");
      }

      response.json({ success: true, deletedQuestionId: questionId });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/projects/:projectSlug/failed-sources", async (request, response, next) => {
    try {
      const failedSources = await readFailedSources(request.project.path);
      response.json({ failedSources });
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/projects/:projectSlug/failed-sources/:id", async (request, response, next) => {
    try {
      const { id } = request.params;
      const success = await deleteFailedSource(request.project.path, id);

      if (!success) {
        throw httpError(`Failed source '${id}' not found.`, 404, "failed_source_not_found");
      }

      response.json({ success: true, deletedFailedSourceId: id });
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



  // ── Topics API ──

  app.get("/api/projects/:projectSlug/topics", async (request, response, next) => {
    try {
      response.json(await readTopics(request.project.path));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/projects/:projectSlug/topics/create", async (request, response, next) => {
    try {
      const label = request.body?.label;
      const justification = request.body?.justification || null;
      const conversationId = request.body?.conversationId || null;
      const force = Boolean(request.body?.force);

      if (!label || typeof label !== "string" || !label.trim()) {
        throw httpError("Topic label is required.", 400, "missing_label");
      }

      const result = await createTopic(request.project.path, { label, justification, conversationId, force });

      if (result.error) {
        throw httpError(result.error, 400, "create_topic_error");
      }

      response.status(result.created ? 201 : 200).json(result);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/projects/:projectSlug/topics/:topicId/resolve", async (request, response, next) => {
    try {
      const { topicId } = request.params;
      const action = request.body?.action;

      if (!action || (action !== "accept" && action !== "dismiss" && action !== "deprecate")) {
        throw httpError("Action must be 'accept', 'dismiss', or 'deprecate'.", 400, "invalid_action");
      }

      const options = {
        reason: request.body?.reason,
        merged_into: request.body?.merged_into,
        notes: request.body?.notes,
      };

      const updated = await resolveTopic(request.project.path, topicId, action, options);

      if (!updated) {
        throw httpError("Topic '" + topicId + "' not found.", 404, "topic_not_found");
      }

      response.json(updated);
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/projects/:projectSlug/topics/:topicId", async (request, response, next) => {
    try {
      const { topicId } = request.params;
      const updates = {};

      if (request.body?.label !== undefined) updates.label = String(request.body.label).trim();
      if (request.body?.confidence !== undefined) {
        if (request.body.confidence !== "high" && request.body.confidence !== "low") {
          throw httpError("Confidence must be 'high' or 'low'.", 400, "invalid_confidence");
        }
        updates.confidence = request.body.confidence;
      }
      if (request.body?.details !== undefined) {
        updates.details = request.body.details === null ? null : String(request.body.details).trim() || null;
      }

      if (Object.keys(updates).length === 0) {
        throw httpError("No valid fields to update. Provide 'label', 'confidence', and/or 'details'.", 400, "no_updates");
      }

      const updated = await updateTopic(request.project.path, topicId, updates);

      if (!updated) {
        throw httpError("Topic '" + topicId + "' not found.", 404, "topic_not_found");
      }

      response.json(updated);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/projects/:projectSlug/topics/:topicId/disposition", async (request, response, next) => {
    try {
      const { topicId } = request.params;
      const disposition = request.body?.disposition === undefined ? undefined : request.body.disposition;

      if (disposition !== "parked" && disposition !== "settled" && disposition !== null) {
        throw httpError("Disposition must be 'parked', 'settled', or null (to resume).", 400, "invalid_disposition");
      }

      const options = { note: request.body?.note };
      const updated = await setDisposition(request.project.path, topicId, disposition, options);

      if (!updated) {
        throw httpError("Topic '" + topicId + "' not found.", 404, "topic_not_found");
      }

      response.json(updated);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/projects/:projectSlug/topics/:topicId/queue-deepen", async (request, response, next) => {
    try {
      const { topicId } = request.params;
      const updated = await toggleDeepenQueue(request.project.path, topicId);

      if (!updated) {
        throw httpError("Topic '" + topicId + "' not found or cannot be queued (must be active, not parked/settled/deprecated/seed).", 400, "cannot_queue_topic");
      }

      response.json(updated);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/projects/:projectSlug/topics/queue-all-shallow", async (request, response, next) => {
    try {
      const result = await queueAllShallowForDeepen(request.project.path);
      response.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/projects/:projectSlug/topics/deepen-log", async (request, response, next) => {
    try {
      const log = await getDeepenLog(request.project.path);
      response.json({ entries: log });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/projects/:projectSlug/external-repos/upload", async (request, response, next) => {
    try {
      const { name, contentBase64 } = request.body || {};
      if (!name || !contentBase64) {
        throw httpError("Repository name and ZIP content are required.", 400, "bad_request");
      }

      const buffer = Buffer.from(contentBase64, "base64");
      const result = await uploadExternalRepoZip(request.project.path, name, buffer);
      response.json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/projects/:projectSlug/external-repos/clone", async (request, response, next) => {
    try {
      const { name, url } = request.body || {};
      if (!name || !url) {
        throw httpError("Repository name and Git URL are required.", 400, "bad_request");
      }

      const result = await cloneExternalRepo(request.project.path, name, url);
      response.json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  });
}

