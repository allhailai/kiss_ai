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

    await expect(service.discoverProjects()).resolves.toEqual([
      expect.objectContaining({ name: "corrupt_project", slug: "corrupt_project" }),
      expect.objectContaining({ name: "Good Project", slug: "good_project" }),
    ]);
    await expect(service.resolveProject("corrupt_project")).rejects.toMatchObject({ code: "corrupt_harness_state" });
  });
});
