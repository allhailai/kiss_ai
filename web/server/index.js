import express from "express";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createRebuildStore } from "./agentRuns.js";
import { runCursorAgent, runCursorAgentText } from "./agentRuntimes/cursorSdk.js";
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
import { createKissAiUpdateService } from "./services/kissAiUpdate.js";
import { createProjectAgentLock } from "./services/projectAgentLock.js";
import { createQuestionAiAssistService } from "./services/questionAiAssist.js";
import { createProjectFileService } from "./services/projectFiles.js";
import { createProjectService } from "./services/projects.js";
import { createProjectUiStateService } from "./services/projectUiState.js";
import { createSystemSettingsService } from "./services/systemSettings.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(__dirname, "..");
const HUB_ROOT = path.resolve(WEB_ROOT, "..");
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
  ["outputs", { root: "outputs_ai", kind: "output", editable: false, annotation: true }],
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
  restoreFileFromHead,
  searchFiles,
  uploadHumanInputFiles,
  writeProjectJson,
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

const { checkKissAiUpdate, updateKissAi } = createKissAiUpdateService({
  HUB_ROOT,
  WEB_ROOT,
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

const { listCursorModels, pickRebuildModelId, resolveCursorApiKey } = createCursorModelService({
  WEB_ROOT,
  httpError,
  warnedCursorKeyMessages,
});

const { saveCursorApiKey, systemSettings } = createSystemSettingsService({
  execFileText,
  httpError,
  listCursorModels,
  resolveCursorApiKey,
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

const { startDeepen, startHumanAttentionResolution, startRebuild } = createAgentJobService({
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



const defaultKeybindings = {
  toggleLeftPanel: "Ctrl+Shift+Meta+ArrowLeft",
  toggleRightPanel: "Ctrl+Shift+Meta+ArrowRight",
};

async function readKeybindings() {
  const settingsPath = path.join(PROJECTS_ROOT, ".kiss_ai_settings.json");
  try {
    const raw = await fs.readFile(settingsPath, "utf-8");
    const parsed = JSON.parse(raw);
    const userBindings = parsed?.keybindings ?? {};
    return { ...defaultKeybindings, ...userBindings };
  } catch {
    return { ...defaultKeybindings };
  }
}

registerApiRoutes(app, {
  assistQuestion,
  PROJECTS_ROOT,
  attachProject,
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
  readProjectUiState,
  readTextFile,
  resolveCursorApiKey,
  restoreFileFromHead,
  saveCursorApiKey,
  searchFiles,
  applyEditProposal,
  editChatMessage,
  generateEditProposal,
  sendChatMessage,
  startDeepen,
  startHumanAttentionResolution,
  startRebuild,
  subscribeToConversation,
  subscribeToRebuild,
  systemSettings,
  treeRoots,
  updateConversation,
  updateEditProposal,
  updateKissAi,
  uploadHumanInputFiles,
  writeTextFile,
  writeProjectUiState,
});

app.use(apiErrorHandler);

listen(app, { port: PORT, projectsRoot: PROJECTS_ROOT, resolveCursorApiKey });
