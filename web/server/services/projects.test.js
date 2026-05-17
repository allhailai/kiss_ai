import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { httpError } from "./httpErrors.js";
import { createProjectService } from "./projects.js";

function fileExists(absolutePath) {
  return fs
    .access(absolutePath)
    .then(() => true)
    .catch(() => false);
}

function isPathInsideRoot(root, candidate) {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

function createService(projectsRoot, readProjectHarness) {
  return createProjectService({
    PROJECTS_ROOT: projectsRoot,
    FRAMEWORK_ROOT: projectsRoot,
    reservedProjectDirectories: new Set(),
    projectSlugPattern: /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/,
    displayProjectName: (projectName, projectSlug) => projectName || projectSlug,
    execFileText: async () => "",
    fileExists,
    httpError,
    isPathInsideRoot,
    readProjectHarness,
  });
}

describe("project service", () => {
  it("discovers v2 projects with project.md", async () => {
    const projectsRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kiss-ai-projects-"));
    const v2ProjectRoot = path.join(projectsRoot, "v2_project");
    await fs.mkdir(v2ProjectRoot);
    await fs.writeFile(path.join(v2ProjectRoot, "project.md"), "# Project: v2_project\n", "utf8");

    const service = createService(projectsRoot, async () => ({}));
    const projects = await service.discoverProjects();
    expect(projects).toEqual([
      expect.objectContaining({ slug: "v2_project", setupStatus: "initialized" }),
    ]);
  });

  it("discovers v1 projects with human_goal_requirements.md", async () => {
    const projectsRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kiss-ai-projects-"));
    const v1ProjectRoot = path.join(projectsRoot, "v1_project");
    await fs.mkdir(v1ProjectRoot);
    await fs.writeFile(path.join(v1ProjectRoot, "human_goal_requirements.md"), "Goal\n", "utf8");

    const service = createService(projectsRoot, async () => ({ project_name: "V1 Project" }));
    const projects = await service.discoverProjects();
    expect(projects).toEqual([
      expect.objectContaining({ slug: "v1_project", name: "V1 Project" }),
    ]);
  });

  it("keeps project discovery available when one harness is corrupt", async () => {
    const projectsRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kiss-ai-projects-"));
    const goodProjectRoot = path.join(projectsRoot, "good_project");
    const corruptProjectRoot = path.join(projectsRoot, "corrupt_project");
    await fs.mkdir(goodProjectRoot);
    await fs.mkdir(corruptProjectRoot);
    await fs.writeFile(path.join(goodProjectRoot, "human_goal_requirements.md"), "Goal\n", "utf8");
    await fs.writeFile(path.join(corruptProjectRoot, "human_goal_requirements.md"), "Goal\n", "utf8");

    const service = createService(projectsRoot, async (projectRoot) => {
      if (path.basename(projectRoot) === "corrupt_project") {
        throw httpError("Could not parse .harness-state.json. Fix or remove the corrupt harness file.", 500, "corrupt_harness_state");
      }
      return { project_name: "Good Project" };
    });

    // Both projects should be discoverable — corrupt harness is gracefully handled
    const projects = await service.discoverProjects();
    expect(projects).toHaveLength(2);
    expect(projects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Good Project", slug: "good_project" }),
        expect.objectContaining({ slug: "corrupt_project" }),
      ]),
    );
  });
});
