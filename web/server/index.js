import express from "express";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createRebuildStore } from "./agentRuns.js";
import { runCursorAgent, runCursorAgentText } from "./agentRuntimes/cursorSdk.js";
import { listen } from "./adapters/listen.js";
import { createAuthMiddleware } from "./middleware/requireAuth.js";
import { registerApiRoutes } from "./routes/apiRoutes.js";
import { registerArtifactRoutes } from "./routes/artifactRoutes.js";
import { registerAuthRoutes } from "./routes/authRoutes.js";
import { createAgentJobService } from "./services/agentJobs.js";
import { createAuthService } from "./services/auth.js";
import { createBuildLogService } from "./services/buildLogs.js";
import { getOutputStatus } from "./services/contentLedger.js";
import { createChatAgentService } from "./services/chatAgent.js";
import { createConversationService } from "./services/conversations.js";
import { createCursorModelService } from "./services/cursorModels.js";
import { createDesignIdentityService } from "./services/designIdentity.js";
import { createHarnessStateService } from "./services/harnessState.js";
import { apiErrorHandler, httpError } from "./services/httpErrors.js";
import { createKissAiUpdateService } from "./services/kissAiUpdate.js";
import { createProjectAgentLock } from "./services/projectAgentLock.js";
import { createQuestionAiAssistService } from "./services/questionAiAssist.js";
import { createProjectFileService } from "./services/projectFiles.js";
import { createProjectService } from "./services/projects.js";
import { createProjectUiStateService } from "./services/projectUiState.js";
import { createSecretStore } from "./services/secretStore.js";
import { createSettingsService } from "./services/settingsHelpers.js";
import { createSystemSettingsService } from "./services/systemSettings.js";

