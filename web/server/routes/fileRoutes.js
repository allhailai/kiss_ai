import {
  createHumanInputFolderBodySchema,
  createHumanInputTextFileBodySchema,
  deleteHumanInputFolderBodySchema,
  filePathBodySchema,
  filePathQuerySchema,
  moveHumanInputFileBodySchema,
  parseRequestBody,
  parseRequestParams,
  parseRequestQuery,
  searchFilesQuerySchema,
  treeSectionParamsSchema,
  uploadHumanInputsBodySchema,
  writeFileBodySchema,
} from "./requestSchemas.js";

export function registerFileRoutes(app, {
  createHumanInputFolder,
  createHumanInputTextFile,
  deleteHumanInputFile,
  deleteHumanInputFolder,
  gitFileDiff,
  humanFiles,
  httpError,
  listMarkdownFiles,
  listProjectFiles,
  moveHumanInputFile,
  readTextFile,
  restoreFileFromHead,
  searchFiles: searchPathFiles,
  treeRoots,
  uploadHumanInputFiles,
  writeTextFile,
}) {
  const searchProjectFiles = async (request, response, next) => {
    try {
      const query = parseRequestQuery(searchFilesQuerySchema, request.query, httpError);
      response.json({ files: await searchPathFiles(request.project.path, query.q) });
    } catch (error) {
      next(error);
    }
  };

  app.get("/api/projects/:projectSlug/tree/:section", async (request, response, next) => {
    try {
      const project = request.project;
      const { section } = parseRequestParams(treeSectionParamsSchema, request.params, httpError);

      if (section === "requirements") {
        response.json({
          files: [...humanFiles.entries()]
            .filter(([, meta]) => meta.kind !== "design")
            .map(([file, meta]) => ({
              path: file,
              name: file,
              chatContextReadable: true,
              previewable: true,
              ...meta,
            })),
        });
        return;
      }

      const config = treeRoots.get(section);
      if (!config) throw httpError("Unknown tree section.", 404, "unknown_tree_section");

      if (section === "human") {
        const result = await listProjectFiles(project.path, config.root);
        response.json({ files: result.files, emptyDirectories: result.emptyDirectories });
      } else {
        response.json({
          files: await listMarkdownFiles(project.path, config.root, config.kind, config.editable, config.annotation),
        });
      }
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/projects/:projectSlug/inputs-human/upload", async (request, response, next) => {
    try {
      const body = parseRequestBody(uploadHumanInputsBodySchema, request.body, httpError);
      response.status(201).json(await uploadHumanInputFiles(request.project.path, body.files));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/projects/:projectSlug/inputs-human/create-text", async (request, response, next) => {
    try {
      const body = parseRequestBody(createHumanInputTextFileBodySchema, request.body, httpError);
      response.status(201).json(await createHumanInputTextFile(request.project.path, body.name, body.content, body.folder));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/projects/:projectSlug/inputs-human/create-folder", async (request, response, next) => {
    try {
      const body = parseRequestBody(createHumanInputFolderBodySchema, request.body, httpError);
      response.status(201).json(await createHumanInputFolder(request.project.path, body.name));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/projects/:projectSlug/inputs-human/move", async (request, response, next) => {
    try {
      const body = parseRequestBody(moveHumanInputFileBodySchema, request.body, httpError);
      response.json(await moveHumanInputFile(request.project.path, body.sourcePath, body.targetFolder));
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/projects/:projectSlug/inputs-human/file", async (request, response, next) => {
    try {
      const body = parseRequestBody(filePathBodySchema, request.body, httpError);
      response.json(await deleteHumanInputFile(request.project.path, body.path));
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/projects/:projectSlug/inputs-human/folder", async (request, response, next) => {
    try {
      const body = parseRequestBody(deleteHumanInputFolderBodySchema, request.body, httpError);
      response.json(await deleteHumanInputFolder(request.project.path, body.folder));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/projects/:projectSlug/search/files", searchProjectFiles);
  app.get("/api/projects/:projectSlug/search/paths", searchProjectFiles);

  app.get("/api/projects/:projectSlug/file", async (request, response, next) => {
    try {
      const query = parseRequestQuery(filePathQuerySchema, request.query, httpError);
      response.json(await readTextFile(request.project.path, query.path));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/projects/:projectSlug/file/diff", async (request, response, next) => {
    try {
      const query = parseRequestQuery(filePathQuerySchema, request.query, httpError);
      response.json(await gitFileDiff(request.project.path, query.path));
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/projects/:projectSlug/file", async (request, response, next) => {
    try {
      const body = parseRequestBody(writeFileBodySchema, request.body, httpError);
      response.json(await writeTextFile(request.project.path, body.path, body.content, { expectedContentHash: body.expectedContentHash }));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/projects/:projectSlug/file/revert", async (request, response, next) => {
    try {
      const body = parseRequestBody(filePathBodySchema, request.body, httpError);
      response.json(await restoreFileFromHead(request.project.path, body.path));
    } catch (error) {
      next(error);
    }
  });
}
