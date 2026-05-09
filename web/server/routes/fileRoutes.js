export function registerFileRoutes(app, {
  deleteHumanInputFile,
  gitFileDiff,
  humanFiles,
  httpError,
  listMarkdownFiles,
  listProjectFiles,
  readTextFile,
  restoreFileFromHead,
  searchFiles: searchPathFiles,
  treeRoots,
  uploadHumanInputFiles,
  writeTextFile,
}) {
  app.get("/api/projects/:projectSlug/tree/:section", async (request, response, next) => {
    try {
      const project = request.project;
      const section = request.params.section;

      if (section === "requirements") {
        response.json({
          files: [...humanFiles.entries()]
            .filter(([, meta]) => meta.kind !== "design")
            .map(([file, meta]) => ({
              path: file,
              name: file,
              ...meta,
            })),
        });
        return;
      }

      const config = treeRoots.get(section);
      if (!config) throw httpError("Unknown tree section.", 404, "unknown_tree_section");

      response.json({
        files: section === "human" ? await listProjectFiles(project.path, config.root) : await listMarkdownFiles(project.path, config.root, config.kind, config.editable, config.annotation),
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/projects/:projectSlug/inputs-human/upload", async (request, response, next) => {
    try {
      response.status(201).json(await uploadHumanInputFiles(request.project.path, request.body.files));
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/projects/:projectSlug/inputs-human/file", async (request, response, next) => {
    try {
      response.json(await deleteHumanInputFile(request.project.path, String(request.body.path ?? "")));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/projects/:projectSlug/search/paths", async (request, response, next) => {
    try {
      response.json({ files: await searchPathFiles(request.project.path, String(request.query.q ?? "")) });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/projects/:projectSlug/search/files", async (request, response, next) => {
    try {
      response.json({ files: await searchPathFiles(request.project.path, String(request.query.q ?? "")) });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/projects/:projectSlug/file", async (request, response, next) => {
    try {
      response.json(await readTextFile(request.project.path, String(request.query.path ?? "")));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/projects/:projectSlug/file/diff", async (request, response, next) => {
    try {
      response.json(await gitFileDiff(request.project.path, String(request.query.path ?? "")));
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/projects/:projectSlug/file", async (request, response, next) => {
    try {
      response.json(await writeTextFile(request.project.path, String(request.body.path ?? ""), String(request.body.content ?? "")));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/projects/:projectSlug/file/revert", async (request, response, next) => {
    try {
      response.json(await restoreFileFromHead(request.project.path, String(request.body.path ?? "")));
    } catch (error) {
      next(error);
    }
  });
}
