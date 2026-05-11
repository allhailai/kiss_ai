import express from "express";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { registerChatRoutes } from "./chatRoutes.js";
import { registerFileRoutes } from "./fileRoutes.js";
import { registerProjectRoutes } from "./projectRoutes.js";
import { apiErrorHandler, httpError } from "../services/httpErrors.js";
import { createProjectFileService } from "../services/projectFiles.js";
import { createProjectService } from "../services/projects.js";

async function withServer(app, test) {
  const server = await new Promise((resolve) => {
    const nextServer = app.listen(0, "127.0.0.1", () => resolve(nextServer));
  });
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    return await test(baseUrl);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

function fileExists(absolutePath) {
  return fs
    .access(absolutePath)
    .then(() => true)
    .catch(() => false);
}

function isPathInsideRoot(root, candidate) {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

function createFileService(webRoot) {
  return createProjectFileService({
    WEB_ROOT: webRoot,
    MAX_FILE_BYTES: 1024 * 1024,
    MAX_UPLOAD_BYTES: 1024 * 1024,
    MAX_SEARCH_RESULTS: 10,
    humanFiles: new Map([["human_goal_requirements.md", { kind: "human", editable: true, annotation: false }]]),
    hashText: (value) => `hash:${String(value).length}`,
    humanizePathSegment: (value) => value,
    httpError,
  });
}

describe("API routes", () => {
  it("returns the structured API error shape for route-level path escapes", async () => {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kiss-ai-route-project-"));
    const service = createFileService(projectRoot);
    const app = express();

    app.use((_request, _response, next) => {
      _request.project = { slug: "demo", path: projectRoot };
      next();
    });
    registerFileRoutes(app, {
      deleteHumanInputFile: service.deleteHumanInputFile,
      gitFileDiff: service.gitFileDiff,
      humanFiles: new Map([["human_goal_requirements.md", { kind: "human", editable: true, annotation: false }]]),
      httpError,
      listMarkdownFiles: service.listMarkdownFiles,
      listProjectFiles: service.listProjectFiles,
      readTextFile: service.readTextFile,
      restoreFileFromHead: service.restoreFileFromHead,
      searchFiles: service.searchFiles,
      treeRoots: new Map(),
      uploadHumanInputFiles: service.uploadHumanInputFiles,
      writeTextFile: service.writeTextFile,
    });
    app.use(apiErrorHandler);

    await withServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/projects/demo/file?path=../secret.md`);
      await expect(response.json()).resolves.toEqual({
        code: "path_escape",
        error: "Path escapes the project root.",
      });
      expect(response.status).toBe(403);
    });
  });

  it("attaches valid projects and rejects invalid slugs", async () => {
    const projectsRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kiss-ai-projects-root-"));
    const projectRoot = path.join(projectsRoot, "demo");
    await fs.mkdir(projectRoot);
    await fs.writeFile(path.join(projectRoot, "human_goal_requirements.md"), "Goal\n", "utf8");

    const projectService = createProjectService({
      PROJECTS_ROOT: projectsRoot,
      FRAMEWORK_ROOT: projectsRoot,
      reservedProjectDirectories: new Set(),
      projectSlugPattern: /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/,
      displayProjectName: (projectName, projectSlug) => projectName || projectSlug,
      execFileText: async () => "",
      fileExists,
      httpError,
      isPathInsideRoot,
      readProjectHarness: async () => ({ project_name: "Demo Project" }),
    });
    const app = express();
    app.use("/api/projects/:projectSlug", projectService.attachProject);
    app.get("/api/projects/:projectSlug/ping", (request, response) => {
      response.json({ project: request.project });
    });
    app.use(apiErrorHandler);

    await withServer(app, async (baseUrl) => {
      const valid = await fetch(`${baseUrl}/api/projects/demo/ping`);
      await expect(valid.json()).resolves.toMatchObject({
        project: { name: "Demo Project", slug: "demo" },
      });
      expect(valid.status).toBe(200);

      const invalid = await fetch(`${baseUrl}/api/projects/bad%24slug/ping`);
      await expect(invalid.json()).resolves.toMatchObject({
        code: "invalid_project_slug",
      });
      expect(invalid.status).toBe(400);
    });
  });

  it("validates project creation bodies at the route boundary", async () => {
    const app = express();
    app.use(express.json());
    registerProjectRoutes(app, {
      PROJECTS_ROOT: "/tmp/projects",
      buildLogTabState: async () => ({}),
      createProjectFromTemplate: async () => ({ slug: "demo", name: "Demo", path: "/tmp/projects/demo", setupStatus: "initialized" }),
      discoverProjects: async () => [],
      displayProjectName: (projectName, projectSlug) => projectName || projectSlug,
      getHumanAttentionItems: () => [],
      gitStatus: async () => [],
      httpError,
      listCursorModels: async () => [],
      listMarkdownFiles: async () => [],
      pickRebuildModelId: () => null,
      readProjectJson: async () => ({}),
      resolveCursorApiKey: async () => ({ available: false, source: null, warnings: [] }),
    });
    app.use(apiErrorHandler);

    await withServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "" }),
      });

      await expect(response.json()).resolves.toMatchObject({ code: "invalid_request" });
      expect(response.status).toBe(400);
    });
  });

  it("sends an initial chat SSE snapshot with the conversation payload", async () => {
    const app = express();
    app.use("/api/projects/:projectSlug", (request, _response, next) => {
      request.project = { slug: request.params.projectSlug, path: "/tmp/demo" };
      next();
    });
    registerChatRoutes(app, {
      createConversation: async () => ({}),
      editChatMessage: async () => ({}),
      httpError,
      listConversations: async () => ({ conversations: [] }),
      readConversation: async () => ({ id: "conv_1", messages: [], projectSlug: "demo", version: 1 }),
      sendChatMessage: async () => ({}),
      subscribeToConversation: () => () => undefined,
      updateConversation: async () => ({}),
    });
    app.use(apiErrorHandler);

    await withServer(app, async (baseUrl) => {
      const controller = new AbortController();
      const response = await fetch(`${baseUrl}/api/projects/demo/conversations/conv_1/events`, { signal: controller.signal });
      const reader = response.body.getReader();
      const chunk = await reader.read();
      controller.abort();

      const text = new TextDecoder().decode(chunk.value);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/event-stream");
      expect(text).toContain("event: snapshot");
      expect(text).toContain('"type":"snapshot"');
      expect(text).toContain('"conversation":{"id":"conv_1"');
    });
  });
});
