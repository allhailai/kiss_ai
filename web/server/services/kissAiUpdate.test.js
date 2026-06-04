import { describe, expect, it, vi } from "vitest";
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
  it("reports when a remote update is available", async () => {
    const calls = [];
    const updateService = createKissAiUpdateService({
      HUB_ROOT: "/repo/_kiss_ai",
      WEB_ROOT: "/repo/_kiss_ai/web",
      PORT: 8787,
      execFileText: createExecFileText(
        {
          "git rev-parse --is-inside-work-tree": "true",
          "git status --porcelain": "",
          "git rev-parse --abbrev-ref --symbolic-full-name @{u}": "target/master",
          "git fetch --prune target": "",
          "git rev-parse --short HEAD": "aaa111",
          "git rev-parse --short target/master": "bbb222",
        },
        calls,
      ),
      httpError,
    });

    await expect(updateService.checkKissAiUpdate()).resolves.toEqual({
      status: "update_available",
      updateAvailable: true,
      localRevision: "aaa111",
      remoteRevision: "bbb222",
      upstream: "target/master",
    });
    expect(calls).toContainEqual({ command: "git", args: ["fetch", "--prune", "target"], options: { cwd: "/repo/_kiss_ai" } });
  });

  it("reports when KISS AI is already up to date", async () => {
    const updateService = createKissAiUpdateService({
      HUB_ROOT: "/repo/_kiss_ai",
      WEB_ROOT: "/repo/_kiss_ai/web",
      PORT: 8787,
      execFileText: createExecFileText({
        "git rev-parse --is-inside-work-tree": "true",
        "git status --porcelain": "",
        "git rev-parse --abbrev-ref --symbolic-full-name @{u}": "target/master",
        "git fetch --prune target": "",
        "git rev-parse --short HEAD": "aaa111",
        "git rev-parse --short target/master": "aaa111",
      }),
      httpError,
    });

    await expect(updateService.checkKissAiUpdate()).resolves.toMatchObject({
      status: "up_to_date",
      updateAvailable: false,
      localRevision: "aaa111",
      remoteRevision: "aaa111",
    });
  });

  it("pulls latest files and installs dependencies when package files changed", async () => {
    const calls = [];
    const updateService = createKissAiUpdateService({
      HUB_ROOT: "/repo/_kiss_ai",
      WEB_ROOT: "/repo/_kiss_ai/web",
      PORT: 8787,
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
      PORT: 8787,
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

  it("blocks update checks when _kiss_ai has local changes", async () => {
    const updateService = createKissAiUpdateService({
      HUB_ROOT: "/repo/_kiss_ai",
      WEB_ROOT: "/repo/_kiss_ai/web",
      PORT: 8787,
      execFileText: createExecFileText({
        "git rev-parse --is-inside-work-tree": "true",
        "git status --porcelain": " M README.md",
      }),
      httpError,
    });

    await expect(updateService.checkKissAiUpdate()).rejects.toMatchObject({
      code: "kiss_ai_working_tree_dirty",
      statusCode: 409,
    });
  });

  it("allows update checks when only package-lock.json is modified", async () => {
    const updateService = createKissAiUpdateService({
      HUB_ROOT: "/repo/_kiss_ai",
      WEB_ROOT: "/repo/_kiss_ai/web",
      PORT: 8787,
      execFileText: createExecFileText({
        "git rev-parse --is-inside-work-tree": "true",
        "git status --porcelain": " M web/package-lock.json",
        "git rev-parse --abbrev-ref --symbolic-full-name @{u}": "target/master",
        "git fetch --prune target": "",
        "git rev-parse --short HEAD": "aaa111",
        "git rev-parse --short target/master": "aaa111",
      }),
      httpError,
    });

    await expect(updateService.checkKissAiUpdate()).resolves.toMatchObject({
      status: "up_to_date",
      updateAvailable: false,
    });
  });

  it("updateAndRestart returns restarting:false when already up to date", async () => {
    const updateService = createKissAiUpdateService({
      HUB_ROOT: "/repo/_kiss_ai",
      WEB_ROOT: "/repo/_kiss_ai/web",
      PORT: 8787,
      execFileText: createExecFileText({
        "git rev-parse --is-inside-work-tree": "true",
        "git status --porcelain": "",
        "git rev-parse --short HEAD": ["aaa111", "aaa111"],
        "git pull --ff-only": "Already up to date.",
      }),
      httpError,
    });

    const result = await updateService.updateAndRestart();

    expect(result).toMatchObject({
      status: "up_to_date",
      restarting: false,
      beforeRevision: "aaa111",
      afterRevision: "aaa111",
    });
  });

  it("updateAndRestart spawns restart script and schedules exit when update is available", async () => {
    // Mock process.exit and setTimeout to prevent actual exit during test
    // @ts-expect-error -- mock implementation doesn't need to return `never`
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {});
    // @ts-expect-error -- mock returns number instead of Timeout
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout").mockImplementation(() => 0);

    // Mock child_process.spawn via the module — since the service uses spawn internally,
    // we verify the behavior through the return value (restarting: true).
    const updateService = createKissAiUpdateService({
      HUB_ROOT: "/repo/_kiss_ai",
      WEB_ROOT: "/repo/_kiss_ai/web",
      PORT: 8787,
      execFileText: createExecFileText({
        "git rev-parse --is-inside-work-tree": "true",
        "git status --porcelain": "",
        "git rev-parse --short HEAD": ["aaa111", "bbb222"],
        "git pull --ff-only": "Updating aaa111..bbb222",
      }),
      httpError,
    });

    const result = await updateService.updateAndRestart();

    expect(result).toMatchObject({
      status: "updated",
      restarting: true,
      beforeRevision: "aaa111",
      afterRevision: "bbb222",
    });

    // Verify that process.exit was scheduled
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 500);

    exitSpy.mockRestore();
    setTimeoutSpy.mockRestore();
  });
});

