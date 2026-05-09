import fs from "node:fs/promises";
import path from "node:path";

export function createProjectService({
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
}) {
  function isProjectSignalPresent(results) {
    return results.some(Boolean);
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

  async function readProjectSummary(projectSlug) {
    const projectsRootReal = await fs.realpath(PROJECTS_ROOT);
    const projectRoot = path.join(projectsRootReal, projectSlug);
    const projectRootReal = await fs.realpath(projectRoot);

    if (!isPathInsideRoot(projectsRootReal, projectRootReal)) {
      throw httpError("Project path escapes the configured projects root.", 403, "project_path_escape");
    }

    const stat = await fs.stat(projectRootReal);
    if (!stat.isDirectory()) {
      throw httpError("Project was not found under the configured projects root.", 404, "project_not_found");
    }

    const signals = await Promise.all([
      fileExists(path.join(projectRootReal, ".git")),
      fileExists(path.join(projectRootReal, ".harness-state.json")),
      fileExists(path.join(projectRootReal, "human_goal_requirements.md")),
      fileExists(path.join(projectRootReal, "inputs_human")),
      fileExists(path.join(projectRootReal, "outputs_ai")),
    ]);

    if (!isProjectSignalPresent(signals)) {
      throw httpError("Project was not found under the configured projects root.", 404, "project_not_found");
    }

    const harness = await readProjectHarness(projectRootReal);
    return {
      slug: projectSlug,
      name: displayProjectName(harness.project_name, harness.project_slug ?? projectSlug),
      path: projectRootReal,
      setupStatus: harness.setup?.status ?? "unknown",
      modifiedAt: stat.mtime.toISOString(),
    };
  }

  async function resolveProject(projectSlug) {
    if (!projectSlugPattern.test(projectSlug)) {
      throw httpError("Invalid project slug.", 400, "invalid_project_slug");
    }

    try {
      return await readProjectSummary(projectSlug);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      throw httpError("Project was not found under the configured projects root.", 404, "project_not_found");
    }
  }

  async function attachProject(request, _response, next) {
    try {
      request.project = await resolveProject(request.params.projectSlug);
      next();
    } catch (error) {
      next(error);
    }
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
      throw httpError("A project folder with that name already exists.", 409, "project_exists");
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
      throw httpError("Project template was not found under the configured framework root.", 500, "project_template_missing");
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

  return {
    attachProject,
    createProjectFromTemplate,
    discoverProjects,
    resolveProject,
  };
}
