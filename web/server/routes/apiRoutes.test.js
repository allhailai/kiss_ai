import express from "express";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { registerChatRoutes } from "./chatRoutes.js";
import { registerFileRoutes } from "./fileRoutes.js";
import { registerProjectRoutes } from "./projectRoutes.js";
import { registerArtifactRoutes } from "./artifactRoutes.js";

// Mock artifact services imported by registerArtifactRoutes
vi.mock("../services/artifactService.js", () => ({
  listArtifactSpecs: vi.fn(),
  listAvailableSourceFiles: vi.fn(),
  readArtifactSpec: vi.fn(),
  renameArtifact: vi.fn(),
  writeArtifactSpec: vi.fn(),
  deleteArtifactSpec: vi.fn(),
  readArtifactPreviewHtml: vi.fn(),
  slugifyArtifactName: (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
  getArtifactBuildStatus: vi.fn(),
  discoverSections: vi.fn(() => []),
  hideSectionInHtml: vi.fn(),
  unhideSectionInHtml: vi.fn(),
  listBuildVersions: vi.fn(),
  revertToBuildVersion: vi.fn(),
  revertToLatestBuild: vi.fn(),
}));

vi.mock("../services/annotationService.js", () => ({
  listAnnotations: vi.fn(),
  addAnnotation: vi.fn(),
  updateAnnotation: vi.fn(),
  deleteAnnotation: vi.fn(),
  getPendingBySection: vi.fn(),
  retryFailed: vi.fn(),
  toggleAnnotation: vi.fn(),
}));

import { readArtifactSpec, readArtifactPreviewHtml } from "../services/artifactService.js";

import { registerSystemRoutes } from "./systemRoutes.js";
import { apiErrorHandler, httpError } from "../services/httpErrors.js";
import { createProjectFileService } from "../services/projectFiles.js";
import { createProjectService } from "../services/projects.js";
import { createProjectUiStateService } from "../services/projectUiState.js";

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

function createUiStateProjectApp(projectRoot) {
  const service = createProjectUiStateService({ httpError, isPathInsideRoot });
  const app = express();

  app.use(express.json());
  app.use("/api/projects/:projectSlug", (request, _response, next) => {
    request.project = { slug: request.params.projectSlug, path: projectRoot };
    next();
  });
  registerProjectRoutes(app, {
    PROJECTS_ROOT: "/tmp/projects",
    assistQuestion: async () => ({}),
    buildLogTabState: async () => ({}),
    createProjectFromTemplate: async () => ({}),
    discoverProjects: async () => [],
    displayProjectName: (projectName, projectSlug) => projectName || projectSlug,
    getHumanAttentionItems: () => [],
    gitStatus: async () => [],
    httpError,
    listCursorModels: async () => [],
    pickRebuildModelId: () => null,
    readProjectJson: async () => ({}),
    readProjectUiState: service.readProjectUiState,
    readTextFile: async () => ({ content: "" }),
    resolveCursorApiKey: async () => ({ available: false, source: null, warnings: [] }),
    writeProjectUiState: service.writeProjectUiState,
  });
  app.use(apiErrorHandler);

  return app;
}

describe("API routes", () => {
  it("runs the kiss_ai update route", async () => {
    const app = express();
    app.use(express.json());
    registerSystemRoutes(app, {
      authMiddleware: null,
      checkKissAiUpdate: async () => ({
        status: "update_available",
        updateAvailable: true,
        localRevision: "aaa111",
        remoteRevision: "bbb222",
        upstream: "target/master",
      }),
      updateAndRestart: async () => ({}),
      updateKissAi: async () => ({
        status: "updated",
        beforeRevision: "aaa111",
        afterRevision: "bbb222",
        pullOutput: "Updated",
        dependencyInstall: { ran: false, output: "" },
      }),
      httpError,
      KISS_AI_MODE: "standalone",
      readKeybindings: async () => ({}),
      saveCursorApiKey: async () => ({}),
      systemSettings: async () => ({ cursorApiKeyAvailable: false, cursorApiKeySource: null, cursorApiKeyWarnings: [] }),
      readPinnedProjects: async () => [],
      readProjectsViewPreference: async () => ({}),
      writePinnedProjects: async () => ({}),
      writeProjectsViewPreference: async () => ({}),
    });
    app.use(apiErrorHandler);

    await withServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/system/update`, { method: "POST" });

      await expect(response.json()).resolves.toMatchObject({
        status: "updated",
        afterRevision: "bbb222",
      });
      expect(response.status).toBe(200);
    });
  });

  it("runs the kiss_ai update-and-restart route", async () => {
    const app = express();
    app.use(express.json());
    registerSystemRoutes(app, {
      authMiddleware: null,
      checkKissAiUpdate: async () => ({}),
      updateAndRestart: async () => ({
        status: "updated",
        restarting: true,
        beforeRevision: "aaa111",
        afterRevision: "bbb222",
        pullOutput: "Updated",
      }),
      updateKissAi: async () => ({}),
      httpError,
      KISS_AI_MODE: "standalone",
      readKeybindings: async () => ({}),
      saveCursorApiKey: async () => ({}),
      systemSettings: async () => ({ cursorApiKeyAvailable: false, cursorApiKeySource: null, cursorApiKeyWarnings: [] }),
      readPinnedProjects: async () => [],
      readProjectsViewPreference: async () => ({}),
      writePinnedProjects: async () => ({}),
      writeProjectsViewPreference: async () => ({}),
    });
    app.use(apiErrorHandler);

    await withServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/system/update-and-restart`, { method: "POST" });

      await expect(response.json()).resolves.toMatchObject({
        status: "updated",
        restarting: true,
        afterRevision: "bbb222",
      });
      expect(response.status).toBe(200);
    });
  });

  it("runs the kiss_ai update check route", async () => {
    const app = express();
    app.use(express.json());
    registerSystemRoutes(app, {
      authMiddleware: null,
      checkKissAiUpdate: async () => ({
        status: "up_to_date",
        updateAvailable: false,
        localRevision: "aaa111",
        remoteRevision: "aaa111",
        upstream: "target/master",
      }),
      httpError,
      KISS_AI_MODE: "standalone",
      readKeybindings: async () => ({}),
      saveCursorApiKey: async () => ({}),
      systemSettings: async () => ({ cursorApiKeyAvailable: false, cursorApiKeySource: null, cursorApiKeyWarnings: [] }),
      updateAndRestart: async () => ({}),
      updateKissAi: async () => ({}),
      readPinnedProjects: async () => [],
      readProjectsViewPreference: async () => ({}),
      writePinnedProjects: async () => ({}),
      writeProjectsViewPreference: async () => ({}),
    });
    app.use(apiErrorHandler);

    await withServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/system/update/check`, { method: "POST" });

      await expect(response.json()).resolves.toMatchObject({
        status: "up_to_date",
        updateAvailable: false,
        localRevision: "aaa111",
        remoteRevision: "aaa111",
      });
      expect(response.status).toBe(200);
    });
  });

  it("reads system settings without returning API key material", async () => {
    const app = express();
    app.use(express.json());
    registerSystemRoutes(app, {
      authMiddleware: null,
      checkKissAiUpdate: async () => ({}),
      httpError,
      KISS_AI_MODE: "standalone",
      readKeybindings: async () => ({}),
      saveCursorApiKey: async () => ({}),
      systemSettings: async () => ({
        cursorApiKeyAvailable: true,
        cursorApiKeySource: "macOS Keychain item cursor_api_key",
        cursorApiKeyWarnings: [],
      }),
      updateAndRestart: async () => ({}),
      updateKissAi: async () => ({}),
      readPinnedProjects: async () => [],
      readProjectsViewPreference: async () => ({}),
      writePinnedProjects: async () => ({}),
      writeProjectsViewPreference: async () => ({}),
    });
    app.use(apiErrorHandler);

    await withServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/system/settings`);
      const body = await response.json();

      expect(body).toEqual({
        cursorApiKeyAvailable: true,
        cursorApiKeySource: "macOS Keychain item cursor_api_key",
        cursorApiKeyWarnings: [],
      });
      expect(JSON.stringify(body)).not.toContain("secret");
      expect(response.status).toBe(200);
    });
  });

  it("validates Cursor API key settings requests", async () => {
    const app = express();
    app.use(express.json());
    registerSystemRoutes(app, {
      authMiddleware: null,
      checkKissAiUpdate: async () => ({}),
      httpError,
      KISS_AI_MODE: "standalone",
      readKeybindings: async () => ({}),
      saveCursorApiKey: async (cursorApiKey) => ({
        ok: true,
        message: `saved ${cursorApiKey.length}`,
      }),
      systemSettings: async () => ({ cursorApiKeyAvailable: false, cursorApiKeySource: null, cursorApiKeyWarnings: [] }),
      updateAndRestart: async () => ({}),
      updateKissAi: async () => ({}),
      readPinnedProjects: async () => [],
      readProjectsViewPreference: async () => ({}),
      writePinnedProjects: async () => ({}),
      writeProjectsViewPreference: async () => ({}),
    });
    app.use(apiErrorHandler);

    await withServer(app, async (baseUrl) => {
      const invalid = await fetch(`${baseUrl}/api/system/settings/cursor-api-key`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cursorApiKey: "" }),
      });
      await expect(invalid.json()).resolves.toMatchObject({ code: "invalid_request" });
      expect(invalid.status).toBe(400);

      const valid = await fetch(`${baseUrl}/api/system/settings/cursor-api-key`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cursorApiKey: "cursor-secret" }),
      });
      await expect(valid.json()).resolves.toMatchObject({ ok: true, message: "saved 13" });
      expect(valid.status).toBe(200);
    });
  });

  it("returns the structured API error shape for route-level path escapes", async () => {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kiss-ai-route-project-"));
    const service = createFileService(projectRoot);
    const app = express();

    app.use((_request, _response, next) => {
      _request.project = { slug: "demo", path: projectRoot };
      next();
    });
    registerFileRoutes(app, {
      browseLocalDirs: service.browseLocalDirs,
      createHumanInputFolder: async () => ({ folder: "" }),
      createHumanInputTextFile: async () => ({ file: {} }),
      deleteHumanInputFile: service.deleteHumanInputFile,
      deleteHumanInputFolder: async () => ({ folder: "" }),
      deleteProjectFile: async () => ({}),
      deleteProjectFolder: async () => ({}),
      gitFileDiff: service.gitFileDiff,
      humanFiles: new Map([["human_goal_requirements.md", { kind: "human", editable: true, annotation: false }]]),
      httpError,
      listMarkdownFiles: service.listMarkdownFiles,
      listProjectFiles: service.listProjectFiles,
      moveHumanInputFile: async () => ({ oldPath: "", newPath: "", file: {} }),
      readTextFile: service.readTextFile,
      renameOutputFile: async () => ({}),
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
      assistQuestion: async () => ({}),
      buildLogTabState: async () => ({}),
      createProjectFromTemplate: async () => ({ slug: "demo", name: "Demo", path: "/tmp/projects/demo", setupStatus: "initialized" }),
      discoverProjects: async () => [],
      displayProjectName: (projectName, projectSlug) => projectName || projectSlug,
      getHumanAttentionItems: () => [],
      gitStatus: async () => [],
      httpError,
      listCursorModels: async () => [],
      pickRebuildModelId: () => null,
      readProjectJson: async () => ({}),
      readProjectUiState: async () => ({ version: 1 }),
      readTextFile: async () => ({ content: "" }),
      resolveCursorApiKey: async () => ({ available: false, source: null, warnings: [] }),
      writeProjectUiState: async (_projectRoot, state) => ({ version: 1, ...state }),
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

  it("reads and writes project-local UI state", async () => {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kiss-ai-ui-state-project-"));
    const app = createUiStateProjectApp(projectRoot);

    await withServer(app, async (baseUrl) => {
      const missing = await fetch(`${baseUrl}/api/projects/demo/ui-state`);
      await expect(missing.json()).resolves.toEqual({ version: 1 });
      expect(missing.status).toBe(200);

      const updated = await fetch(`${baseUrl}/api/projects/demo/ui-state`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lastRoute: { hash: "#/p/demo/requirements/human_goal_requirements.md" },
          preferredModelId: "model-a",
        }),
      });
      await expect(updated.json()).resolves.toMatchObject({
        version: 1,
        lastRoute: { hash: "#/p/demo/requirements/human_goal_requirements.md" },
        preferredModelId: "model-a",
      });
      expect(updated.status).toBe(200);

      const stateFile = JSON.parse(await fs.readFile(path.join(projectRoot, ".kiss_ai", "ui_state.json"), "utf8"));
      expect(stateFile).toMatchObject({
        lastRoute: { hash: "#/p/demo/requirements/human_goal_requirements.md" },
        preferredModelId: "model-a",
      });
    });
  });

  it("rejects invalid and corrupt project UI state", async () => {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kiss-ai-ui-state-project-"));
    const app = createUiStateProjectApp(projectRoot);

    await withServer(app, async (baseUrl) => {
      const wrongProject = await fetch(`${baseUrl}/api/projects/demo/ui-state`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lastRoute: { hash: "#/p/other/requirements/human_goal_requirements.md" } }),
      });
      await expect(wrongProject.json()).resolves.toMatchObject({ code: "invalid_project_route" });
      expect(wrongProject.status).toBe(400);

      const escapedRoute = await fetch(`${baseUrl}/api/projects/demo/ui-state`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lastRoute: { hash: "../human_goal_requirements.md" } }),
      });
      await expect(escapedRoute.json()).resolves.toMatchObject({ code: "invalid_request" });
      expect(escapedRoute.status).toBe(400);

      await fs.mkdir(path.join(projectRoot, ".kiss_ai"), { recursive: true });
      await fs.writeFile(path.join(projectRoot, ".kiss_ai", "ui_state.json"), "{not-json", "utf8");
      const corrupt = await fetch(`${baseUrl}/api/projects/demo/ui-state`);
      await expect(corrupt.json()).resolves.toMatchObject({ code: "corrupt_project_ui_state" });
      expect(corrupt.status).toBe(500);
    });
  });



  it("validates file route params and oversized write bodies at the route boundary", async () => {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kiss-ai-route-project-"));
    await fs.writeFile(path.join(projectRoot, "human_goal_requirements.md"), "Goal\n", "utf8");
    const service = createFileService(projectRoot);
    const app = express();

    app.use(express.json({ limit: "4mb" }));
    app.use((_request, _response, next) => {
      _request.project = { slug: "demo", path: projectRoot };
      next();
    });
    registerFileRoutes(app, {
      browseLocalDirs: service.browseLocalDirs,
      createHumanInputFolder: async () => ({ folder: "" }),
      createHumanInputTextFile: async () => ({ file: {} }),
      deleteHumanInputFile: service.deleteHumanInputFile,
      deleteHumanInputFolder: async () => ({ folder: "" }),
      deleteProjectFile: async () => ({}),
      deleteProjectFolder: async () => ({}),
      gitFileDiff: service.gitFileDiff,
      humanFiles: new Map([["human_goal_requirements.md", { kind: "human", editable: true, annotation: false }]]),
      httpError,
      listMarkdownFiles: service.listMarkdownFiles,
      listProjectFiles: service.listProjectFiles,
      moveHumanInputFile: async () => ({ oldPath: "", newPath: "", file: {} }),
      readTextFile: service.readTextFile,
      renameOutputFile: async () => ({}),
      restoreFileFromHead: service.restoreFileFromHead,
      searchFiles: service.searchFiles,
      treeRoots: new Map([["outputs", { root: "outputs_ai", kind: "output", editable: true, annotation: true }]]),
      uploadHumanInputFiles: service.uploadHumanInputFiles,
      writeTextFile: service.writeTextFile,
    });
    app.use(apiErrorHandler);

    await withServer(app, async (baseUrl) => {
      const invalidTree = await fetch(`${baseUrl}/api/projects/demo/tree/not-a-section`);
      await expect(invalidTree.json()).resolves.toMatchObject({ code: "invalid_request" });
      expect(invalidTree.status).toBe(400);

      const oversizedWrite = await fetch(`${baseUrl}/api/projects/demo/file`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: "human_goal_requirements.md",
          content: "x".repeat(2 * 1024 * 1024 + 1),
          expectedContentHash: "hash:5",
        }),
      });
      await expect(oversizedWrite.json()).resolves.toMatchObject({ code: "request_too_large" });
      expect(oversizedWrite.status).toBe(413);
    });
  });

  it("sends an initial chat SSE snapshot with the conversation payload", async () => {
    const app = express();
    app.use("/api/projects/:projectSlug", (request, _response, next) => {
      request.project = { slug: request.params.projectSlug, path: "/tmp/demo" };
      next();
    });
    registerChatRoutes(app, {
      applyEditProposal: async () => ({}),
      cancelChatAgent: () => ({}),
      createConversation: async () => ({}),
      editChatMessage: async () => ({}),

      httpError,
      listConversations: async () => ({ conversations: [] }),
      readConversation: async () => ({ id: "conv_1", messages: [], projectSlug: "demo", version: 1 }),
      sendChatMessage: async () => ({}),
      subscribeToConversation: () => () => undefined,
      updateConversation: async () => ({}),
      updateEditProposal: async () => ({}),
      updateMessageArtifactRenameStatus: async () => ({}),
      updateMessageFileEditStatus: async () => ({}),
      updateMessageFileRenameStatus: async () => ({}),
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

  it("matches artifact routes with slash-containing slugs (wildcards)", async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/projects/:projectSlug", (request, _response, next) => {
      request.project = { slug: request.params.projectSlug, path: "/tmp/demo" };
      next();
    });

    let lastReadSlug = null;
    let lastSectionSlug = null;

    // @ts-ignore
    vi.mocked(readArtifactSpec).mockImplementation(async (projectPath, slug) => {
      lastReadSlug = slug;
      return { frontmatter: { title: "Test Spec" }, body: "Body content" };
    });

    // @ts-ignore
    vi.mocked(readArtifactPreviewHtml).mockImplementation(async (projectPath, slug) => {
      lastSectionSlug = slug;
      return "<div>Section content</div>";
    });

    registerArtifactRoutes(app, {
      httpError,
      startArtifactBuild: async () => ({}),
      startSectionRegeneration: async () => ({}),
      startBatchSectionRegeneration: async () => ({}),
      getRebuildState: async () => ({ running: false }),
    });
    app.use(apiErrorHandler);

    await withServer(app, async (baseUrl) => {
      // 1. Test flat slug mapping
      const res1 = await fetch(`${baseUrl}/api/projects/demo/artifacts/simple-slug`);
      expect(res1.status).toBe(200);
      expect(lastReadSlug).toBe("simple-slug");

      // 2. Test slash-containing (nested) slug mapping (without percent-encoding, i.e., proxy decoded)
      const res2 = await fetch(`${baseUrl}/api/projects/demo/artifacts/outputs_ai/wiki/_index.md`);
      expect(res2.status).toBe(200);
      expect(lastReadSlug).toBe("outputs_ai/wiki/_index.md");

      // 3. Test nested section route
      const res3 = await fetch(`${baseUrl}/api/projects/demo/artifacts/outputs_ai/wiki/_index.md/sections`);
      expect(res3.status).toBe(200);
      expect(lastSectionSlug).toBe("outputs_ai/wiki/_index.md");
    });
  });
});
