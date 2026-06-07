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
  discoverSections,
  hideSectionInHtml,
  unhideSectionInHtml,
  listBuildVersions,
  revertToBuildVersion,
  revertToLatestBuild,
} from "../services/artifactService.js";
import { getAnnotationScript } from "../services/annotationScript.js";
import {
  listAnnotations,
  addAnnotation,
  updateAnnotation,
  deleteAnnotation,
  getPendingBySection,
  retryFailed,
  toggleAnnotation,
} from "../services/annotationService.js";
import {
  createArtifactBodySchema,
  renameArtifactBodySchema,
  updateArtifactBodySchema,
  buildArtifactBodySchema,
  regenerateSectionBodySchema,
  createAnnotationBodySchema,
  updateAnnotationBodySchema,
  addSectionBodySchema,
  parseRequestBody,
} from "./requestSchemas.js";

export function registerArtifactRoutes(app, { httpError, startArtifactBuild, startSectionRegeneration, startBatchSectionRegeneration, getRebuildState }) {
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

      const mergedFrontmatter = { format: "html", lifecycle: "manual", ...frontmatter };

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

  // Serve built artifact HTML (with annotation script injected)
  app.get("/api/projects/:projectSlug/artifacts/:artifactSlug/preview", async (request, response, next) => {
    try {
      let html = await readArtifactPreviewHtml(request.project.path, request.params.artifactSlug);
      // Inject the annotation script before </body> so inspection mode works
      const annotationScript = getAnnotationScript();
      if (html.includes('</body>')) {
        html = html.replace('</body>', annotationScript + '\n</body>');
      } else {
        html += annotationScript;
      }
      response.type("html").send(html);
    } catch (error) {
      if (error.code === "ENOENT") return next(httpError("Artifact has not been built yet.", 404, "artifact_not_built"));
      next(error);
    }
  });

  // ─── Section-Level Editing Routes ─────────────────────────────────────────

  // List sections discovered in the built HTML
  app.get("/api/projects/:projectSlug/artifacts/:artifactSlug/sections", async (request, response, next) => {
    try {
      const html = await readArtifactPreviewHtml(request.project.path, request.params.artifactSlug);
      const sections = discoverSections(html);
      // Also return manifest info for UI indicators (regeneratedSections, contractVersion)
      const manifest = await getArtifactBuildStatus(request.project.path, request.params.artifactSlug);
      const hiddenSectionIds = sections.filter(s => s.hidden).map(s => s.id);
      response.json({
        sections: sections.map(s => ({ id: s.id, title: s.title, hidden: s.hidden || false })),
        regeneratedSections: manifest?.regeneratedSections || [],
        regenerationCount: manifest?.regenerationCount || 0,
        contractVersion: manifest?.contractVersion || null,
        hiddenSectionIds,
      });
    } catch (error) {
      if (error.code === "ENOENT") return next(httpError("Artifact has not been built yet.", 404, "artifact_not_built"));
      next(error);
    }
  });

  // Add a new section (creates an add_section annotation)
  app.post("/api/projects/:projectSlug/artifacts/:artifactSlug/sections", async (request, response, next) => {
    try {
      const { description, afterSectionId } = parseRequestBody(addSectionBodySchema, request.body, httpError);
      const annotation = await addAnnotation(request.project.path, request.params.artifactSlug, {
        type: "add_section",
        sectionId: "__new_section__",
        sectionTitle: "New Section",
        instruction: description,
        afterSectionId: afterSectionId || null,
      }, httpError);
      response.status(201).json(annotation);
    } catch (error) {
      if (error.statusCode) return next(httpError(error.message, error.statusCode, error.code));
      next(error);
    }
  });

  // Hide (soft-delete) a section
  app.post("/api/projects/:projectSlug/artifacts/:artifactSlug/sections/:sectionId/hide", async (request, response, next) => {
    try {
      const sectionId = request.params.sectionId;
      const sections = await hideSectionInHtml(request.project.path, request.params.artifactSlug, sectionId);
      response.json({
        sections: sections.map(s => ({ id: s.id, title: s.title, hidden: s.hidden || false })),
        hiddenSectionIds: sections.filter(s => s.hidden).map(s => s.id),
      });
    } catch (error) {
      if (error.statusCode) return next(httpError(error.message, error.statusCode, error.code));
      next(error);
    }
  });

  // Unhide (restore) a section
  app.post("/api/projects/:projectSlug/artifacts/:artifactSlug/sections/:sectionId/unhide", async (request, response, next) => {
    try {
      const sectionId = request.params.sectionId;
      const sections = await unhideSectionInHtml(request.project.path, request.params.artifactSlug, sectionId);
      response.json({
        sections: sections.map(s => ({ id: s.id, title: s.title, hidden: s.hidden || false })),
        hiddenSectionIds: sections.filter(s => s.hidden).map(s => s.id),
      });
    } catch (error) {
      if (error.statusCode) return next(httpError(error.message, error.statusCode, error.code));
      next(error);
    }
  });

  // ── Build Versioning ──────────────────────────────────────────────────

  // List build version snapshots
  app.get("/api/projects/:projectSlug/artifacts/:artifactSlug/versions", async (request, response, next) => {
    try {
      const { versions, activeVersionDirName } = await listBuildVersions(request.project.path, request.params.artifactSlug);
      response.json({ versions, activeVersionDirName });
    } catch (error) {
      next(error);
    }
  });

  // Switch back to the latest build (must be before :versionDirName route)
  app.post("/api/projects/:projectSlug/artifacts/:artifactSlug/versions/latest/revert", async (request, response, next) => {
    try {
      // Guard: prevent revert while a build is in progress
      const state = await getRebuildState(request.project.slug);
      if (state.running) {
        return next(httpError('Cannot switch versions while a build is in progress.', 409, 'build_in_progress'));
      }
      await revertToLatestBuild(request.project.path, request.params.artifactSlug);
      response.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  // Revert to a previous build version
  app.post("/api/projects/:projectSlug/artifacts/:artifactSlug/versions/:versionDirName/revert", async (request, response, next) => {
    try {
      // Guard: prevent revert while a build is in progress
      const state = await getRebuildState(request.project.slug);
      if (state.running) {
        return next(httpError('Cannot switch versions while a build is in progress.', 409, 'build_in_progress'));
      }
      const result = await revertToBuildVersion(request.project.path, request.params.artifactSlug, request.params.versionDirName);
      response.json(result);
    } catch (error) {
      if (error.message?.includes('not found')) return next(httpError(error.message, 404, 'version_not_found'));
      next(error);
    }
  });

  // Regenerate a single section
  app.post("/api/projects/:projectSlug/artifacts/:artifactSlug/sections/:sectionId/regenerate", async (request, response, next) => {
    try {
      const { instruction, modelId: requestedModelId, elementContext } = parseRequestBody(regenerateSectionBodySchema, request.body, httpError);
      const sectionId = request.params.sectionId;
      // Validate sectionId matches the kebab-case contract from do_build_artifact.md
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(sectionId)) {
        return next(httpError(`Invalid section ID: "${sectionId}". Must be lowercase kebab-case.`, 400, "invalid_section_id"));
      }
      let modelId = requestedModelId ?? null;
      if (!modelId) {
        try {
          const spec = await readArtifactSpec(request.project.path, request.params.artifactSlug);
          modelId = spec.frontmatter.modelId ?? null;
        } catch { /* non-fatal */ }
      }
      const result = await startSectionRegeneration(
        request.project,
        request.params.artifactSlug,
        sectionId,
        instruction,
        modelId,
        elementContext,
      );
      response.json(result);
    } catch (error) {
      if (error.statusCode) return next(httpError(error.message, error.statusCode, error.code));
      next(error);
    }
  });

  // ─── Annotation Routes ──────────────────────────────────────────────────────

  // List all annotations for an artifact
  app.get("/api/projects/:projectSlug/artifacts/:artifactSlug/annotations", async (request, response, next) => {
    try {
      const annotations = await listAnnotations(request.project.path, request.params.artifactSlug);
      response.json({ annotations });
    } catch (error) {
      next(error);
    }
  });

  // Add an annotation
  app.post("/api/projects/:projectSlug/artifacts/:artifactSlug/annotations", async (request, response, next) => {
    try {
      const data = parseRequestBody(createAnnotationBodySchema, request.body, httpError);
      const annotation = await addAnnotation(request.project.path, request.params.artifactSlug, data, httpError);
      response.status(201).json(annotation);
    } catch (error) {
      if (error.statusCode) return next(httpError(error.message, error.statusCode, error.code));
      next(error);
    }
  });

  // Update an annotation
  app.put("/api/projects/:projectSlug/artifacts/:artifactSlug/annotations/:annotationId", async (request, response, next) => {
    try {
      const updates = parseRequestBody(updateAnnotationBodySchema, request.body, httpError);
      const annotation = await updateAnnotation(request.project.path, request.params.artifactSlug, request.params.annotationId, updates, httpError);
      response.json(annotation);
    } catch (error) {
      if (error.statusCode) return next(httpError(error.message, error.statusCode, error.code));
      next(error);
    }
  });

  // Delete an annotation
  app.delete("/api/projects/:projectSlug/artifacts/:artifactSlug/annotations/:annotationId", async (request, response, next) => {
    try {
      await deleteAnnotation(request.project.path, request.params.artifactSlug, request.params.annotationId, httpError);
      response.json({ ok: true });
    } catch (error) {
      if (error.statusCode) return next(httpError(error.message, error.statusCode, error.code));
      next(error);
    }
  });

  // Apply all pending annotations (batch section regeneration)
  app.post("/api/projects/:projectSlug/artifacts/:artifactSlug/annotations/apply", async (request, response, next) => {
    try {
      const sectionGroups = await getPendingBySection(request.project.path, request.params.artifactSlug);
      if (sectionGroups.length === 0) {
        return next(httpError("No pending annotations to apply.", 422, "no_pending_annotations"));
      }

      // Determine model from spec
      let modelId = null;
      try {
        const spec = await readArtifactSpec(request.project.path, request.params.artifactSlug);
        modelId = spec.frontmatter.modelId ?? null;
      } catch { /* non-fatal */ }

      const result = await startBatchSectionRegeneration(
        request.project,
        request.params.artifactSlug,
        sectionGroups,
        modelId,
      );
      response.json(result);
    } catch (error) {
      if (error.statusCode) return next(httpError(error.message, error.statusCode, error.code));
      next(error);
    }
  });

  // Retry all failed annotations (reset to pending)
  app.post("/api/projects/:projectSlug/artifacts/:artifactSlug/annotations/retry", async (request, response, next) => {
    try {
      const count = await retryFailed(request.project.path, request.params.artifactSlug);
      response.json({ retriedCount: count });
    } catch (error) {
      next(error);
    }
  });

  // Toggle annotation status (pending ↔ applied/failed)
  app.post("/api/projects/:projectSlug/artifacts/:artifactSlug/annotations/:annotationId/toggle", async (request, response, next) => {
    try {
      const annotation = await toggleAnnotation(request.project.path, request.params.artifactSlug, request.params.annotationId, httpError);
      response.json(annotation);
    } catch (error) {
      if (error.statusCode) return next(httpError(error.message, error.statusCode, error.code));
      next(error);
    }
  });
}
