import express from "express";
import { Agent, CursorAgentError } from "@cursor/sdk";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(__dirname, "..");
const PROJECTS_ROOT = path.resolve(process.env.KISS_AI_PROJECTS_ROOT ?? path.resolve(WEB_ROOT, "..", ".."));
const PORT = Number(process.env.KISS_AI_UI_PORT ?? 8787);
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_SEARCH_RESULTS = 25;
const warnedCursorKeyMessages = new Set();
const reservedProjectDirectories = new Set(["_kiss_ai", ".obsidian", "_archive", "_templates"]);
const projectSlugPattern = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;

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

const rebuildStates = new Map();

function createIdleRebuildState() {
  return {
    running: false,
    runId: null,
    agentId: null,
    status: "idle",
    startedAt: null,
    finishedAt: null,
    message: "No rebuild has been started from the UI.",
    log: [],
  };
}

function getRebuildState(projectSlug) {
  const existing = rebuildStates.get(projectSlug);
  if (existing) return existing;

  const next = createIdleRebuildState();
  rebuildStates.set(projectSlug, next);
  return next;
}

function setRebuildState(projectSlug, nextState) {
  rebuildStates.set(projectSlug, nextState);
  return nextState;
}

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

async function readProjectHarness(projectRoot) {
  try {
    return JSON.parse(await fs.readFile(path.join(projectRoot, ".harness-state.json"), "utf8"));
  } catch {
    return {};
  }
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

async function readTextFile(projectRoot, relativePath) {
  const meta = classifyPath(projectRoot, relativePath);
  const { absolute } = projectPath(projectRoot, meta.path);
  const stat = await fs.stat(absolute);

  if (stat.size > MAX_FILE_BYTES) {
    throw new Error("File is too large to open in the lab UI.");
  }

  return {
    ...meta,
    content: await fs.readFile(absolute, "utf8"),
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

function appendRunLog(projectSlug, message) {
  const rebuildState = getRebuildState(projectSlug);
  setRebuildState(projectSlug, {
    ...rebuildState,
    log: [...rebuildState.log.slice(-300), `[${new Date().toISOString()}] ${message}`],
  });
}

async function startRebuild(project) {
  const rebuildState = getRebuildState(project.slug);

  if (rebuildState.running) {
    return rebuildState;
  }

  const cursorApiKey = await resolveCursorApiKey();

  if (!cursorApiKey.available) {
    return setRebuildState(project.slug, {
      ...rebuildState,
      running: false,
      status: "blocked",
      message:
        "No Cursor API key found in CURSOR_API_KEY, web/.env, or macOS Keychain item cursor_api_key. Rebuilds are unavailable from the UI.",
      finishedAt: new Date().toISOString(),
    });
  }

  setRebuildState(project.slug, {
    running: true,
    runId: null,
    agentId: null,
    status: "running",
    startedAt: new Date().toISOString(),
    finishedAt: null,
    message: "Starting local Cursor agent rebuild.",
    log: [],
  });

  appendRunLog(project.slug, `Using Cursor API key from ${cursorApiKey.source}.`);

  runRebuildAgent(project, cursorApiKey.apiKey).catch((error) => {
    const current = getRebuildState(project.slug);
    setRebuildState(project.slug, {
      ...current,
      running: false,
      status: "error",
      finishedAt: new Date().toISOString(),
      message: error instanceof Error ? error.message : "Unknown rebuild error.",
    });
    appendRunLog(project.slug, getRebuildState(project.slug).message);
  });

  return getRebuildState(project.slug);
}

async function runRebuildAgent(project, apiKey) {
  let agent;

  try {
    agent = Agent.create({
      apiKey,
      model: { id: process.env.CURSOR_MODEL ?? "auto" },
      local: { cwd: project.path },
    });

    const createdState = getRebuildState(project.slug);
    setRebuildState(project.slug, { ...createdState, agentId: agent.agentId ?? null });
    appendRunLog(project.slug, `Agent created: ${getRebuildState(project.slug).agentId ?? "local"}`);

    const prompt = [
      "Run the kiss_ai rebuild for this project.",
      "",
      "Follow framework/commands/do_all_rebuild.md exactly.",
      "Respect all review gates. If a review gate blocks, stop and report the blocker clearly.",
      "Do not operate outside this project root.",
    ].join("\n");

    const run = await agent.send(prompt);
    const startedState = getRebuildState(project.slug);
    setRebuildState(project.slug, { ...startedState, runId: run.id ?? null });
    appendRunLog(project.slug, `Run started: ${getRebuildState(project.slug).runId ?? "unknown"}`);

    if (run.supports("stream")) {
      for await (const event of run.stream()) {
        if (event.type !== "assistant") continue;

        for (const block of event.message.content) {
          if (block.type === "text" && block.text.trim()) {
            appendRunLog(project.slug, block.text.trim());
          }
        }
      }
    }

    const result = await run.wait();
    const completedState = getRebuildState(project.slug);
    setRebuildState(project.slug, {
      ...completedState,
      running: false,
      status: result.status === "finished" ? "finished" : "error",
      finishedAt: new Date().toISOString(),
      message:
        result.status === "finished"
          ? "Rebuild run finished."
          : `Rebuild run ended with status: ${result.status}`,
    });
    appendRunLog(project.slug, getRebuildState(project.slug).message);
  } catch (error) {
    const message =
      error instanceof CursorAgentError
        ? `Cursor SDK startup failed: ${error.message}`
        : error instanceof Error
          ? error.message
          : "Unknown Cursor SDK rebuild failure.";

    const current = getRebuildState(project.slug);
    setRebuildState(project.slug, {
      ...current,
      running: false,
      status: "error",
      finishedAt: new Date().toISOString(),
      message,
    });
    appendRunLog(project.slug, message);
  } finally {
    if (agent) {
      await agent[Symbol.asyncDispose]();
    }
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
      cursorApiKeyAvailable: cursorApiKey.available,
      cursorApiKeySource: cursorApiKey.source,
      cursorApiKeyWarnings: cursorApiKey.warnings,
      gitStatus: await gitStatus(project.path),
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

app.get("/api/projects/:projectSlug/rebuild", (request, response) => {
  response.json(getRebuildState(request.project.slug));
});

app.post("/api/projects/:projectSlug/rebuild/start", async (request, response, next) => {
  try {
    response.json(await startRebuild(request.project));
  } catch (error) {
    next(error);
  }
});

app.use((error, _request, response, _next) => {
  response.status(400).json({
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
