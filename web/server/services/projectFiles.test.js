import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createProjectFileService } from "./projectFiles.js";
import { httpError } from "./httpErrors.js";

function createService(webRoot) {
  return createProjectFileService({
    WEB_ROOT: webRoot,
    MAX_FILE_BYTES: 1024 * 1024,
    MAX_UPLOAD_BYTES: 1024 * 1024,
    MAX_SEARCH_RESULTS: 10,
    humanFiles: new Map([["human_goal_requirements.md", { kind: "human", editable: true, annotation: false }]]),
    hashText: (value) => `hash:${String(value).length}`,
    humanizePathSegment: (value) => value,
    httpError,
  });
}

describe("projectFiles path safety", () => {
  it("rejects traversal-like relative paths instead of normalizing them", async () => {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kiss-ai-project-"));
    const service = createService(projectRoot);

    expect(() => service.projectPath(projectRoot, "../human_goal_requirements.md")).toThrow("Path escapes the project root.");
    expect(() => service.projectPath(projectRoot, "inputs_human/../human_goal_requirements.md")).toThrow("Path escapes the project root.");
  });

  it("allows and reads allowlisted project files", async () => {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kiss-ai-project-"));
    const service = createService(projectRoot);
    await fs.writeFile(path.join(projectRoot, "human_goal_requirements.md"), "Goal\n", "utf8");

    await expect(service.readTextFile(projectRoot, "human_goal_requirements.md")).resolves.toMatchObject({
      path: "human_goal_requirements.md",
      content: "Goal\n",
      editable: true,
    });
  });
});
