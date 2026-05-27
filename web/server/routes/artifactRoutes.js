import {
  listArtifactSpecs,
  listAvailableSourceFiles,
  readArtifactSpec,
  renameArtifact,
  writeArtifactSpec,
  deleteArtifactSpec,
  readArtifactPreviewHtml,
  slugifyArtifactName,
  ensureArtifactDirs,
} from "../services/artifactService.js";
import {
  createArtifactBodySchema,
  renameArtifactBodySchema,
  updateArtifactBodySchema,
  buildArtifactBodySchema,
  parseRequestBody,
} from "./requestSchemas.js";

export function registerArtifactRoutes(app, { httpError, startArtifactBuild }) {
  // List all artifact specs + build status
  app.get("/api/projects/:projectSlug/artifacts", async (request, response, next) => {
    try {
      const specs = await listArtifactSpecs(request.project.path);
      response.json({ artifacts: specs });
    } catch (error) {
      next(error);
    }
  });

  // List available source files for the suggest-a-file UI
  app.get("/api/projects/:projectSlug/artifacts/available-sources", async (request, response, next) => {
    try {
      const files = await listAvailableSourceFiles(request.project.path);
      response.json({ files });
    } catch (error) {
      next(error);
    }
  });

  // Read a single artifact spec
  app.get("/api/projects/:projectSlug/artifacts/:artifactSlug", async (request, response, next) => {
    try {
      const spec = await readArtifactSpec(request.project.path, request.params.artifactSlug);
      response.json(spec);
    } catch (error) {
      if (error.code === "ENOENT") return next(httpError("Artifact spec not found.", 404, "artifact_not_found"));
      next(error);
    }
  });

  // Create a new artifact spec
  app.post("/api/projects/:projectSlug/artifacts", async (request, response, next) => {
    try {
      const { name, frontmatter = {}, body = "" } = parseRequestBody(createArtifactBodySchema, request.body, httpError);

      const slug = slugifyArtifactName(name);

      // Ensure slug uniqueness
      try {
        await readArtifactSpec(request.project.path, slug);
        return next(httpError(`An artifact with the slug "${slug}" already exists.`, 409, "artifact_slug_exists"));
      } catch {
        // ENOENT = doesn't exist = good, proceed
      }

      const mergedFrontmatter = { name, format: "html", lifecycle: "manual", ...frontmatter };

      const result = await writeArtifactSpec(request.project.path, slug, mergedFrontmatter, body);
      response.status(201).json(result);
    } catch (error) {
      next(error);
    }
  });

  // Update an artifact spec
  app.put("/api/projects/:projectSlug/artifacts/:artifactSlug", async (request, response, next) => {
    try {
      const { frontmatter, body } = parseRequestBody(updateArtifactBodySchema, request.body, httpError);

      // Read existing spec to merge
      let existing;
      try {
        existing = await readArtifactSpec(request.project.path, request.params.artifactSlug);
      } catch {
        return next(httpError("Artifact spec not found.", 404, "artifact_not_found"));
      }

      const mergedFrontmatter = { ...existing.frontmatter, ...frontmatter };
      const mergedBody = body !== undefined ? body : existing.body;

      const result = await writeArtifactSpec(request.project.path, request.params.artifactSlug, mergedFrontmatter, mergedBody);
      response.json(result);
    } catch (error) {
      next(error);
    }
  });

  // Delete an artifact spec
  app.delete("/api/projects/:projectSlug/artifacts/:artifactSlug", async (request, response, next) => {
    try {
      await deleteArtifactSpec(request.project.path, request.params.artifactSlug);
      response.json({ deleted: true, slug: request.params.artifactSlug });
    } catch (error) {
      if (error.code === "ENOENT") return next(httpError("Artifact spec not found.", 404, "artifact_not_found"));
      next(error);
    }
  });

  // Trigger artifact build (single)
  app.post("/api/projects/:projectSlug/artifacts/:artifactSlug/build", async (request, response, next) => {
    try {
      const { modelId: requestedModelId } = parseRequestBody(buildArtifactBodySchema, request.body || {}, httpError);
      let modelId = requestedModelId ?? null;
      // Fall back to the model saved in the artifact spec's frontmatter
      if (!modelId) {
        try {
          const spec = await readArtifactSpec(request.project.path, request.params.artifactSlug);
          modelId = spec.frontmatter.modelId ?? null;
        } catch { /* spec read failures are non-fatal here */ }
      }
      const result = await startArtifactBuild(request.project, request.params.artifactSlug, modelId);
      response.json(result);
    } catch (error) {
      next(error);
    }
  });

  // Rename an artifact (slug change)
  app.post("/api/projects/:projectSlug/artifacts/:artifactSlug/rename", async (request, response, next) => {
    try {
      const { newSlug } = parseRequestBody(renameArtifactBodySchema, request.body, httpError);
      const result = await renameArtifact(request.project.path, request.params.artifactSlug, newSlug);
      response.json({ renamed: true, ...result });
    } catch (error) {
      if (error.statusCode) return next(httpError(error.message, error.statusCode, error.code));
      next(error);
    }
  });

  // Serve built artifact HTML
  app.get("/api/projects/:projectSlug/artifacts/:artifactSlug/preview", async (request, response, next) => {
    try {
      const html = await readArtifactPreviewHtml(request.project.path, request.params.artifactSlug);
      response.type("html").send(html);
    } catch (error) {
      if (error.code === "ENOENT") return next(httpError("Artifact has not been built yet.", 404, "artifact_not_built"));
      next(error);
    }
  });
}