// ── Process-level safety net ──
// Prevent stray SDK rejections (e.g. Cursor LocalIgnoreService.init → ConnectError)
// from crashing the entire server. Build-pipeline errors should degrade gracefully,
// not terminate the Node process.
process.on("unhandledRejection", (reason) => {
  console.error("[kiss_ai UNHANDLED REJECTION] The server caught an unhandled promise rejection and will continue running.", reason);
});
process.on("uncaughtException", (error) => {
  // Log but do NOT re-throw — keep the server alive.
  // Only truly fatal errors (OOM, stack overflow) should kill the process,
  // and those bypass this handler anyway.
  console.error("[kiss_ai UNCAUGHT EXCEPTION] The server caught an uncaught exception and will continue running.", error);
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(__dirname, "..");
const HUB_ROOT = path.resolve(WEB_ROOT, "..");

// ── Load .env file (before resolving paths) ──
// Node 20's --env-file isn't used by default, so manually parse the .env
// next to the web root so symlink-based layouts resolve correctly.
try {
  const envPath = path.join(WEB_ROOT, ".env");
  const envContent = readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.+?)\s*$/);
    if (match) {
      const key = match[1];
      const val = match[2].replace(/^["']|["']$/g, "").trim();
      if (process.env[key] === undefined) {
        process.env[key] = val;
      }
    }
  }
} catch { /* .env missing — use default path resolution */ }

const PROJECTS_ROOT = path.resolve(process.env.KISS_AI_PROJECTS_ROOT ?? path.resolve(WEB_ROOT, "..", ".."));
const PORT = Number(process.env.KISS_AI_UI_PORT ?? 8787);
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const JSON_BODY_LIMIT_BYTES = Math.ceil(MAX_UPLOAD_BYTES * 1.5);
const MAX_SEARCH_RESULTS = 25;
const REBUILD_STATE_DIR = path.join(WEB_ROOT, ".runtime", "rebuild");
const FRAMEWORK_ROOT = path.resolve(process.env.KISS_AI_FRAMEWORK_ROOT ?? path.join(PROJECTS_ROOT, "_kiss_ai", "framework"));

// ── Resolve operating mode (frozen for process lifetime) ──
function resolveKissAiMode() {
  const envMode = process.env.KISS_AI_MODE?.trim().toLowerCase();
  if (envMode === "server" || envMode === "standalone") {
    console.log(`kiss_ai mode: ${envMode} (source: environment variable)`);
    return envMode;
  }
  if (envMode) {
    console.warn(`[kiss_ai warning] Invalid KISS_AI_MODE "${envMode}", falling back to standalone.`);
  }

  try {
    const settingsPath = path.join(PROJECTS_ROOT, ".kiss_ai_settings.json");
    const raw = readFileSync(settingsPath, "utf-8");
    const parsed = JSON.parse(raw);
    const fileMode = parsed?.mode?.trim().toLowerCase();
    if (fileMode === "server" || fileMode === "standalone") {
      console.log(`kiss_ai mode: ${fileMode} (source: .kiss_ai_settings.json)`);
      return fileMode;
    }
    if (fileMode) {
      console.warn(`[kiss_ai warning] Invalid mode "${fileMode}" in .kiss_ai_settings.json, falling back to standalone.`);
    }
  } catch { /* missing or malformed settings file */ }

  console.log("kiss_ai mode: standalone (source: default)");
  return "standalone";
}

const KISS_AI_MODE = resolveKissAiMode();
const warnedCursorKeyMessages = new Set();
const reservedProjectDirectories = new Set(["_kiss_ai", ".obsidian", "_archive", "_templates"]);
const projectSlugPattern = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;
const buildLogDefinitions = [
  {
    id: "build-log",
    label: "Build Log",
    path: "change_logs/builds.md",
    emptyMessage: "No build log found yet.",
  },
  {
    id: "change-log",
    label: "Change Log",
    path: "change_logs/change_logs.md",
    emptyMessage: "No change log found yet.",
  },
  {
    id: "annotation-change-log",
    label: "Annotation Log",
    path: "change_logs/annotation_change_logs.md",
    emptyMessage: "No annotation change log found yet.",
  },

  {
    id: "human-attention-queue",
    label: "Review Notes",
    path: "change_logs/human_attention_queue.md",
    emptyMessage: "No review notes found yet.",
  },
];
const buildLogDefinitionById = new Map(buildLogDefinitions.map((definition) => [definition.id, definition]));

const humanFiles = new Map([
  // v2 files
  ["project.md", { kind: "human", editable: true, annotation: false }],
  ["questions.md", { kind: "human", editable: true, annotation: false }],
  // v1 backwards compatibility
  ["human_goal_requirements.md", { kind: "human", editable: true, annotation: false }],
  ["human_input_requirements.md", { kind: "human", editable: true, annotation: false }],
  ["human_output_requirements.md", { kind: "human", editable: true, annotation: false }],
  ["human_open_questions.md", { kind: "human", editable: true, annotation: false }],
  ["human_design_identity.md", { kind: "design", editable: true, annotation: false }],
]);

const treeRoots = new Map([
  ["human", { root: "inputs_human", kind: "human", editable: false, annotation: false }],
  ["sources", { root: "sources", kind: "ai", editable: false, annotation: true }],
  ["inputs-ai", { root: "inputs_ai", kind: "ai", editable: false, annotation: true }],
  ["outputs", { root: "outputs_ai", kind: "output", editable: true, annotation: true }],
  ["logs", { root: "change_logs", kind: "log", editable: false, annotation: false }],
]);

const app = express();
app.use(express.json({ limit: JSON_BODY_LIMIT_BYTES }));

// ── Read session_expiry_days from settings ──
function readSessionExpiryDays() {
  try {
    const settingsPath = path.join(PROJECTS_ROOT, ".kiss_ai_settings.json");
    const raw = readFileSync(settingsPath, "utf-8");
    const parsed = JSON.parse(raw);
    const days = Number(parsed?.session_expiry_days);
    if (days > 0) return days;
  } catch { /* missing or malformed */ }
  return 3;
}

const SESSION_EXPIRY_DAYS = readSessionExpiryDays();

// ── Auth infrastructure (server mode only) ──
let authService = null;
let authMiddleware = null;

if (KISS_AI_MODE === "server") {
  app.set("trust proxy", 1);

  authService = createAuthService({ projectsRoot: PROJECTS_ROOT, httpError, sessionExpiryDays: SESSION_EXPIRY_DAYS });
  authMiddleware = createAuthMiddleware({ authService, sessionExpiryDays: SESSION_EXPIRY_DAYS });

  // Cookie parser + security headers (before any routes)
  app.use(authMiddleware.cookieParser);
  app.use(authMiddleware.securityHeaders);

  // Initialize auth file (first boot requires KISS_AI_ADMIN_PASSWORD)
  try {
    const adminPassword = process.env.KISS_AI_ADMIN_PASSWORD?.trim() || null;
    const result = await authService.initialize(adminPassword);
    if (result.initialized) {
      console.log("kiss_ai auth: Admin user created (first boot).");
    } else {
      console.log("kiss_ai auth: Auth file loaded.");
    }
  } catch (error) {
    console.error(`\n[kiss_ai FATAL] ${error.message}\n`);
    process.exit(1);
  }

  // Register auth routes (login, logout, me, user management)
  registerAuthRoutes(app, { authService, authMiddleware, httpError });
}

// ── Server version info (captured at startup) ──
// Registered before requireAuth so the frontend can detect mode without a session.
const SERVER_STARTED_AT = new Date().toISOString();
let SERVER_GIT_HASH = "unknown";
try {
  const { execFileSync } = await import("node:child_process");
  SERVER_GIT_HASH = execFileSync("git", ["-C", HUB_ROOT, "rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();
} catch { /* git may not be available */ }

app.get("/api/version", (_req, res) => {
  res.json({ gitHash: SERVER_GIT_HASH, startedAt: SERVER_STARTED_AT, mode: KISS_AI_MODE });
});

if (KISS_AI_MODE === "server") {
  // Protect all /api/* routes (except auth routes and /api/version registered above)
  app.use("/api", authMiddleware.requireAuth);
}



const rebuildStore = createRebuildStore({ stateDir: REBUILD_STATE_DIR, projectSlugPattern });
const {
  activeRebuilds,
  appendAssistantDelta,
  appendRunEvent,
  finishAssistantMessage,
  getRebuildState,
  setRebuildState,
  subscribe: subscribeToRebuild,
} = rebuildStore;
const projectAgentLock = createProjectAgentLock({ httpError });

function hashText(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

// Keep this behavior aligned with src/domain/files.ts for server-generated labels.
function humanizePathSegment(pathSegment) {
  const withoutExtension = pathSegment.replace(/\.[^.]+$/i, "");
  const spaced = withoutExtension
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim();

  if (!spaced) return pathSegment;

  return spaced
    .split(/\s+/)
    .map((word) => {
      const lower = word.toLowerCase();
      if (lower.length <= 3) return lower.toUpperCase();
      return `${lower.charAt(0).toUpperCase()}${lower.slice(1)}`;
    })
    .join(" ");
}

function isMachineReadableName(value) {
  return /^[a-z0-9]+([_-][a-z0-9]+)*$/i.test(value.trim());
}

function displayProjectName(projectName, projectSlug) {
  const candidate = String(projectName ?? "").trim();

  if (!candidate || isMachineReadableName(candidate)) {
    return humanizePathSegment(projectSlug);
  }

  return candidate;
}

const {
  browseLocalDirs,
  classifyPath,
  createHumanInputFolder,
  createHumanInputTextFile,
  deleteHumanInputFile,
  deleteHumanInputFolder,
  fileExists,
  gitFileDiff,
  gitFileDiffText,
  gitFileDiffTexts,
  gitStatus,
  isPathInsideRoot,
  listMarkdownFiles,
  listProjectFiles,
  moveHumanInputFile,
  projectPath,
  readProjectJson,
  readTextFile,
  renameOutputFile,
  restoreFileFromHead,
  searchFiles,
  uploadHumanInputFiles,
  writeProjectJson,
  writeTextFile,
  uploadExternalRepoZip,
  cloneExternalRepo,
} = createProjectFileService({
  WEB_ROOT,
  MAX_FILE_BYTES,
  MAX_UPLOAD_BYTES,
  MAX_SEARCH_RESULTS,
  humanFiles,
  hashText,
  humanizePathSegment,
  httpError,
});

const { buildLogTabState } = createBuildLogService({
  buildLogDefinitionById,
  buildLogDefinitions,
  humanizePathSegment,
  projectPath,
  readTextFile,
});

const { getHumanAttentionItems, readProjectHarness } = createHarnessStateService({ httpError });

const { checkKissAiUpdate, updateAndRestart, updateKissAi } = createKissAiUpdateService({
  HUB_ROOT,
  WEB_ROOT,
  PORT,
  execFileText,
  httpError,
});

const { readProjectUiState, writeProjectUiState } = createProjectUiStateService({
  httpError,
  isPathInsideRoot,
});

const { attachProject, createProjectFromTemplate, discoverProjects } = createProjectService({
  PROJECTS_ROOT,
  FRAMEWORK_ROOT,
  reservedProjectDirectories,
  projectSlugPattern,
  displayProjectName,
  execFileText,
  fileExists,
  httpError,
  isPathInsideRoot,
  readProjectHarness,
});

const secretStore = createSecretStore({ execFileText });

const { listCursorModels, pickRebuildModelId, resolveCursorApiKey } = createCursorModelService({
  WEB_ROOT,
  httpError,
  secretStore,
  warnedCursorKeyMessages,
});

const { saveCursorApiKey, systemSettings } = createSystemSettingsService({
  httpError,
  listCursorModels,
  resolveCursorApiKey,
  secretStore,
  WEB_ROOT,
});

const { lintDesignIdentity, parseDesignIdentity } = createDesignIdentityService();

const {
  appendMessage: appendConversationMessage,
  createConversation,
  editUserMessage,
  listConversations,
  notifyConversation,
  readConversation,
  subscribeToConversation,
  updateConversation,
  updateMessageArtifactRenameStatus,
  updateMessageFileEditStatus,
  updateMessageFileRenameStatus,
  writeConversation,
} = createConversationService({
  httpError,
  projectPath,
});

const { applyEditProposal, cancelChatAgent, editChatMessage, sendChatMessage, updateEditProposal } = createChatAgentService({
  appendMessage: appendConversationMessage,
  displayProjectName,
  editUserMessage,
  httpError,
  projectAgentLock,
  listCursorModels,
  gitFileDiffText,
  gitFileDiffTexts,
  notifyConversation,
  pickRebuildModelId,
  readConversation,
  readProjectJson,
  readProjectHarness,
  readTextFile,
  resolveCursorApiKey,
  runCursorAgent,
  writeConversation,
  writeProjectJson,
});
const { assistQuestion } = createQuestionAiAssistService({
  httpError,
  listCursorModels,
  pickRebuildModelId,
  projectAgentLock,
  resolveCursorApiKey,
  runCursorAgentText,
});

const { cancelAgentJob, startArtifactBuild, startBatchSectionRegeneration, startFullRebuild, startHumanAttentionResolution, startKnowledgeBuild, startOutputBuild, startRebuild, startSectionRegeneration } = createAgentJobService({
  FRAMEWORK_ROOT,
  activeRebuilds,
  appendAssistantDelta,
  appendRunEvent,
  finishAssistantMessage,
  getHumanAttentionItems,
  getRebuildState,
  httpError,
  listCursorModels,
  pickRebuildModelId,
  projectAgentLock,
  readProjectHarness,
  resolveCursorApiKey,
  runCursorAgent,
  setRebuildState,
});



function execFileText(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, options, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(String(stdout || stderr).trim());
    });
  });
}



