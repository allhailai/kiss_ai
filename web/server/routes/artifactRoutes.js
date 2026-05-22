import fs from "node:fs/promises";
import path from "node:path";
import {
  listArtifactSpecs,
  readArtifactSpec,
  writeArtifactSpec,
  deleteArtifactSpec,
  getArtifactBuildPath,
  slugifyArtifactName,
  ensureArtifactDirs,
} from "../services/artifactService.js";

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
      const { name, frontmatter = {}, body = "" } = request.body || {};
      if (!name) return next(httpError("Artifact name is required.", 400, "artifact_name_required"));

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
      const { frontmatter, body } = request.body || {};
      if (!frontmatter && body === undefined) {
        return next(httpError("Provide frontmatter and/or body to update.", 400, "artifact_update_empty"));
      }

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
      const modelId = request.body?.modelId ?? null;
      const result = await startArtifactBuild(request.project, request.params.artifactSlug, modelId);
      response.json(result);
    } catch (error) {
      next(error);
    }
  });

  // Serve built artifact HTML
  app.get("/api/projects/:projectSlug/artifacts/:artifactSlug/preview", async (request, response, next) => {
    try {
      const buildDir = getArtifactBuildPath(request.project.path, request.params.artifactSlug);
      const htmlPath = path.join(buildDir, "index.html");

      try {
        await fs.access(htmlPath);
      } catch {
        return next(httpError("Artifact has not been built yet.", 404, "artifact_not_built"));
      }

      const html = await fs.readFile(htmlPath, "utf8");
      response.type("html").send(html);
    } catch (error) {
      next(error);
    }
  });
}
