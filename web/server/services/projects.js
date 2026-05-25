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

  async function readDiscoveryManifest(projectRoot) {
    try {
      const manifestPath = path.join(projectRoot, ".build", "manifest.json");
      const content = await fs.readFile(manifestPath, "utf8");
      return JSON.parse(content);
    } catch {
      // Fall back to v1 harness-state for backwards compatibility
      try {
        if (readProjectHarness) {
          return await readProjectHarness(projectRoot);
        }
      } catch {
        // ignore
      }
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
        fileExists(path.join(projectRootReal, "project.md")),
        fileExists(path.join(projectRootReal, ".build", "manifest.json")),
        fileExists(path.join(projectRootReal, "inputs_human")),
        fileExists(path.join(projectRootReal, "outputs_ai")),
        // v1 backwards compatibility signals
        fileExists(path.join(projectRootReal, ".harness-state.json")),
        fileExists(path.join(projectRootReal, "human_goal_requirements.md")),
      ]);

      if (!isProjectSignalPresent(signals)) continue;

      const manifest = await readDiscoveryManifest(projectRootReal);
      const stat = await fs.stat(projectRootReal);

      projects.push({
        slug: entry.name,
        name: manifest.project_name ?? displayProjectName(null, entry.name),
        path: projectRootReal,
        setupStatus: manifest.last_build ? "built" : "initialized",
        modifiedAt: stat.mtime.toISOString(),
        createdAt: stat.birthtime?.toISOString() || null,
        lastBuildAt: manifest.last_build || null,
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
      fileExists(path.join(projectRootReal, "project.md")),
      fileExists(path.join(projectRootReal, ".build", "manifest.json")),
      fileExists(path.join(projectRootReal, "inputs_human")),
      fileExists(path.join(projectRootReal, "outputs_ai")),
      // v1 backwards compatibility signals
      fileExists(path.join(projectRootReal, ".harness-state.json")),
      fileExists(path.join(projectRootReal, "human_goal_requirements.md")),
    ]);

    if (!isProjectSignalPresent(signals)) {
      throw httpError("Project was not found under the configured projects root.", 404, "project_not_found");
    }

    const manifest = await readDiscoveryManifest(projectRootReal);
    return {
      slug: projectSlug,
      name: manifest.project_name ?? displayProjectName(null, projectSlug),
      path: projectRootReal,
      setupStatus: manifest.last_build ? "built" : "initialized",
      modifiedAt: stat.mtime.toISOString(),
      createdAt: stat.birthtime?.toISOString() || null,
      lastBuildAt: manifest.last_build || null,
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

  async function initializeManifest(projectRoot, { name, slug }) {
    const manifestPath = path.join(projectRoot, ".build", "manifest.json");
    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));

    manifest.project_name = name;

    await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  }

  function replaceMarkdownSection(content, heading, body) {
    const pattern = new RegExp(`(## ${heading}\\n\\n)[\\s\\S]*?(?=\\n## |$)`);

    if (!pattern.test(content)) {
      return `${content.trimEnd()}\n\n## ${heading}\n\n${body.trim()}\n`;
    }

    return content.replace(pattern, `$1${body.trim()}\n`);
  }

  async function initializeProjectFile(projectRoot, projectName) {
    const projectPath = path.join(projectRoot, "project.md");
    let content = await fs.readFile(projectPath, "utf8");
    content = content.replace(
      "# Project: New kiss_ai Research Project",
      `# Project: ${projectName}`,
    );
    await fs.writeFile(projectPath, content, "utf8");
  }

  async function prependInitializationLog(projectRoot, { name, slug }) {
    const logPath = path.join(projectRoot, "change_logs", "builds.md");
    const content = await fs.readFile(logPath, "utf8");
    const entry = [
      `## ${new Date().toISOString()} — Project initialized`,
      "",
      `- Created project scaffold for ${name} (${slug}).`,
      "- Initialized a local Git repository and recorded the setup baseline.",
      "",
    ].join("\n");

    const headerPattern = /^(# Build Log\s*\n\s*Build history for this project\..*\n)/;
    const nextContent = headerPattern.test(content)
      ? content.replace(headerPattern, `$1\n${entry}`)
      : `${entry}\n${content.trimStart()}`;

    await fs.writeFile(logPath, nextContent, "utf8");
  }

  async function gitInitProject(projectRoot) {
    try {
      await execFileText("git", ["init"], { cwd: projectRoot });
      await execFileText("git", ["add", "--all"], { cwd: projectRoot });
      await execFileText("git", ["-c", "user.name=kiss_ai", "-c", "user.email=kiss_ai@local", "commit", "-m", "Initialize kiss_ai project"], {
        cwd: projectRoot,
      });

      const status = await execFileText("git", ["status", "--short"], { cwd: projectRoot });
      if (status) {
        throw httpError("Project setup completed, but the new Git repository is not clean.", 500, "project_git_dirty");
      }
    } catch (error) {
      if (error?.statusCode) throw error;
      throw httpError("Could not initialize the new project Git repository.", 500, "project_git_init_failed");
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
      await initializeManifest(project.projectRoot, project);
      await initializeProjectFile(project.projectRoot, project.name);
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
