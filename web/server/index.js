import express from "express";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";
import path from "node:path";
import { createRebuildStore } from "./agentRuns.js";
import { runCursorAgent, runCursorAgentText } from "./agentRuntimes/cursorSdk.js";
import { listen } from "./adapters/listen.js";
import { registerApiRoutes } from "./routes/apiRoutes.js";
import { createAgentJobService } from "./services/agentJobs.js";
import { createAiFlowService } from "./services/aiFlows.js";
import { createAgentCapabilityService } from "./services/agents/capabilities.js";
import { createBuildLogService } from "./services/buildLogs.js";
import { createChatAgentService } from "./services/chatAgent.js";
import { createConversationService } from "./services/conversations.js";
import { createCursorModelService } from "./services/cursorModels.js";
import { createDesignIdentityService } from "./services/designIdentity.js";
import { apiErrorHandler, httpError } from "./services/httpErrors.js";
import { createProjectFileService } from "./services/projectFiles.js";
import { createProjectService } from "./services/projects.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(__dirname, "..");
const PROJECTS_ROOT = path.resolve(process.env.KISS_AI_PROJECTS_ROOT ?? path.resolve(WEB_ROOT, "..", ".."));
const PORT = Number(process.env.KISS_AI_UI_PORT ?? 8787);
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const MAX_SEARCH_RESULTS = 25;
const MAX_AI_ASSIST_FULL_CONTENT_BYTES = 80 * 1024;
const MAX_AI_ASSIST_CONTEXT_BYTES = 18 * 1024;
const REBUILD_STATE_DIR = path.join(WEB_ROOT, ".runtime", "rebuild");
const FRAMEWORK_ROOT = path.resolve(process.env.KISS_AI_FRAMEWORK_ROOT ?? path.join(PROJECTS_ROOT, "_kiss_ai", "framework"));
const warnedCursorKeyMessages = new Set();
const reservedProjectDirectories = new Set(["_kiss_ai", ".obsidian", "_archive", "_templates"]);
const projectSlugPattern = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;
const REQUIREMENT_AUTO_UPDATE_PATHS = [
  "human_goal_requirements.md",
  "human_input_requirements.md",
  "human_output_requirements.md",
];
const requirementAutoUpdatePathSet = new Set(REQUIREMENT_AUTO_UPDATE_PATHS);
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
  ["inputs-ai", { root: "inputs_ai", kind: "ai", editable: false, annotation: true }],
  ["outputs", { root: "outputs_ai", kind: "output", editable: true, annotation: false }],
  ["logs", { root: "change_logs", kind: "log", editable: false, annotation: false }],
]);

const app = express();
app.use(express.json({ limit: "60mb" }));

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

async function readProjectHarness(projectRoot) {
  try {
    return JSON.parse(await fs.readFile(path.join(projectRoot, ".harness-state.json"), "utf8"));
  } catch {
    return {};
  }
}

function hashStableValue(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
}

function hashText(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function normalizeHumanAttentionItem(item) {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    return {
      id: `legacy_${hashStableValue({ value: String(item) })}`,
      severity: "warning",
      category: "review",
      summary: String(item),
      resolution_options: [],
    };
  }

  const source = item;
  const summary =
    typeof source.summary === "string"
      ? source.summary
      : typeof source.issue === "string"
        ? source.issue
        : typeof source.message === "string"
          ? source.message
          : "Review needed.";
  const legacyId = hashStableValue({
    severity: source.severity,
    category: source.category,
    summary,
    next_human_action: source.next_human_action ?? source.nextAction,
    default_action_taken: source.default_action_taken,
  });

  return {
    ...source,
    id: typeof source.id === "string" && source.id.trim() ? source.id : `legacy_${legacyId}`,
    summary,
    resolution_options: Array.isArray(source.resolution_options) ? source.resolution_options : [],
  };
}

function getHumanAttentionItems(harness) {
  const items = harness?.extensions?.human_attention?.open_items;
  return Array.isArray(items) ? items.map(normalizeHumanAttentionItem) : [];
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

const { editChatMessage, sendChatMessage } = createChatAgentService({
  appendMessage: appendConversationMessage,
  displayProjectName,
  editUserMessage,
  httpError,
  listCursorModels,
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
  readProjectHarness,
  resolveCursorApiKey,
  runCursorAgent,
  setRebuildState,
});

const { listAgentCapabilities, readAgentSession, sendAgentSessionMessage } = createAgentCapabilityService();

const { acceptRequirementsAutoUpdate, runAiAssistProposal, runRequirementsAutoUpdateProposal } = createAiFlowService({
  FRAMEWORK_ROOT,
  MAX_FILE_BYTES,
  MAX_AI_ASSIST_FULL_CONTENT_BYTES,
  MAX_AI_ASSIST_CONTEXT_BYTES,
  REQUIREMENT_AUTO_UPDATE_PATHS,
  classifyPath,
  displayProjectName,
  hashText,
  httpError,
  listCursorModels,
  pickRebuildModelId,
  projectPath,
  readProjectHarness,
  readTextFile,
  requirementAutoUpdatePathSet,
  resolveCursorApiKey,
  runCursorAgentText,
  writeTextFile,
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
  acceptRequirementsAutoUpdate,
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
  listAgentCapabilities,
  listConversations,
  listCursorModels,
  listMarkdownFiles,
  listProjectFiles,
  parseDesignIdentity,
  pickRebuildModelId,
  readConversation,
  readAgentSession,
  readProjectJson,
  readTextFile,
  resolveCursorApiKey,
  restoreFileFromHead,
  runAiAssistProposal,
  runRequirementsAutoUpdateProposal,
  searchFiles,
  editChatMessage,
  sendChatMessage,
  sendAgentSessionMessage,
  startHumanAttentionResolution,
  startRebuild,
  subscribeToConversation,
  subscribeToRebuild,
  treeRoots,
  updateConversation,
  uploadHumanInputFiles,
  writeTextFile,
});

app.use(apiErrorHandler);

listen(app, { port: PORT, projectsRoot: PROJECTS_ROOT, resolveCursorApiKey });
