import express from "express";
import { Cursor } from "@cursor/sdk";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { createRebuildStore } from "./agentRuns.js";
import { runCursorAgent, runCursorAgentText } from "./agentRuntimes/cursorSdk.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(__dirname, "..");
const PROJECTS_ROOT = path.resolve(process.env.KISS_AI_PROJECTS_ROOT ?? path.resolve(WEB_ROOT, "..", ".."));
const PORT = Number(process.env.KISS_AI_UI_PORT ?? 8787);
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_SEARCH_RESULTS = 25;
const MAX_AGGREGATE_LOG_SECTIONS = 8;
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
app.use(express.json({ limit: "4mb" }));

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

function isPathInsideRoot(root, candidate) {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

function isProjectSignalPresent(results) {
  return results.some(Boolean);
}

async function fileExists(absolutePath) {
  try {
    await fs.access(absolutePath);
    return true;
  } catch {
    return false;
  }
}

function httpError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

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

function hasHumanAttentionItems(harness) {
  return getHumanAttentionItems(harness).length > 0;
}

async function discoverProjects() {
  const projectsRootReal = await fs.realpath(PROJECTS_ROOT);
  const entries = await fs.readdir(projectsRootReal, { withFileTypes: true });
  const projects = [];

  for (const entry of entries) {
    if (reservedProjectDirectories.has(entry.name)) continue;
    if (!entry.isDirectory() || entry.name.startsWith(".") || !projectSlugPattern.test(entry.name)) continue;

    const projectRoot = path.join(projectsRootReal, entry.name);
    const projectRootReal = await fs.realpath(projectRoot);

    if (!isPathInsideRoot(projectsRootReal, projectRootReal)) continue;

    const signals = await Promise.all([
      fileExists(path.join(projectRootReal, ".git")),
      fileExists(path.join(projectRootReal, ".harness-state.json")),
      fileExists(path.join(projectRootReal, "human_goal_requirements.md")),
      fileExists(path.join(projectRootReal, "inputs_human")),
      fileExists(path.join(projectRootReal, "outputs_ai")),
    ]);

    if (!isProjectSignalPresent(signals)) continue;

    const harness = await readProjectHarness(projectRootReal);
    const stat = await fs.stat(projectRootReal);

    projects.push({
      slug: entry.name,
      name: displayProjectName(harness.project_name, harness.project_slug ?? entry.name),
      path: projectRootReal,
      setupStatus: harness.setup?.status ?? "unknown",
      modifiedAt: stat.mtime.toISOString(),
    });
  }

  return projects.sort((left, right) => left.name.localeCompare(right.name));
}

async function resolveProject(projectSlug) {
  if (!projectSlugPattern.test(projectSlug)) {
    throw new Error("Invalid project slug.");
  }

  const projects = await discoverProjects();
  const project = projects.find((candidate) => candidate.slug === projectSlug);

  if (!project) {
    throw new Error("Project was not found under the configured projects root.");
  }

  return project;
}

async function attachProject(request, _response, next) {
  try {
    request.project = await resolveProject(request.params.projectSlug);
    next();
  } catch (error) {
    next(error);
  }
}

function projectPath(projectRoot, relativePath) {
  const normalized = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, "");
  const absolute = path.resolve(projectRoot, normalized);

  if (!isPathInsideRoot(projectRoot, absolute)) {
    throw new Error("Path escapes the project root.");
  }

  return { absolute, relative: path.relative(projectRoot, absolute).replaceAll(path.sep, "/") };
}

function classifyPath(projectRoot, relativePath) {
  const normalized = projectPath(projectRoot, relativePath).relative;
  const human = humanFiles.get(normalized);

  if (human) {
    return { path: normalized, ...human };
  }

  if (/^human_[^/]+\.md$/i.test(normalized)) {
    return { path: normalized, kind: "human", editable: true, annotation: false };
  }

  if (normalized.startsWith("inputs_ai/")) {
    return { path: normalized, kind: "ai", editable: false, annotation: true };
  }

  if (normalized.startsWith("outputs_ai/")) {
    return { path: normalized, kind: "output", editable: true, annotation: false };
  }

  if (normalized.startsWith("inputs_human/")) {
    return { path: normalized, kind: "human", editable: true, annotation: false };
  }

  if (normalized.startsWith("change_logs/")) {
    return { path: normalized, kind: "log", editable: false, annotation: false };
  }

  throw new Error("Path is not allowlisted for the lab UI.");
}

