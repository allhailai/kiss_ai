import {
  applyRequirementsSyncBatchBodySchema,
  applyRequirementsSyncBodySchema,
  parseRequestBody,
  proposeRequirementsSyncBodySchema,
  reviewRequirementsSyncBodySchema,
} from "./requestSchemas.js";

export function registerRequirementsSyncRoutes(app, {
  applyRequirementsSyncBatch,
  applyRequirementsSync,
  httpError,
  proposeRequirementsSync,
  recordRequirementsSyncReview,
  requirementsSyncSignals,
}) {
  app.get("/api/projects/:projectSlug/requirements-sync/signals", async (request, response, next) => {
    try {
      response.json(await requirementsSyncSignals(request.project));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/projects/:projectSlug/requirements-sync/propose", async (request, response, next) => {
    try {
      response.json(await proposeRequirementsSync(request.project, parseRequestBody(proposeRequirementsSyncBodySchema, request.body, httpError)));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/projects/:projectSlug/requirements-sync/apply", async (request, response, next) => {
    try {
      response.json(await applyRequirementsSync(request.project, parseRequestBody(applyRequirementsSyncBodySchema, request.body, httpError)));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/projects/:projectSlug/requirements-sync/apply-batch", async (request, response, next) => {
    try {
      response.json(await applyRequirementsSyncBatch(request.project, parseRequestBody(applyRequirementsSyncBatchBodySchema, request.body, httpError)));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/projects/:projectSlug/requirements-sync/review", async (request, response, next) => {
    try {
      response.json(await recordRequirementsSyncReview(request.project, parseRequestBody(reviewRequirementsSyncBodySchema, request.body, httpError)));
    } catch (error) {
      next(error);
    }
  });
}
