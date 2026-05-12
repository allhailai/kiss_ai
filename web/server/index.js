import express from "express";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createRebuildStore } from "./agentRuns.js";
import { runCursorAgent } from "./agentRuntimes/cursorSdk.js";
import { listen } from "./adapters/listen.js";
import { registerApiRoutes } from "./routes/apiRoutes.js";
import { createAgentJobService } from "./services/agentJobs.js";
import { createBuildLogService } from "./services/buildLogs.js";
import { createChatAgentService } from "./services/chatAgent.js";
import { createConversationService } from "./services/conversations.js";
import { createCursorModelService } from "./services/cursorModels.js";
import { createDesignIdentityService } from "./services/designIdentity.js";
import { createHarnessStateService } from "./services/harnessState.js";
import { apiErrorHandler, httpError } from "./services/httpErrors.js";
import { createProjectAgentLock } from "./services/projectAgentLock.js";
import { createProjectFileService } from "./services/projectFiles.js";
import { createProjectService } from "./services/projects.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(__dirname, "..");
const PROJECTS_ROOT = path.resolve(process.env.KISS_AI_PROJECTS_ROOT ?? path.resolve(WEB_ROOT, "..", ".."));
const PORT = Number(process.env.KISS_AI_UI_PORT ?? 8787);
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const JSON_BODY_LIMIT_BYTES = Math.ceil(MAX_UPLOAD_BYTES * 1.5);
const MAX_SEARCH_RESULTS = 25;
const REBUILD_STATE_DIR = path.join(WEB_ROOT, ".runtime", "rebuild");
const FRAMEWORK_ROOT = path.resolve(process.env.KISS_AI_FRAMEWORK_ROOT ?? path.join(PROJECTS_ROOT, "_kiss_ai", "framework"));
const warnedCursorKeyMessages = new Set();
const reservedProjectDirectories = new Set(["_kiss_ai", ".obsidian", "_archive", "_templates"]);
const projectSlugPattern = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;
const buildLogDefinitions = [
  {
    id: "build-summary",
    label: "Build Summary",
    kind: "summary",
    emptyMessage: "No build summaries found in change_logs/summaries/ yet.",
  },
  {
    id: "change-log",
    label: "Change Log",
    path: "change_logs/change_logs.md",
    emptyMessage: "No change log found yet.",
  },
  {
    id: "annotation-change-log",
    label: "Annotation Change Log",
    path: "change_logs/annotation_change_logs.md",
    emptyMessage: "No annotation change log found yet.",
  },
  {
    id: "human-attention-queue",
    label: "Human Attention Queue",
    path: "change_logs/human_attention_queue.md",
    emptyMessage: "No human attention queue found yet.",
  },
];
const buildLogDefinitionById = new Map(buildLogDefinitions.map((definition) => [definition.id, definition]));

const humanFiles = new Map([
  ["human_goal_requirements.md", { kind: "human", editable: true, annotation: false }],
  ["human_input_requirements.md", { kind: "human", editable: true, annotation: false }],
  ["human_output_requirements.md", { kind: "human", editable: true, annotation: false }],
  ["human_open_questions.md", { kind: "human", editable: true, annotation: false }],
  ["human_design_identity.md", { kind: "design", editable: true, annotation: false }],
]);

const treeRoots = new Map([
  ["human", { root: "inputs_human", kind: "human", editable: false, annotation: false }],
  ["inputs-ai", { root: "inputs_ai", kind: "ai", editable: true, annotation: true }],
  ["outputs", { root: "outputs_ai", kind: "output", editable: true, annotation: true }],
  ["logs", { root: "change_logs", kind: "log", editable: false, annotation: false }],
]);

const app = express();
app.use(express.json({ limit: JSON_BODY_LIMIT_BYTES }));

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
  classifyPath,
  deleteHumanInputFile,
  fileExists,
  gitFileDiff,
  gitFileDiffText,
  gitStatus,
  isPathInsideRoot,
  listMarkdownFiles,
  listProjectFiles,
  projectPath,
  readProjectJson,
  readTextFile,
  restoreFileFromHead,
  searchFiles,
  uploadHumanInputFiles,
  writeTextFile,
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

const { listCursorModels, pickRebuildModelId, resolveCursorApiKey } = createCursorModelService({
  WEB_ROOT,
  httpError,
  warnedCursorKeyMessages,
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
  writeConversation,
} = createConversationService({
  httpError,
  projectPath,
});

const { applyEditProposal, editChatMessage, generateEditProposal, sendChatMessage, updateEditProposal } = createChatAgentService({
  appendMessage: appendConversationMessage,
  displayProjectName,
  editUserMessage,
  httpError,
  projectAgentLock,
  listCursorModels,
  gitFileDiffText,
  notifyConversation,
  pickRebuildModelId,
  readConversation,
  readProjectHarness,
  readTextFile,
  resolveCursorApiKey,
  runCursorAgent,
  writeConversation,
});

const { startHumanAttentionResolution, startRebuild } = createAgentJobService({
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

registerApiRoutes(app, {
  PROJECTS_ROOT,
  attachProject,
  buildLogTabState,
  createProjectFromTemplate,
  createConversation,
  deleteHumanInputFile,
  discoverProjects,
  displayProjectName,
  getHumanAttentionItems,
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
  parseDesignIdentity,
  pickRebuildModelId,
  readConversation,
  readProjectJson,
  readTextFile,
  resolveCursorApiKey,
  restoreFileFromHead,
  searchFiles,
  applyEditProposal,
  editChatMessage,
  generateEditProposal,
  sendChatMessage,
  startHumanAttentionResolution,
  startRebuild,
  subscribeToConversation,
  subscribeToRebuild,
  treeRoots,
  updateConversation,
  updateEditProposal,
  uploadHumanInputFiles,
  writeTextFile,
});

app.use(apiErrorHandler);

listen(app, { port: PORT, projectsRoot: PROJECTS_ROOT, resolveCursorApiKey });