async function readProjectJson(projectRoot, relativePath, fallback = null) {
  try {
    const { absolute } = projectPath(projectRoot, relativePath);
    return JSON.parse(await fs.readFile(absolute, "utf8"));
  } catch {
    return fallback;
  }
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

function slugifyProjectName(name) {
  return String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

async function validateNewProject({ name, slug }) {
  const projectName = String(name ?? "").trim();
  const projectSlug = String(slug ?? slugifyProjectName(projectName)).trim();

  if (!projectName) {
    throw httpError("Project name is required.");
  }

  if (!projectSlug) {
    throw httpError("Project folder name is required.");
  }

  if (!projectSlugPattern.test(projectSlug)) {
    throw httpError("Project folder name must start with a letter or number and contain only letters, numbers, underscores, or hyphens.");
  }

  if (reservedProjectDirectories.has(projectSlug) || projectSlug.startsWith(".")) {
    throw httpError("That project folder name is reserved.");
  }

  const projectsRootReal = await fs.realpath(PROJECTS_ROOT);
  const projectRoot = path.resolve(projectsRootReal, projectSlug);

  if (!isPathInsideRoot(projectsRootReal, projectRoot)) {
    throw httpError("Project path escapes the configured projects root.");
  }

  if (await fileExists(projectRoot)) {
    throw httpError("A project folder with that name already exists.", 409);
  }

  return { name: projectName, slug: projectSlug, projectRoot, projectsRootReal };
}

async function copyProjectTemplate(sourceRoot, targetRoot) {
  const entries = await fs.readdir(sourceRoot, { withFileTypes: true });

  for (const entry of entries) {
    const source = path.join(sourceRoot, entry.name);
    const target = path.join(targetRoot, entry.name);

    if (entry.isDirectory()) {
      await fs.mkdir(target);
      await copyProjectTemplate(source, target);
      continue;
    }

    if (entry.isFile()) {
      await fs.copyFile(source, target);
    }
  }
}

async function initializeHarness(projectRoot, { name, slug }) {
  const harnessPath = path.join(projectRoot, ".harness-state.json");
  const harness = JSON.parse(await fs.readFile(harnessPath, "utf8"));
  const initializedAt = new Date().toISOString();

  harness.project_slug = slug;
  harness.project_name = name;
  harness.setup = {
    ...(harness.setup ?? {}),
    status: "initialized",
    initialized_at: initializedAt,
    initial_human_baseline_commit: null,
    initial_human_baseline_at: null,
  };
  harness.paths = {
    ...(harness.paths ?? {}),
    inputs_human: "inputs_human/",
    inputs_ai: "inputs_ai/",
    outputs_ai: "outputs_ai/",
    wiki: "outputs_ai/wiki/",
    human_design_identity: "human_design_identity.md",
    human_open_questions: "human_open_questions.md",
    change_logs: "change_logs/",
    build_summaries: "change_logs/summaries/",
    human_attention_queue: "change_logs/human_attention_queue.md",
    change_log: "change_logs/change_logs.md",
    annotation_change_log: "change_logs/annotation_change_logs.md",
  };
  harness.extensions = {
    ...(harness.extensions ?? {}),
    human_attention: {
      queue_path: "change_logs/human_attention_queue.md",
      last_updated_at: null,
      open_items: [],
    },
    rebuild_summaries: {
      latest_summary_path: null,
      latest_summary_section_timestamp: null,
      latest_summary_status: "not_run",
      latest_summary_notes: [],
    },
    framework_guard: {
      ...((harness.extensions ?? {}).framework_guard ?? {}),
      framework_copy_source: "centralized: ../_kiss_ai/framework",
    },
  };

  await fs.writeFile(harnessPath, `${JSON.stringify(harness, null, 2)}\n`, "utf8");
}

function replaceMarkdownSection(content, heading, body) {
  const pattern = new RegExp(`(## ${heading}\\n\\n)[\\s\\S]*?(?=\\n## |$)`);

  if (!pattern.test(content)) {
    return `${content.trimEnd()}\n\n## ${heading}\n\n${body.trim()}\n`;
  }

  return content.replace(pattern, `$1${body.trim()}\n`);
}

async function initializeGoalFile(projectRoot, projectName) {
  const goalPath = path.join(projectRoot, "human_goal_requirements.md");
  const content = await fs.readFile(goalPath, "utf8");
  const objective = `Describe the objective for ${projectName}. Add one or two paragraphs explaining what this project should help you decide, understand, or produce.`;

  await fs.writeFile(goalPath, replaceMarkdownSection(content, "Project Objective", objective), "utf8");
}

async function prependInitializationLog(projectRoot, { name, slug }) {
  const logPath = path.join(projectRoot, "change_logs", "change_logs.md");
  const content = await fs.readFile(logPath, "utf8");
  const entry = [
    `## ${new Date().toISOString()} - Project initialized`,
    "",
    `- Created project scaffold for ${name} (${slug}).`,
    "- Initialized a local Git repository and recorded the setup baseline.",
    "",
  ].join("\n");

  const headerPattern = /^(# Change Logs\s*\n\s*Entries are prepended in reverse chronological order\.\s*)/;
  const nextContent = headerPattern.test(content)
    ? content.replace(headerPattern, `$1\n\n${entry}`)
    : `${entry}\n${content.trimStart()}`;

  await fs.writeFile(logPath, nextContent, "utf8");
}

async function gitInitProject(projectRoot) {
  await execFileText("git", ["init"], { cwd: projectRoot });
  await execFileText("git", ["add", "--all"], { cwd: projectRoot });
  await execFileText("git", ["-c", "user.name=kiss_ai", "-c", "user.email=kiss_ai@local", "commit", "-m", "Initialize kiss_ai project"], {
    cwd: projectRoot,
  });

  const status = await execFileText("git", ["status", "--short"], { cwd: projectRoot });
  if (status) {
    throw new Error("Project setup completed, but the new Git repository is not clean.");
  }
}

async function createProjectFromTemplate(body) {
  const project = await validateNewProject({ name: body?.name, slug: body?.slug });
  const templateRoot = path.join(FRAMEWORK_ROOT, "templates", "project_template");

  if (!(await fileExists(templateRoot))) {
    throw httpError("Project template was not found under the configured framework root.", 500);
  }

  let created = false;

  try {
    await fs.mkdir(project.projectRoot);
    created = true;
    await copyProjectTemplate(templateRoot, project.projectRoot);
    await initializeHarness(project.projectRoot, project);
    await initializeGoalFile(project.projectRoot, project.name);
    await prependInitializationLog(project.projectRoot, project);
    await gitInitProject(project.projectRoot);
  } catch (error) {
    if (created) {
      await fs.rm(project.projectRoot, { recursive: true, force: true });
    }
    throw error;
  }

  const createdProjects = await discoverProjects();
  const summary = createdProjects.find((candidate) => candidate.slug === project.slug);

  if (!summary) {
    throw new Error("Project was created, but project discovery did not return it.");
  }

  return summary;
}

async function readTextFile(projectRoot, relativePath) {
  const meta = classifyPath(projectRoot, relativePath);
  const { absolute } = projectPath(projectRoot, meta.path);
  const stat = await fs.stat(absolute);

  if (stat.size > MAX_FILE_BYTES) {
    throw new Error("File is too large to open in the lab UI.");
  }

  const content = await fs.readFile(absolute, "utf8");

  return {
    ...meta,
    content,
    contentHash: hashText(content),
  };
}

async function writeTextFile(projectRoot, relativePath, content) {
  const meta = classifyPath(projectRoot, relativePath);

  if (!meta.editable) {
    throw new Error("This file is read-only in the lab UI.");
  }

  const { absolute } = projectPath(projectRoot, meta.path);
  await fs.writeFile(absolute, content, "utf8");
  return readTextFile(projectRoot, meta.path);
}

async function listMarkdownFiles(projectRoot, rootRelative, kind, editable, annotation) {
  const root = projectPath(projectRoot, rootRelative);
  const files = [];

  async function walk(currentAbsolute) {
    const entries = await fs.readdir(currentAbsolute, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name === ".git" || entry.name === "node_modules") continue;

      const absolute = path.join(currentAbsolute, entry.name);
      const relative = path.relative(projectRoot, absolute).replaceAll(path.sep, "/");

      if (entry.isDirectory()) {
        await walk(absolute);
        continue;
      }

      if (!entry.name.endsWith(".md")) continue;

      const stat = await fs.stat(absolute);
      files.push({
        path: relative,
        name: relative.replace(`${root.relative}/`, ""),
        kind,
        editable,
        annotation,
        modifiedAt: stat.mtime.toISOString(),
      });
    }
  }

  try {
    await walk(root.absolute);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  return files.sort((a, b) => a.path.localeCompare(b.path));
}

function markdownHeadingTitle(markdown, fallback) {
  const heading = markdown.match(/^#\s+(.+)$/m) ?? markdown.match(/^##\s+(.+)$/m);
  return heading?.[1]?.trim() || fallback;
}

function markdownSectionId(title, index) {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

  return `section-${index + 1}${slug ? `-${slug}` : ""}`;
}

function parseMarkdownSections(markdown) {
  const matches = [...markdown.matchAll(/^##\s+(.+)$/gm)];

  return matches.map((match, index) => {
    const start = match.index ?? 0;
    const end = matches[index + 1]?.index ?? markdown.length;
    const title = match[1].trim();

    return {
      id: markdownSectionId(title, index),
      title,
      content: markdown.slice(start, end).trim(),
    };
  });
}

function trimForPrompt(value, maxBytes = MAX_AI_ASSIST_CONTEXT_BYTES) {
  const text = String(value ?? "");
  if (Buffer.byteLength(text, "utf8") <= maxBytes) return text;

  return `${text.slice(0, maxBytes)}\n\n[Truncated for prompt size.]`;
}

function lineNumberForIndex(content, index) {
  return content.slice(0, Math.max(0, index)).split("\n").length;
}

function extractAiAssistCandidate(content, annotation) {
  const explicit = String(annotation ?? "").trim();
  if (explicit) return explicit;

  const candidate = content
    .split("\n")
    .find((line) => /\b(TODO|AI Assist|FIXME|TBD)\b|^\s*[-*]\s+\[[ ?]\]/i.test(line));
  return candidate?.trim() ?? "";
}

function getAiAssistFileContext(content, annotation) {
  if (Buffer.byteLength(content, "utf8") <= MAX_AI_ASSIST_FULL_CONTENT_BYTES) {
    return {
      mode: "full",
      content,
      surroundingSections: parseMarkdownSections(content).map(({ title }) => title),
    };
  }

  const candidate = extractAiAssistCandidate(content, annotation);
  const candidateIndex = candidate ? content.toLowerCase().indexOf(candidate.toLowerCase()) : -1;
  const candidateLine = candidateIndex >= 0 ? lineNumberForIndex(content, candidateIndex) : 1;
  const lines = content.split("\n");
  const startLine = Math.max(1, candidateLine - 80);
  const endLine = Math.min(lines.length, candidateLine + 120);
  const excerpt = lines.slice(startLine - 1, endLine).join("\n");

  return {
    mode: "excerpt",
    content: trimForPrompt(excerpt, MAX_AI_ASSIST_FULL_CONTENT_BYTES),
    surroundingSections: parseMarkdownSections(content)
      .filter((section) => section.content.includes(candidate) || section.content.length < MAX_AI_ASSIST_CONTEXT_BYTES)
      .slice(0, 8)
      .map(({ title }) => title),
    excerptLineRange: { from: startLine, to: endLine },
  };
}

async function readOptionalProjectText(projectRoot, relativePath, maxBytes = MAX_AI_ASSIST_CONTEXT_BYTES) {
  try {
    const file = await readTextFile(projectRoot, relativePath);
    return trimForPrompt(file.content, maxBytes);
  } catch {
    return "";
  }
}

async function createAiAssistContext(project, meta, currentContent, annotation) {
  const harness = await readProjectHarness(project.path);
  const frameworkReadme = await fs.readFile(path.join(FRAMEWORK_ROOT, "README.md"), "utf8").catch(() => "");
  const rootReadme = await fs.readFile(path.join(path.dirname(FRAMEWORK_ROOT), "README.md"), "utf8").catch(() => "");

  return {
    project: {
      slug: project.slug,
      name: displayProjectName(harness.project_name ?? project.name, harness.project_slug ?? project.slug),
      root: project.path,
      setupStatus: harness.setup?.status ?? "unknown",
      lastRunAt: harness.last_run_at ?? null,
    },
    framework: {
      root: FRAMEWORK_ROOT,
      overview: trimForPrompt(rootReadme, 8000),
      readme: trimForPrompt(frameworkReadme, 10000),
      invariants: [
        "Requirement files are the source of truth.",
        "inputs_human/ is human-owned.",
        "inputs_ai/ and outputs_ai/ are AI-managed.",
        "Human edits in AI-managed paths are annotations, not durable source-of-truth changes.",
        "Generated outputs must be reproducible from requirements and inputs.",
      ],
    },
    requirements: {
      goal: await readOptionalProjectText(project.path, "human_goal_requirements.md"),
      inputs: await readOptionalProjectText(project.path, "human_input_requirements.md"),
      outputs: await readOptionalProjectText(project.path, "human_output_requirements.md"),
      openQuestions: await readOptionalProjectText(project.path, "human_open_questions.md"),
    },
    currentFile: {
      path: meta.path,
      kind: meta.kind,
      editable: meta.editable,
      annotation: meta.annotation,
      contentHash: hashText(currentContent),
      ...getAiAssistFileContext(currentContent, annotation),
    },
  };
}

function requireAiAssistRequest(projectRoot, body) {
  const filePath = String(body?.path ?? "").trim();
  const annotation = String(body?.annotation ?? "").trim();
  const feedback = String(body?.feedback ?? "").trim();
  const modelId = String(body?.modelId ?? "").trim();
  const meta = classifyPath(projectRoot, filePath);

  if (!filePath) throw new Error("AI Assist requires a file path.");
  if (!/^human_[^/]+\.md$/i.test(meta.path) || meta.kind !== "human") {
    throw new Error("AI Assist currently supports human-owned requirement files only.");
  }
  if (!meta.editable) throw new Error("AI Assist requires an editable file.");
  if (!annotation && !feedback) throw new Error("AI Assist requires an annotation, selection, instruction, or refinement note.");

  return {
    meta,
    annotation,
    feedback,
    modelId,
    previousProposal: body?.previousProposal && typeof body.previousProposal === "object" ? body.previousProposal : null,
  };
}

function createAiAssistPrompt({ project, context, annotation, feedback, previousProposal }) {
  const payload = {
    projectRoot: project.path,
    frameworkRoot: FRAMEWORK_ROOT,
    currentFilePath: context.currentFile.path,
    annotation,
    ephemeralFeedback: feedback || null,
    previousProposal: previousProposal
      ? {
          summary: previousProposal.summary ?? "",
          proposedContent: previousProposal.proposedContent ?? "",
          affectedSections: previousProposal.affectedSections ?? [],
        }
      : null,
    context,
  };

  return [
    "Produce an AI Assist proposal for this kiss_ai project file.",
    "",
    `Follow ${path.join(FRAMEWORK_ROOT, "commands/do_ai_assist.md")} exactly.`,
    "This is a proposal-only web-triggered run. Do not edit files, write logs, update state, or run modifying commands.",
    "Return only one AI Assist proposal using the tagged output contract from do_ai_assist.md.",
    "Do not wrap the response in Markdown fences. Do not add prose before or after the tagged proposal.",
    "The response must start with `<ai_assist_proposal>` and end with `</ai_assist_proposal>`.",
    "Put the complete replacement Markdown for the current file inside the <proposedContent> tag.",
    "",
    "Request payload:",
    JSON.stringify(payload, null, 2),
  ].join("\n");
}

function firstTagContent(text, tagName) {
  const pattern = new RegExp(`<${tagName}>\\s*([\\s\\S]*?)\\s*<\\/${tagName}>`, "i");
  return text.match(pattern)?.[1]?.trim() ?? "";
}

function parseTaggedList(value) {
  return value
    .split("\n")
    .map((line) => line.replace(/^\s*[-*]\s*/, "").trim())
    .filter(Boolean);
}

function extractTaggedAiAssistProposal(rawText) {
  const text = String(rawText ?? "").trim();
  const wrapper = firstTagContent(text, "ai_assist_proposal");
  const source = wrapper || text;
  const proposedContent = firstTagContent(source, "proposedContent");

  if (!proposedContent) {
    throw new Error("AI Assist did not return tagged proposal content.");
  }

  return {
    summary: firstTagContent(source, "summary") || "AI Assist proposal generated.",
    rationale: firstTagContent(source, "rationale"),
    affectedSections: parseTaggedList(firstTagContent(source, "affectedSections")),
    proposedContent,
    risks: parseTaggedList(firstTagContent(source, "risks")),
    questionsOrAssumptions: parseTaggedList(firstTagContent(source, "questionsOrAssumptions")),
  };
}

function findBalancedJsonCandidates(text) {
  const candidates = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === "\"") {
        inString = false;
      }
      continue;
    }

    if (character === "\"") {
      inString = true;
      continue;
    }

    if (character === "{") {
      if (depth === 0) start = index;
      depth += 1;
    } else if (character === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        candidates.push(text.slice(start, index + 1));
        start = -1;
      }
    }
  }

  return candidates;
}

function extractJsonObject(rawText, errorMessage = "AI Assist did not return valid proposal JSON.") {
  const text = String(rawText ?? "").trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() ?? text;

  try {
    return JSON.parse(candidate);
  } catch {
    for (const jsonCandidate of findBalancedJsonCandidates(candidate)) {
      try {
        return JSON.parse(jsonCandidate);
      } catch {
        // Try the next balanced candidate.
      }
    }
    throw new Error(errorMessage);
  }
}

function createAiAssistRepairPrompt({ rawText, fallbackContent }) {
  const repairPayload = {
    malformedResponse: trimForPrompt(rawText, 180000),
    fallbackContent,
  };

  return [
    "Repair this AI Assist response into the tagged AI Assist proposal format.",
    "Return only the tagged proposal. Do not include Markdown fences, prose, comments, or trailing text.",
    "The response must start with `<ai_assist_proposal>` and end with `</ai_assist_proposal>`.",
    "If the malformed response does not contain usable proposed content, use fallbackContent as proposedContent and explain the issue in risks.",
    "",
    "Required format:",
    "<ai_assist_proposal>",
    "<summary>Short human-readable summary.</summary>",
    "<rationale>Why this change fits.</rationale>",
    "<affectedSections>",
    "- Section name",
    "</affectedSections>",
    "<proposedContent>",
    "Full replacement Markdown content for the current file.",
    "</proposedContent>",
    "<risks>",
    "- Risk or ambiguity",
    "</risks>",
    "<questionsOrAssumptions>",
    "- Assumption or question",
    "</questionsOrAssumptions>",
    "</ai_assist_proposal>",
    "",
    "Repair payload:",
    JSON.stringify(repairPayload, null, 2),
  ].join("\n");
}

async function parseOrRepairAiAssistProposal({ project, apiKey, modelId, rawText, fallbackContent }) {
  try {
    return extractTaggedAiAssistProposal(rawText);
  } catch {
    // Older or stubborn models may still return JSON; keep that path supported.
  }

  try {
    return extractJsonObject(rawText);
  } catch (parseError) {
    const repairPrompt = createAiAssistRepairPrompt({ rawText, fallbackContent });
    const repairedText = await runCursorAgentText({ project, apiKey, modelId, prompt: repairPrompt });

    try {
      return extractTaggedAiAssistProposal(repairedText);
    } catch {
      // Fall through to legacy JSON repair parsing below.
    }

    try {
      return extractJsonObject(repairedText, "AI Assist did not return a valid proposal after a repair attempt.");
    } catch (repairError) {
      const preview = trimForPrompt(rawText || repairedText, 1200);
      console.warn(`[kiss_ai UI warning] AI Assist proposal parse failed. Raw response preview:\n${preview}`);
      throw repairError instanceof Error ? repairError : parseError;
    }
  }
}

function normalizeAiAssistProposal(value, fallbackContent) {
  const source = value && typeof value === "object" ? value : {};
  const proposedContent = typeof source.proposedContent === "string" ? source.proposedContent : fallbackContent;

  if (Buffer.byteLength(proposedContent, "utf8") > MAX_FILE_BYTES) {
    throw new Error("AI Assist proposed content is too large for the editor.");
  }

  return {
    summary: String(source.summary ?? "AI Assist proposal generated.").trim(),
    rationale: String(source.rationale ?? "").trim(),
    affectedSections: Array.isArray(source.affectedSections) ? source.affectedSections.map(String).filter(Boolean) : [],
    proposedContent,
    risks: Array.isArray(source.risks) ? source.risks.map(String).filter(Boolean) : [],
    questionsOrAssumptions: Array.isArray(source.questionsOrAssumptions) ? source.questionsOrAssumptions.map(String).filter(Boolean) : [],
  };
}

async function runAiAssistProposal(project, body) {
  const request = requireAiAssistRequest(project.path, body);
  const file = await readTextFile(project.path, request.meta.path);
  const contentHash = hashText(file.content);

  if (body?.contentHash && String(body.contentHash) !== contentHash) {
    throw new Error("The saved file changed before AI Assist could start. Reload the file and try again.");
  }

  const cursorApiKey = await resolveCursorApiKey();
  if (!cursorApiKey.available) {
    throw new Error("No Cursor API key found in CURSOR_API_KEY, web/.env, or macOS Keychain item cursor_api_key. AI Assist is unavailable from the UI.");
  }

  const models = await listCursorModels(cursorApiKey.apiKey);
  if (!models.length) {
    throw new Error("No Cursor models remain after excluding MAX mode models. Add a non-MAX model to your account catalog or relax filters.");
  }

  const context = await createAiAssistContext(project, request.meta, file.content, request.annotation);
  const prompt = createAiAssistPrompt({
    project,
    context,
    annotation: request.annotation,
    feedback: request.feedback,
    previousProposal: request.previousProposal,
  });
  const modelId = pickRebuildModelId(models, request.modelId);
  const rawText = await runCursorAgentText({ project, apiKey: cursorApiKey.apiKey, modelId, prompt });
  const proposal = normalizeAiAssistProposal(
    await parseOrRepairAiAssistProposal({
      project,
      apiKey: cursorApiKey.apiKey,
      modelId,
      rawText,
      fallbackContent: file.content,
    }),
    file.content,
  );
  const afterFile = await readTextFile(project.path, request.meta.path);

  if (afterFile.content !== file.content) {
    const { absolute } = projectPath(project.path, request.meta.path);
    await fs.writeFile(absolute, file.content, "utf8");
    throw new Error("AI Assist attempted to edit the file directly. The original file was restored; try again with a narrower instruction.");
  }

  return {
    ...proposal,
    filePath: request.meta.path,
    contentHash,
    modelId,
    generatedAt: new Date().toISOString(),
  };
}

function requireRequirementAutoUpdatePath(projectRoot, filePath, label = "Requirement file") {
  const meta = classifyPath(projectRoot, String(filePath ?? "").trim());

  if (!requirementAutoUpdatePathSet.has(meta.path)) {
    throw new Error(`${label} must be one of the three root requirement files.`);
  }
  if (!meta.editable) {
    throw new Error(`${label} must be editable.`);
  }

  return meta.path;
}

function requireRequirementAutoUpdateRequest(projectRoot, body) {
  const modelId = String(body?.modelId ?? "").trim();
  const sourcePath = requireRequirementAutoUpdatePath(projectRoot, body?.sourcePath, "Source file");
  const selectedPaths = Array.isArray(body?.selectedPaths)
    ? [...new Set(body.selectedPaths.map((value) => requireRequirementAutoUpdatePath(projectRoot, value, "Selected file")))]
    : [];
  const instruction = String(body?.instruction ?? "").trim();
  const contentHashes = body?.contentHashes && typeof body.contentHashes === "object" && !Array.isArray(body.contentHashes) ? body.contentHashes : {};

  if (!modelId) throw new Error("AI Auto Update requires a model.");
  if (!selectedPaths.length) throw new Error("Select at least one requirement file to update.");

  for (const filePath of REQUIREMENT_AUTO_UPDATE_PATHS) {
    const contentHash = String(contentHashes[filePath] ?? "").trim();
    if (!contentHash) {
      throw new Error(`AI Auto Update requires a content hash for ${filePath}.`);
    }
  }

  return {
    modelId,
    sourcePath,
    selectedPaths,
    instruction,
    contentHashes,
  };
}

function createRequirementsAutoUpdatePrompt({ project, request, files }) {
  const payload = {
    projectRoot: project.path,
    frameworkRoot: FRAMEWORK_ROOT,
    sourcePath: request.sourcePath,
    selectedPaths: request.selectedPaths,
    instruction: request.instruction || null,
    requirements: Object.fromEntries(
      files.map((file) => [
        file.path,
        {
          path: file.path,
          contentHash: file.contentHash,
          content: file.content,
          selectedForUpdate: request.selectedPaths.includes(file.path),
          sourceOfRecentIntent: file.path === request.sourcePath,
        },
      ]),
    ),
  };

  return [
    "Produce an AI Auto Update proposal for this kiss_ai project's root requirement files.",
    "",
    `Follow ${path.join(FRAMEWORK_ROOT, "commands/do_requirements_auto_update.md")} exactly.`,
    "This is a proposal-only web-triggered run. Do not edit files, write logs, update state, or run modifying commands.",
    "Return only one AI Auto Update proposal using the tagged output contract from do_requirements_auto_update.md.",
    "Do not wrap the response in Markdown fences. Do not add prose before or after the tagged proposal.",
    "The response must start with `<requirements_auto_update_proposal>` and end with `</requirements_auto_update_proposal>`.",
    "Return file proposals only for selectedPaths. Put complete replacement Markdown for each selected file inside its <proposedContent> tag.",
    "",
    "Request payload:",
    JSON.stringify(payload, null, 2),
  ].join("\n");
}

function allTagContent(text, tagName) {
  const pattern = new RegExp(`<${tagName}>\\s*([\\s\\S]*?)\\s*<\\/${tagName}>`, "gi");
  return [...String(text ?? "").matchAll(pattern)].map((match) => match[1]?.trim() ?? "");
}

function extractTaggedRequirementsAutoUpdateProposal(rawText) {
  const text = String(rawText ?? "").trim();
  const wrapper = firstTagContent(text, "requirements_auto_update_proposal");
  const source = wrapper || text;
  const fileProposals = allTagContent(source, "fileProposal").map((proposalText) => ({
    filePath: firstTagContent(proposalText, "filePath"),
    summary: firstTagContent(proposalText, "summary") || "AI Auto Update proposal generated.",
    rationale: firstTagContent(proposalText, "rationale"),
    affectedSections: parseTaggedList(firstTagContent(proposalText, "affectedSections")),
    proposedContent: firstTagContent(proposalText, "proposedContent"),
    risks: parseTaggedList(firstTagContent(proposalText, "risks")),
    questionsOrAssumptions: parseTaggedList(firstTagContent(proposalText, "questionsOrAssumptions")),
  }));

  if (!fileProposals.length || fileProposals.some((proposal) => !proposal.filePath || !proposal.proposedContent)) {
    throw new Error("AI Auto Update did not return tagged proposals for the selected files.");
  }

  return { proposals: fileProposals };
}

function createRequirementsAutoUpdateRepairPrompt({ rawText, selectedPaths, fallbackFiles }) {
  const repairPayload = {
    malformedResponse: trimForPrompt(rawText, 180000),
    selectedPaths,
    fallbackFiles: Object.fromEntries(fallbackFiles.map((file) => [file.path, file.content])),
  };

  return [
    "Repair this AI Auto Update response into the tagged multi-file proposal format.",
    "Return only the tagged proposal. Do not include Markdown fences, prose, comments, or trailing text.",
    "The response must start with `<requirements_auto_update_proposal>` and end with `</requirements_auto_update_proposal>`.",
    "If usable proposed content is missing for a selected file, use that file's fallback content and explain the issue in risks.",
    "",
    "Required format:",
    "<requirements_auto_update_proposal>",
    "<fileProposal>",
    "<filePath>human_input_requirements.md</filePath>",
    "<summary>Short human-readable summary.</summary>",
    "<rationale>Why this change fits.</rationale>",
    "<affectedSections>",
    "- Section name",
    "</affectedSections>",
    "<proposedContent>",
    "Full replacement Markdown content for this file.",
    "</proposedContent>",
    "<risks>",
    "- Risk or ambiguity",
    "</risks>",
    "<questionsOrAssumptions>",
    "- Assumption or question",
    "</questionsOrAssumptions>",
    "</fileProposal>",
    "</requirements_auto_update_proposal>",
    "",
    "Repair payload:",
    JSON.stringify(repairPayload, null, 2),
  ].join("\n");
}

async function parseOrRepairRequirementsAutoUpdateProposal({ project, apiKey, modelId, rawText, selectedPaths, fallbackFiles }) {
  try {
    return extractTaggedRequirementsAutoUpdateProposal(rawText);
  } catch {
    // Try JSON before asking the model to repair.
  }

  try {
    return extractJsonObject(rawText, "AI Auto Update did not return valid proposal JSON.");
  } catch (parseError) {
    const repairPrompt = createRequirementsAutoUpdateRepairPrompt({ rawText, selectedPaths, fallbackFiles });
    const repairedText = await runCursorAgentText({ project, apiKey, modelId, prompt: repairPrompt });

    try {
      return extractTaggedRequirementsAutoUpdateProposal(repairedText);
    } catch {
      // Fall through to JSON repair parsing below.
    }

    try {
      return extractJsonObject(repairedText, "AI Auto Update did not return a valid proposal after a repair attempt.");
    } catch (repairError) {
      const preview = trimForPrompt(rawText || repairedText, 1200);
      console.warn(`[kiss_ai UI warning] AI Auto Update proposal parse failed. Raw response preview:\n${preview}`);
      throw repairError instanceof Error ? repairError : parseError;
    }
  }
}

function normalizeRequirementsAutoUpdateProposal(value, selectedPaths, filesByPath, modelId) {
  const source = value && typeof value === "object" ? value : {};
  const rawProposals = Array.isArray(source.proposals) ? source.proposals : [];
  const proposalsByPath = new Map();

  for (const rawProposal of rawProposals) {
    const rawPath = String(rawProposal?.filePath ?? rawProposal?.path ?? "").trim();
    if (!selectedPaths.includes(rawPath)) continue;

    const originalFile = filesByPath.get(rawPath);
    const proposedContent = typeof rawProposal?.proposedContent === "string" ? rawProposal.proposedContent : originalFile?.content ?? "";

    if (Buffer.byteLength(proposedContent, "utf8") > MAX_FILE_BYTES) {
      throw new Error(`AI Auto Update proposed content is too large for ${rawPath}.`);
    }

    proposalsByPath.set(rawPath, {
      filePath: rawPath,
      contentHash: originalFile?.contentHash ?? "",
      modelId,
      generatedAt: new Date().toISOString(),
      summary: String(rawProposal?.summary ?? "AI Auto Update proposal generated.").trim(),
      rationale: String(rawProposal?.rationale ?? "").trim(),
      affectedSections: Array.isArray(rawProposal?.affectedSections) ? rawProposal.affectedSections.map(String).filter(Boolean) : [],
      proposedContent,
      risks: Array.isArray(rawProposal?.risks) ? rawProposal.risks.map(String).filter(Boolean) : [],
      questionsOrAssumptions: Array.isArray(rawProposal?.questionsOrAssumptions)
        ? rawProposal.questionsOrAssumptions.map(String).filter(Boolean)
        : [],
    });
  }

  const missingPaths = selectedPaths.filter((filePath) => !proposalsByPath.has(filePath));
  if (missingPaths.length) {
    throw new Error(`AI Auto Update did not return proposals for: ${missingPaths.join(", ")}.`);
  }

  return {
    modelId,
    generatedAt: new Date().toISOString(),
    proposals: selectedPaths.map((filePath) => proposalsByPath.get(filePath)),
  };
}

async function runRequirementsAutoUpdateProposal(project, body) {
  const request = requireRequirementAutoUpdateRequest(project.path, body);
  const files = await Promise.all(REQUIREMENT_AUTO_UPDATE_PATHS.map((filePath) => readTextFile(project.path, filePath)));
  const filesByPath = new Map(files.map((file) => [file.path, file]));

  for (const file of files) {
    if (String(request.contentHashes[file.path] ?? "") !== file.contentHash) {
      throw new Error(`The saved file changed before AI Auto Update could start: ${file.path}. Reload and try again.`);
    }
    if (Buffer.byteLength(file.content, "utf8") > MAX_AI_ASSIST_FULL_CONTENT_BYTES) {
      throw new Error(`AI Auto Update requires ${file.path} to be under ${MAX_AI_ASSIST_FULL_CONTENT_BYTES.toLocaleString()} bytes.`);
    }
  }

  const cursorApiKey = await resolveCursorApiKey();
  if (!cursorApiKey.available) {
    throw new Error("No Cursor API key found in CURSOR_API_KEY, web/.env, or macOS Keychain item cursor_api_key. AI Auto Update is unavailable from the UI.");
  }

  const models = await listCursorModels(cursorApiKey.apiKey);
  if (!models.length) {
    throw new Error("No Cursor models remain after excluding MAX mode models. Add a non-MAX model to your account catalog or relax filters.");
  }

  const modelId = pickRebuildModelId(models, request.modelId);
  const prompt = createRequirementsAutoUpdatePrompt({ project, request, files });
  const rawText = await runCursorAgentText({ project, apiKey: cursorApiKey.apiKey, modelId, prompt });
  const parsedProposal = await parseOrRepairRequirementsAutoUpdateProposal({
    project,
    apiKey: cursorApiKey.apiKey,
    modelId,
    rawText,
    selectedPaths: request.selectedPaths,
    fallbackFiles: request.selectedPaths.map((filePath) => filesByPath.get(filePath)).filter(Boolean),
  });
  const afterFiles = await Promise.all(REQUIREMENT_AUTO_UPDATE_PATHS.map((filePath) => readTextFile(project.path, filePath)));

  for (const afterFile of afterFiles) {
    const beforeFile = filesByPath.get(afterFile.path);
    if (beforeFile && afterFile.content !== beforeFile.content) {
      const { absolute } = projectPath(project.path, afterFile.path);
      await fs.writeFile(absolute, beforeFile.content, "utf8");
      throw new Error("AI Auto Update attempted to edit files directly. The original files were restored; try again with a narrower instruction.");
    }
  }

  return normalizeRequirementsAutoUpdateProposal(parsedProposal, request.selectedPaths, filesByPath, modelId);
}

function requireRequirementsAutoUpdateAcceptRequest(projectRoot, body) {
  const rawProposals = Array.isArray(body?.proposals) ? body.proposals : [];
  if (!rawProposals.length) {
    throw new Error("AI Auto Update requires at least one accepted proposal.");
  }

  const proposals = rawProposals.map((proposal) => {
    const filePath = requireRequirementAutoUpdatePath(projectRoot, proposal?.filePath ?? proposal?.path, "Accepted file");
    const contentHash = String(proposal?.contentHash ?? "").trim();
    const proposedContent = typeof proposal?.proposedContent === "string" ? proposal.proposedContent : "";

    if (!contentHash) throw new Error(`AI Auto Update requires a content hash for ${filePath}.`);
    if (!proposedContent) throw new Error(`AI Auto Update requires proposed content for ${filePath}.`);
    if (Buffer.byteLength(proposedContent, "utf8") > MAX_FILE_BYTES) {
      throw new Error(`AI Auto Update proposed content is too large for ${filePath}.`);
    }

    return { filePath, contentHash, proposedContent };
  });

  const uniquePaths = new Set(proposals.map((proposal) => proposal.filePath));
  if (uniquePaths.size !== proposals.length) {
    throw new Error("AI Auto Update accept request contains duplicate files.");
  }

  return { proposals };
}

async function acceptRequirementsAutoUpdate(project, body) {
  const request = requireRequirementsAutoUpdateAcceptRequest(project.path, body);
  const currentFiles = await Promise.all(request.proposals.map((proposal) => readTextFile(project.path, proposal.filePath)));

  for (const file of currentFiles) {
    const proposal = request.proposals.find((candidate) => candidate.filePath === file.path);
    if (proposal && proposal.contentHash !== file.contentHash) {
      throw new Error(`The saved file changed before AI Auto Update could be accepted: ${file.path}. Regenerate the proposal.`);
    }
  }

  const writtenFiles = [];
  for (const proposal of request.proposals) {
    writtenFiles.push(await writeTextFile(project.path, proposal.filePath, proposal.proposedContent));
  }

  return {
    acceptedAt: new Date().toISOString(),
    files: writtenFiles,
  };
}

function excerptMarkdownSections(markdown, maxSections) {
  const matches = [...markdown.matchAll(/^##\s+.+$/gm)];

  if (matches.length <= maxSections) return markdown.trim();
  if (!matches.length) return markdown.slice(0, MAX_FILE_BYTES).trim();

  const end = matches[maxSections]?.index ?? markdown.length;
  return markdown.slice(0, end).trim();
}

function summaryListItem(summary) {
  return {
    path: summary.path,
    name: summary.name,
    title: summary.title,
    modifiedAt: summary.modifiedAt,
    sections: summary.sections.map(({ id, title }) => ({ id, title })),
  };
}

function summaryContentItem(summary, sectionId = null) {
  const section = sectionId ? summary.sections.find((candidate) => candidate.id === sectionId) : null;

  return {
    ...summaryListItem(summary),
    selectedSectionId: section?.id ?? null,
    content: section?.content ?? summary.content,
    title: section?.title ?? summary.title,
  };
}

async function listBuildSummaries(projectRoot) {
  const root = projectPath(projectRoot, "change_logs/summaries");
  let entries = [];

  try {
    entries = await fs.readdir(root.absolute, { withFileTypes: true });
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return [];
  }

  const summaries = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;

    const relativePath = `change_logs/summaries/${entry.name}`;
    const file = await readTextFile(projectRoot, relativePath);
    const { absolute } = projectPath(projectRoot, file.path);
    const stat = await fs.stat(absolute);
    const sections = parseMarkdownSections(file.content);

    summaries.push({
      path: file.path,
      name: entry.name,
      title: markdownHeadingTitle(file.content, humanizePathSegment(entry.name)),
      modifiedAt: stat.mtime.toISOString(),
      sections,
      content: file.content,
    });
  }

  return summaries.sort((left, right) => {
    const nameOrder = right.name.localeCompare(left.name);
    if (nameOrder !== 0) return nameOrder;
    return right.modifiedAt.localeCompare(left.modifiedAt);
  });
}

async function readAggregateBuildLogExcerpt(projectRoot) {
  try {
    const file = await readTextFile(projectRoot, "change_logs/change_logs.md");
    return excerptMarkdownSections(file.content, MAX_AGGREGATE_LOG_SECTIONS);
  } catch (error) {
    if (error.code === "ENOENT") return "";
    return "";
  }
}

async function readSearchAllowedPaths() {
  let lookup = {};

  try {
    lookup = JSON.parse(await fs.readFile(path.join(WEB_ROOT, "server/search-allowed-paths.json"), "utf8"));
  } catch {
    lookup = {};
  }

  return {
    directories: Array.isArray(lookup.directories) ? lookup.directories.map(String) : [],
    files: Array.isArray(lookup.files) ? lookup.files.map(String) : [],
  };
}

function fileMatchesPattern(fileName, pattern) {
  if (pattern === "human_*.md") {
    return /^human_[^/]+\.md$/i.test(fileName);
  }

  return fileName === pattern;
}

async function listSearchDirectoryFiles(projectRoot, rootRelative) {
  const root = projectPath(projectRoot, rootRelative.replace(/\/+$/, ""));
  const files = [];

  async function walk(currentAbsolute) {
    const entries = await fs.readdir(currentAbsolute, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name === ".git" || entry.name === "node_modules") continue;

      const absolute = path.join(currentAbsolute, entry.name);
      const relative = path.relative(projectRoot, absolute).replaceAll(path.sep, "/");

      if (entry.isDirectory()) {
        await walk(absolute);
        continue;
      }

      if (!entry.name.endsWith(".md")) continue;

      const meta = classifyPath(projectRoot, relative);
      const stat = await fs.stat(absolute);
      files.push({
        path: meta.path,
        name: relative.replace(`${root.relative}/`, ""),
        kind: meta.kind,
        editable: meta.editable,
        annotation: meta.annotation,
        modifiedAt: stat.mtime.toISOString(),
      });
    }
  }

  try {
    await walk(root.absolute);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  return files;
}

async function listSearchPatternFiles(projectRoot, pattern) {
  const root = projectPath(projectRoot, ".");
  const entries = await fs.readdir(root.absolute, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (!entry.isFile() || !fileMatchesPattern(entry.name, pattern)) continue;

    const meta = classifyPath(projectRoot, entry.name);
    const stat = await fs.stat(path.join(root.absolute, entry.name));
    files.push({
      path: meta.path,
      name: meta.path,
      kind: meta.kind,
      editable: meta.editable,
      annotation: meta.annotation,
      modifiedAt: stat.mtime.toISOString(),
    });
  }

  return files;
}

async function searchFiles(projectRoot, query) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return [];

  const allowlist = await readSearchAllowedPaths();
  const candidates = [
    ...(await Promise.all(allowlist.directories.map((directory) => listSearchDirectoryFiles(projectRoot, directory)))).flat(),
    ...(await Promise.all(allowlist.files.map((pattern) => listSearchPatternFiles(projectRoot, pattern)))).flat(),
  ];
  const uniqueCandidates = [...new Map(candidates.map((file) => [file.path, file])).values()];

  return uniqueCandidates
    .filter((file) => {
      const searchableText = [
        file.path,
        file.name,
        ...file.path.split("/").map(humanizePathSegment),
        humanizePathSegment(file.name.split("/").at(-1) ?? file.name),
      ]
        .join(" ")
        .toLowerCase();

      return searchableText.includes(normalizedQuery);
    })
    .sort((left, right) => left.path.localeCompare(right.path))
    .slice(0, MAX_SEARCH_RESULTS);
}

async function gitStatus(projectRoot) {
  return new Promise((resolve) => {
    execFile("git", ["status", "--short"], { cwd: projectRoot }, (error, stdout) => {
      if (error) {
        resolve([`git status unavailable: ${error.message}`]);
        return;
      }

      resolve(stdout.split("\n").filter(Boolean));
    });
  });
}

async function gitFileDiff(projectRoot, relativePath) {
  const meta = classifyPath(projectRoot, relativePath);

  return new Promise((resolve) => {
    execFile("git", ["diff", "--unified=0", "--", meta.path], { cwd: projectRoot }, (error, stdout) => {
      if (error) {
        resolve({ path: meta.path, ranges: [], deletions: [] });
        return;
      }

      resolve(parseGitDiff(meta.path, stdout));
    });
  });
}

async function restoreFileFromHead(projectRoot, relativePath) {
  const meta = classifyPath(projectRoot, relativePath);

  if (!meta.editable) {
    throw new Error("This file is read-only in the lab UI.");
  }

  await new Promise((resolve, reject) => {
    execFile("git", ["restore", "--source=HEAD", "--staged", "--worktree", "--", meta.path], { cwd: projectRoot }, (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(null);
    });
  });

  return readTextFile(projectRoot, meta.path);
}

function parseGitDiff(relativePath, diffText) {
  const ranges = [];
  const deletions = [];
  const hunkPattern = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/gm;
  let match;

  while ((match = hunkPattern.exec(diffText)) !== null) {
    const oldStart = Number(match[1]);
    const oldCount = Number(match[2] ?? "1");
    const newStart = Number(match[3]);
    const newCount = Number(match[4] ?? "1");

    if (newCount > 0) {
      ranges.push({ from: newStart, to: newStart + newCount - 1 });
    }

    if (oldCount > 0 && newCount === 0) {
      deletions.push({ afterLine: Math.max(0, newStart), count: oldCount });
    }

    if (oldCount > newCount && newCount > 0) {
      deletions.push({ afterLine: newStart + newCount - 1, count: oldCount - newCount });
    }
  }

  return { path: relativePath, ranges, deletions };
}

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

function parseEnvValue(rawValue) {
  const value = rawValue.trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

async function readDotEnvCursorApiKey() {
  try {
    const envText = await fs.readFile(path.join(WEB_ROOT, ".env"), "utf8");
    const line = envText
      .split("\n")
      .map((candidate) => candidate.trim())
      .find((candidate) => candidate && !candidate.startsWith("#") && candidate.startsWith("CURSOR_API_KEY="));

    if (!line) return null;

    return parseEnvValue(line.slice("CURSOR_API_KEY=".length));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function readKeychainCursorApiKey() {
  if (process.platform !== "darwin") return null;

  try {
    const value = await execFileText("security", [
      "find-generic-password",
      "-a",
      process.env.USER ?? "",
      "-s",
      "cursor_api_key",
      "-w",
    ]);
    return value || null;
  } catch {
    return null;
  }
}

function warnAboutCursorKeySources(warnings) {
  for (const warning of warnings) {
    if (warnedCursorKeyMessages.has(warning)) continue;

    warnedCursorKeyMessages.add(warning);
    console.warn(`[kiss_ai UI warning] ${warning}`);
  }
}

async function resolveCursorApiKey() {
  const processEnvKey = process.env.CURSOR_API_KEY?.trim() || null;
  const dotEnvKey = await readDotEnvCursorApiKey();
  const keychainKey = await readKeychainCursorApiKey();
  const warnings = [];

  if (processEnvKey && dotEnvKey) {
    warnings.push(
      "Cursor API key is present in both the CURSOR_API_KEY environment variable and web/.env. Using CURSOR_API_KEY.",
    );
  }

  const envKey = processEnvKey || dotEnvKey;
  const envSource = processEnvKey ? "CURSOR_API_KEY environment variable" : dotEnvKey ? "web/.env" : null;

  if (envKey && keychainKey) {
    warnings.push(
      `Cursor API key is present in both ${envSource} and macOS Keychain item cursor_api_key. Using ${envSource}.`,
    );
  }

  warnAboutCursorKeySources(warnings);

  if (envKey) {
    return {
      apiKey: envKey,
      available: true,
      source: envSource,
      warnings,
    };
  }

  if (keychainKey) {
    return {
      apiKey: keychainKey,
      available: true,
      source: "macOS Keychain item cursor_api_key",
      warnings,
    };
  }

  return {
    apiKey: null,
    available: false,
    source: null,
    warnings,
  };
}

function isMaxModeModel(model) {
  const display = String(model.displayName ?? "").toLowerCase();
  const id = String(model.id ?? "").toLowerCase();
  if (/\bmax\s*mode\b/.test(display)) return true;
  if (/\(max\)/.test(display)) return true;
  if (/-max$/.test(id) || /-max-/.test(id)) return true;
  return false;
}

function isAutoModel(model) {
  return String(model.id ?? "").toLowerCase() === "default";
}

function getRebuildModelTier(model) {
  const text = `${model.id ?? ""} ${model.displayName ?? ""}`.toLowerCase();

  if (/\b(composer|haiku|flash|mini|nano|spark|fast)\b/.test(text)) return "small";
  if (/\b(opus|pro|grok|extra high|high)\b/.test(text)) return "high";
  return "medium";
}

function getRebuildModelProvider(model) {
  const text = `${model.id ?? ""} ${model.displayName ?? ""}`.toLowerCase();

  if (/\b(composer)\b/.test(text)) return "Cursor";
  if (/\b(gpt|codex)\b/.test(text)) return "OpenAI";
  if (/\b(claude|sonnet|opus|haiku)\b/.test(text)) return "Anthropic";
  if (/\b(gemini)\b/.test(text)) return "Google";
  if (/\b(grok)\b/.test(text)) return "xAI";
  return "";
}

async function listCursorModels(apiKey) {
  const models = await Cursor.models.list({ apiKey });
  return models
    .filter((model) => !isMaxModeModel(model))
    .filter((model) => !isAutoModel(model))
    .map((model) => ({
      id: model.id,
      displayName: model.displayName,
      description: model.description ?? "",
      provider: getRebuildModelProvider(model),
      tier: getRebuildModelTier(model),
    }));
}

function pickRebuildModelId(models, requestedModelId) {
  const availableModelIds = new Set(models.map((model) => model.id));
  const trimmedRequestedModelId = requestedModelId?.trim() || "";

  if (trimmedRequestedModelId) {
    if (availableModelIds.has(trimmedRequestedModelId)) return trimmedRequestedModelId;
    throw new Error(`Cannot use this model: ${trimmedRequestedModelId}. Available models: ${models.map((model) => model.id).join(", ")}.`);
  }

  const mediumOpenAiModel = models.find((model) => model.tier === "medium" && /^gpt-/.test(model.id));
  const mediumModel = models.find((model) => model.tier === "medium");
  const preferredModelIds = [process.env.CURSOR_MODEL?.trim(), "gpt-5.5", mediumOpenAiModel?.id, mediumModel?.id].filter(Boolean);
  return preferredModelIds.find((modelId) => availableModelIds.has(modelId)) ?? models[0]?.id ?? "gpt-5.5";
}

function parseDesignIdentity(markdown) {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  const tokens = match ? YAML.parse(match[1]) ?? {} : {};

  return {
    name: String(tokens.name ?? "kiss_ai Default"),
    description: String(tokens.description ?? ""),
    colors: tokens.colors ?? {},
    typography: tokens.typography ?? {},
    spacing: tokens.spacing ?? {},
    rounded: tokens.rounded ?? {},
    components: tokens.components ?? {},
  };
}

async function lintDesignIdentity(projectRoot) {
  return new Promise((resolve) => {
    execFile(
      "npx",
      ["@google/design.md", "lint", "human_design_identity.md"],
      { cwd: projectRoot, timeout: 30000 },
      (error, stdout, stderr) => {
        if (error) {
          resolve({
            available: false,
            ok: false,
            output: stdout || stderr,
            message: "DESIGN.md lint is unavailable or reported findings.",
          });
          return;
        }

        resolve({
          available: true,
          ok: true,
          output: stdout ? JSON.parse(stdout) : null,
          message: "DESIGN.md lint passed.",
        });
      },
    );
  });
}

async function appendRunLog(projectSlug, message) {
  await appendRunEvent(projectSlug, {
    type: "system",
    title: message,
    text: message,
    runtime: "cursor",
  });
}

function createRebuildPrompt(project) {
  return [
    "Run the kiss_ai rebuild for this project.",
    "",
    `Follow ${path.join(FRAMEWORK_ROOT, "commands/do_all_rebuild.md")} exactly.`,
    "This is a non-interactive web-triggered rebuild. Never ask the user for confirmation or wait for input mid-run.",
    "When a human decision is needed, choose the conservative default supported by current requirements, record a human-attention item with resolution_options, and continue when technically possible.",
    "Do not stop before downstream outputs for material source or output-impact findings; rebuild affected artifacts and record caveats clearly.",
    `Use ${FRAMEWORK_ROOT} as the canonical framework root.`,
    "Do not create or depend on a project-local framework/ folder.",
    "Do not operate outside this project root.",
    `Project root: ${project.path}`,
  ].join("\n");
}

function getResolutionOption(item, resolutionOptionId) {
  const options = Array.isArray(item.resolution_options) ? item.resolution_options : [];
  return options.find((option) => option && typeof option === "object" && option.id === resolutionOptionId) ?? null;
}

function requireResolutionRequest(body) {
  const itemId = String(body?.itemId ?? "").trim();
  const resolutionOptionId = String(body?.resolutionOptionId ?? "").trim();
  const manualPrompt = String(body?.manualPrompt ?? "").trim();

  if (!itemId) throw new Error("A human-attention item id is required.");
  if (resolutionOptionId && manualPrompt) throw new Error("Choose either a suggested option or a manual prompt, not both.");
  if (!resolutionOptionId && !manualPrompt) throw new Error("Choose a suggested option or provide a manual prompt.");

  return { itemId, resolutionOptionId: resolutionOptionId || null, manualPrompt: manualPrompt || null };
}

async function createHumanAttentionResolutionPrompt(project, requestBody) {
  const { itemId, resolutionOptionId, manualPrompt } = requireResolutionRequest(requestBody);
  const harness = await readProjectHarness(project.path);
  const item = getHumanAttentionItems(harness).find((candidate) => candidate.id === itemId);

  if (!item) {
    throw new Error("Human-attention item was not found or is no longer open.");
  }

  const selectedOption = resolutionOptionId ? getResolutionOption(item, resolutionOptionId) : null;
  if (resolutionOptionId && !selectedOption) {
    throw new Error("Selected resolution option was not found on this human-attention item.");
  }

  const selectedResolution = selectedOption
    ? {
        type: "suggested_option",
        id: selectedOption.id,
        label: selectedOption.label,
        prompt: selectedOption.prompt,
      }
    : {
        type: "manual_prompt",
        prompt: manualPrompt,
      };

  return {
    item,
    selectedOption,
    prompt: [
      "Resolve one kiss_ai human-attention item for this project.",
      "",
      `Project root: ${project.path}`,
      `Framework root: ${FRAMEWORK_ROOT}`,
      `Follow ${path.join(FRAMEWORK_ROOT, "commands/do_resolve_human_attention_item.md")} exactly.`,
      "",
      "This is a non-interactive web-triggered resolution run. Never ask the user for confirmation or wait for input mid-run.",
      "If the selected action cannot safely resolve the issue, keep the item open, record failure details, and generate updated resolution_options instead of asking a question.",
      "Do not operate outside this project root.",
      "",
      `attention_item_id: ${item.id}`,
      "",
      "Serialized attention item:",
      JSON.stringify(item, null, 2),
      "",
      "Selected resolution action:",
      JSON.stringify(selectedResolution, null, 2),
      "",
      "After completion, update .harness-state.json.extensions.human_attention.open_items and change_logs/human_attention_queue.md consistently.",
      "If all human-attention items are resolved, leave the project in a clean successful state where the existing harness status permits it.",
    ].join("\n"),
    context: {
      itemId: item.id,
      resolutionOptionId: selectedOption?.id ?? null,
      manual: Boolean(manualPrompt),
    },
  };
}

function createAgentJobCompletionMessage(jobName) {
  return async ({ project, result }) => {
    const harness = await readProjectHarness(project.path);
    const attentionCount = getHumanAttentionItems(harness).length;
    const finishedWithAttention = result.status === "finished" && attentionCount > 0;
    const status = result.status === "finished" ? (finishedWithAttention ? "finished_with_attention" : "finished") : "error";
    const message =
      result.status === "finished"
        ? finishedWithAttention
          ? `${jobName} finished with ${attentionCount} human-attention item${attentionCount === 1 ? "" : "s"} still open.`
          : `${jobName} finished.`
        : `${jobName} ended with status: ${result.status}`;

    return { attentionCount, finishedWithAttention, message, status };
  };
}

async function startAgentJob({
  project,
  requestedModelId,
  runKind,
  attentionContext = null,
  startMessage,
  noApiKeyMessage,
  noModelsMessage,
  jobName,
  prompt,
}) {
  const rebuildState = await getRebuildState(project.slug);

  if (rebuildState.running) {
    return rebuildState;
  }

  const cursorApiKey = await resolveCursorApiKey();

  if (!cursorApiKey.available) {
    await setRebuildState(project.slug, {
      ...rebuildState,
      running: false,
      status: "blocked",
      message: noApiKeyMessage,
      finishedAt: new Date().toISOString(),
      runKind,
      attentionContext,
    });
    await appendRunEvent(project.slug, {
      type: "error",
      title: `${jobName} blocked`,
      text: (await getRebuildState(project.slug)).message,
      status: "blocked",
      runtime: "cursor",
    });
    return await getRebuildState(project.slug);
  }

  const models = await listCursorModels(cursorApiKey.apiKey);

  if (!models.length) {
    await setRebuildState(project.slug, {
      ...rebuildState,
      running: false,
      status: "blocked",
      message: noModelsMessage,
      finishedAt: new Date().toISOString(),
      runKind,
      attentionContext,
    });
    await appendRunEvent(project.slug, {
      type: "error",
      title: `${jobName} blocked`,
      text: (await getRebuildState(project.slug)).message,
      status: "blocked",
      runtime: "cursor",
    });
    return await getRebuildState(project.slug);
  }

  const modelId = pickRebuildModelId(models, requestedModelId);

  await setRebuildState(project.slug, {
    running: true,
    runId: null,
    agentId: null,
    runtime: "cursor",
    status: "running",
    startedAt: new Date().toISOString(),
    finishedAt: null,
    modelId,
    message: startMessage,
    activeAssistantMessageId: null,
    events: [],
    log: [],
    runKind,
    attentionContext,
  });

  await appendRunLog(project.slug, `Using Cursor API key from ${cursorApiKey.source}.`);
  await appendRunLog(project.slug, `Using Cursor model: ${modelId}.`);

  runAgentJob({ project, apiKey: cursorApiKey.apiKey, modelId, prompt, jobName }).catch((error) => {
    void (async () => {
      const current = await getRebuildState(project.slug);
      await setRebuildState(project.slug, {
        ...current,
        running: false,
        status: "error",
        finishedAt: new Date().toISOString(),
        message: error instanceof Error ? error.message : `Unknown ${jobName.toLowerCase()} error.`,
      });
      await appendRunLog(project.slug, (await getRebuildState(project.slug)).message);
    })();
  });

  return await getRebuildState(project.slug);
}

async function startRebuild(project, requestedModelId) {
  return await startAgentJob({
    project,
    requestedModelId,
    runKind: "rebuild",
    startMessage: "Starting local Cursor agent rebuild.",
    noApiKeyMessage:
      "No Cursor API key found in CURSOR_API_KEY, web/.env, or macOS Keychain item cursor_api_key. Rebuilds are unavailable from the UI.",
    noModelsMessage: "No Cursor models remain after excluding MAX mode models. Add a non-MAX model to your account catalog or relax filters.",
    jobName: "Rebuild run",
    prompt: createRebuildPrompt(project),
  });
}

async function startHumanAttentionResolution(project, requestBody) {
  const { prompt, context } = await createHumanAttentionResolutionPrompt(project, requestBody);

  return await startAgentJob({
    project,
    requestedModelId: requestBody?.modelId,
    runKind: "human_attention_resolve",
    attentionContext: context,
    startMessage: "Starting local Cursor agent human-attention resolution.",
    noApiKeyMessage:
      "No Cursor API key found in CURSOR_API_KEY, web/.env, or macOS Keychain item cursor_api_key. Human-attention resolution is unavailable from the UI.",
    noModelsMessage: "No Cursor models remain after excluding MAX mode models. Add a non-MAX model to your account catalog or relax filters.",
    jobName: "Human-attention resolution",
    prompt,
  });
}

async function runAgentJob({ project, apiKey, modelId, prompt, jobName }) {
  activeRebuilds.add(project.slug);

  try {
    const result = await runCursorAgent({
      project,
      apiKey,
      modelId,
      prompt,
      onEvent: async (event) => {
        if (event.type === "assistant_delta") {
          await appendAssistantDelta(project.slug, event.text, event.metadata);
          return;
        }

        const current = await getRebuildState(project.slug);
        await setRebuildState(project.slug, {
          ...current,
          agentId: typeof event.metadata?.agentId === "string" ? event.metadata.agentId : current.agentId,
          runId: typeof event.metadata?.runId === "string" ? event.metadata.runId : current.runId,
        });
        await appendRunEvent(project.slug, event);
      },
    });

    await finishAssistantMessage(project.slug);
    const completedState = await getRebuildState(project.slug);
    const { attentionCount, finishedWithAttention, message, status } = await createAgentJobCompletionMessage(jobName)({ project, result });
    await setRebuildState(project.slug, {
      ...completedState,
      running: false,
      status,
      finishedAt: new Date().toISOString(),
      message,
    });
    await appendRunEvent(project.slug, {
      type: result.status === "finished" ? "run_status" : "error",
      title:
        finishedWithAttention ? `${jobName} finished with attention needed` : result.status === "finished" ? `${jobName} finished` : `${jobName} ended with an error`,
      text: message,
      status,
      runtime: "cursor",
      metadata: { resultStatus: result.status, attentionCount },
    });
  } catch (error) {
    await finishAssistantMessage(project.slug);
    const message = error instanceof Error ? error.message : `Unknown Cursor SDK ${jobName.toLowerCase()} failure.`;

    const current = await getRebuildState(project.slug);
    await setRebuildState(project.slug, {
      ...current,
      running: false,
      status: "error",
      finishedAt: new Date().toISOString(),
      message,
    });
    await appendRunEvent(project.slug, {
      type: "error",
      title: `${jobName} failed`,
      text: message,
      status: "error",
      runtime: "cursor",
    });
  } finally {
    activeRebuilds.delete(project.slug);
  }
}

app.get("/api/projects", async (_request, response, next) => {
  try {
    response.json({
      projectsRoot: PROJECTS_ROOT,
      projects: await discoverProjects(),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/projects", async (request, response, next) => {
  try {
    response.status(201).json(await createProjectFromTemplate(request.body));
  } catch (error) {
    next(error);
  }
});

app.get("/api/cursor/models", async (_request, response, next) => {
  try {
    const cursorApiKey = await resolveCursorApiKey();

    if (!cursorApiKey.available) {
      response.json({
        available: false,
        defaultModelId: null,
        models: [],
        source: null,
      });
      return;
    }

    const models = await listCursorModels(cursorApiKey.apiKey);
    response.json({
      available: true,
      defaultModelId: pickRebuildModelId(models),
      models,
      source: cursorApiKey.source,
    });
  } catch (error) {
    next(error);
  }
});

app.use("/api/projects/:projectSlug", attachProject);

app.get("/api/projects/:projectSlug/status", async (request, response, next) => {
  try {
    const project = request.project;
    const harness = await readProjectJson(project.path, ".harness-state.json", {});
    const cursorApiKey = await resolveCursorApiKey();
    const inputAnnotations = await listMarkdownFiles(project.path, "inputs_ai", "ai", false, true);

    response.json({
      projectSlug: harness.project_slug ?? project.slug,
      projectName: displayProjectName(harness.project_name ?? project.name, harness.project_slug ?? project.slug),
      setupStatus: harness.setup?.status ?? "unknown",
      setupInitializedAt: harness.setup?.initialized_at ?? null,
      lastRunAt: harness.last_run_at ?? null,
      lastSuccessfulRunAt: harness.last_successful_run_at ?? null,
      scalingMode: harness.scaling_assessment?.selected_mode ?? null,
      rebuildStatus: harness.rebuild_scope?.status ?? null,
      lintStatus: harness.last_lint?.status ?? null,
      annotationStatus: harness.last_annotation_scan?.status ?? null,
      annotationsLogged: harness.last_annotation_scan?.annotations_logged ?? 0,
      annotationFiles: inputAnnotations.length,
      unresolvedReviewItems: harness.last_annotation_scan?.unresolved_review_items ?? [],
      blockedArtifacts: harness.rebuild_scope?.blocked_artifacts ?? [],
      staleOutputs: harness.rebuild_scope?.outputs_marked_stale ?? [],
      humanAttentionItems: getHumanAttentionItems(harness),
      humanAttentionCount: getHumanAttentionItems(harness).length,
      cursorApiKeyAvailable: cursorApiKey.available,
      cursorApiKeySource: cursorApiKey.source,
      cursorApiKeyWarnings: cursorApiKey.warnings,
      gitStatus: await gitStatus(project.path),
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/projects/:projectSlug/build-log", async (request, response, next) => {
  try {
    const summaries = await listBuildSummaries(request.project.path);
    const latestSummary = summaries[0] ? summaryContentItem(summaries[0]) : null;
    const requestedSummaryPath = String(request.query.summary ?? "");
    const requestedSectionId = String(request.query.section ?? "");
    const requestedSummary = requestedSummaryPath ? summaries.find((summary) => summary.path === requestedSummaryPath) : null;

    response.json({
      latestSummary,
      selectedSummary: requestedSummary ? summaryContentItem(requestedSummary, requestedSectionId || null) : null,
      summaries: summaries.map(summaryListItem),
      aggregateLogExcerpt: await readAggregateBuildLogExcerpt(request.project.path),
    });
  } catch (error) {
    next(error);
  }
});

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
    if (!config) throw new Error("Unknown tree section.");

    response.json({
      files: await listMarkdownFiles(project.path, config.root, config.kind, config.editable, config.annotation),
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/projects/:projectSlug/search/files", async (request, response, next) => {
  try {
    response.json({ files: await searchFiles(request.project.path, String(request.query.q ?? "")) });
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

app.post("/api/projects/:projectSlug/ai-assist/propose", async (request, response, next) => {
  try {
    response.json(await runAiAssistProposal(request.project, request.body));
  } catch (error) {
    next(error);
  }
});

app.post("/api/projects/:projectSlug/ai-assist/refine", async (request, response, next) => {
  try {
    response.json(await runAiAssistProposal(request.project, request.body));
  } catch (error) {
    next(error);
  }
});

app.post("/api/projects/:projectSlug/requirements/auto-update/propose", async (request, response, next) => {
  try {
    response.json(await runRequirementsAutoUpdateProposal(request.project, request.body));
  } catch (error) {
    next(error);
  }
});

app.post("/api/projects/:projectSlug/requirements/auto-update/accept", async (request, response, next) => {
  try {
    response.json(await acceptRequirementsAutoUpdate(request.project, request.body));
  } catch (error) {
    next(error);
  }
});

app.get("/api/projects/:projectSlug/design", async (request, response, next) => {
  try {
    const file = await readTextFile(request.project.path, "human_design_identity.md");
    response.json({
      file,
      parsed: parseDesignIdentity(file.content),
      lint: await lintDesignIdentity(request.project.path),
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/projects/:projectSlug/rebuild", async (request, response, next) => {
  try {
    response.json(await getRebuildState(request.project.slug));
  } catch (error) {
    next(error);
  }
});

app.get("/api/projects/:projectSlug/rebuild/events", async (request, response, next) => {
  try {
    response.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    });
    response.flushHeaders?.();

    const send = (eventName, payload) => {
      response.write(`event: ${eventName}\n`);
      response.write(`data: ${JSON.stringify(payload)}\n\n`);
    };
    const unsubscribe = subscribeToRebuild(request.project.slug, ({ state, event }) => {
      send("event", { state, event });
    });

    send("snapshot", await getRebuildState(request.project.slug));

    request.on("close", () => {
      unsubscribe();
      response.end();
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/projects/:projectSlug/rebuild/start", async (request, response, next) => {
  try {
    response.json(await startRebuild(request.project, request.body.modelId));
  } catch (error) {
    next(error);
  }
});

app.post("/api/projects/:projectSlug/human-attention/resolve", async (request, response, next) => {
  try {
    response.json(await startHumanAttentionResolution(request.project, request.body));
  } catch (error) {
    next(error);
  }
});

app.use((error, _request, response, _next) => {
  response.status(Number(error?.statusCode ?? 400)).json({
    error: error instanceof Error ? error.message : "Unknown API error.",
  });
});

app.listen(PORT, "127.0.0.1", () => {
  console.log(`kiss_ai projects UI API listening on http://127.0.0.1:${PORT}`);
  console.log(`kiss_ai projects root: ${PROJECTS_ROOT}`);
  resolveCursorApiKey().catch((error) => {
    console.warn(`[kiss_ai UI warning] Cursor API key source check failed: ${error.message}`);
  });
});