const {
  readKeybindings,
  readPinnedProjects,
  readProjectsViewPreference,
  writePinnedProjects,
  writeProjectsViewPreference,
} = createSettingsService({ projectsRoot: PROJECTS_ROOT });

registerApiRoutes(app, {
  assistQuestion,
  authMiddleware,
  KISS_AI_MODE,
  PROJECTS_ROOT,
  attachProject,
  browseLocalDirs,
  buildLogTabState,
  checkKissAiUpdate,
  createHumanInputFolder,
  createHumanInputTextFile,
  createProjectFromTemplate,
  createConversation,
  deleteHumanInputFile,
  deleteHumanInputFolder,
  discoverProjects,
  displayProjectName,
  getHumanAttentionItems,
  getOutputStatus,
  getRebuildState,
  gitFileDiff,
  gitStatus,
  humanFiles,
  httpError,
  lintDesignIdentity,
  listConversations,
  listCursorModels,
  listMarkdownFiles,
  listProjectFiles,
  moveHumanInputFile,
  parseDesignIdentity,
  pickRebuildModelId,
  readConversation,
  readProjectJson,
  readKeybindings,
  readPinnedProjects,
  readProjectsViewPreference,
  readProjectUiState,
  readTextFile,
  renameOutputFile,
  resolveCursorApiKey,
  restoreFileFromHead,
  saveCursorApiKey,
  searchFiles,
  applyEditProposal,
  cancelChatAgent,
  editChatMessage,

  sendChatMessage,
  startFullRebuild,
  cancelAgentJob,
  startHumanAttentionResolution,
  startKnowledgeBuild,
  startOutputBuild,
  startRebuild,
  subscribeToConversation,
  subscribeToRebuild,
  systemSettings,
  treeRoots,
  updateAndRestart,
  updateConversation,
  updateEditProposal,
  updateKissAi,
  updateMessageArtifactRenameStatus,
  updateMessageFileEditStatus,
  updateMessageFileRenameStatus,
  uploadHumanInputFiles,
  writeTextFile,
  writePinnedProjects,
  writeProjectsViewPreference,
  writeProjectUiState,
  uploadExternalRepoZip,
  cloneExternalRepo,
});

registerArtifactRoutes(app, { httpError, startArtifactBuild, startSectionRegeneration, startBatchSectionRegeneration, getRebuildState });

app.use(apiErrorHandler);

// ── SPA serving (server mode only) ──
// In server mode, Express serves the built SPA from dist/.
// In standalone/dev mode, the Vite dev server handles this.
if (KISS_AI_MODE === "server") {
  const distDir = path.join(WEB_ROOT, "dist");
  app.use(express.static(distDir));

  // SPA fallback: any non-API route returns index.html
  app.get("/{*splat}", (_req, res) => {
    res.sendFile(path.join(distDir, "index.html"));
  });
}

listen(app, { port: PORT, projectsRoot: PROJECTS_ROOT, resolveCursorApiKey, mode: KISS_AI_MODE });
