import {
  filePathBodySchema,
  filePathQuerySchema,
  parseRequestBody,
  parseRequestParams,
  parseRequestQuery,
  searchFilesQuerySchema,
  treeSectionParamsSchema,
  uploadHumanInputsBodySchema,
  writeFileBodySchema,
} from "./requestSchemas.js";

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

      response.json({
        files: section === "human" ? await listProjectFiles(project.path, config.root) : await listMarkdownFiles(project.path, config.root, config.kind, config.editable, config.annotation),
      });
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

  app.delete("/api/projects/:projectSlug/inputs-human/file", async (request, response, next) => {
    try {
      const body = parseRequestBody(filePathBodySchema, request.body, httpError);
      response.json(await deleteHumanInputFile(request.project.path, body.path));
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
