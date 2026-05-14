import { describe, expect, it } from "vitest";
import { httpError } from "./httpErrors.js";
import { createKissAiUpdateService } from "./kissAiUpdate.js";

function createExecFileText(outputs, calls = []) {
  return async (command, args, options) => {
    calls.push({ command, args, options });
    const key = [command, ...args].join(" ");
    const output = Array.isArray(outputs[key]) ? outputs[key].shift() : outputs[key];
    if (output instanceof Error) throw output;
    return output ?? "";
  };
}

describe("kissAiUpdate service", () => {
  it("pulls latest files and installs dependencies when package files changed", async () => {
    const calls = [];
    const updateService = createKissAiUpdateService({
      HUB_ROOT: "/repo/_kiss_ai",
      WEB_ROOT: "/repo/_kiss_ai/web",
      execFileText: createExecFileText(
        {
          "git rev-parse --is-inside-work-tree": "true",
          "git status --porcelain": "",
          "git rev-parse --short HEAD": ["aaa111", "bbb222"],
          "git pull --ff-only": "Updating aaa111..bbb222",
          "git diff --name-only aaa111 bbb222 -- web/package.json web/package-lock.json": "web/package-lock.json",
          "npm install": "up to date",
        },
        calls,
      ),
      httpError,
    });

    const result = await updateService.updateKissAi();

    expect(result).toMatchObject({
      status: "updated",
      beforeRevision: "aaa111",
      afterRevision: "bbb222",
      dependencyInstall: { ran: true, output: "up to date" },
    });
    expect(calls).toContainEqual({ command: "npm", args: ["install"], options: { cwd: "/repo/_kiss_ai/web" } });
  });

  it("blocks updates when _kiss_ai has local changes", async () => {
    const updateService = createKissAiUpdateService({
      HUB_ROOT: "/repo/_kiss_ai",
      WEB_ROOT: "/repo/_kiss_ai/web",
      execFileText: createExecFileText({
        "git rev-parse --is-inside-work-tree": "true",
        "git status --porcelain": " M README.md",
      }),
      httpError,
    });

    await expect(updateService.updateKissAi()).rejects.toMatchObject({
      code: "kiss_ai_working_tree_dirty",
      statusCode: 409,
    });
  });
});
