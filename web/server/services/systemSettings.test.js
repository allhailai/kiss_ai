import { describe, expect, it } from "vitest";
import { httpError } from "./httpErrors.js";
import { createSystemSettingsService } from "./systemSettings.js";

function createExecFileText(calls = [], fail = false) {
  return async (command, args) => {
    calls.push({ command, args });
    if (fail) throw new Error("command failed");
    return "";
  };
}

describe("systemSettings service", () => {
  it("reports when a Cursor API key is available without returning the key", async () => {
    const service = createSystemSettingsService({
      execFileText: createExecFileText(),
      httpError,
      listCursorModels: async () => [],
      resolveCursorApiKey: async () => ({
        apiKey: "secret-key",
        available: true,
        source: "macOS Keychain item cursor_api_key",
        warnings: [],
      }),
    });

    await expect(service.systemSettings()).resolves.toEqual({
      cursorApiKeyAvailable: true,
      cursorApiKeySource: "macOS Keychain item cursor_api_key",
      cursorApiKeyWarnings: [],
    });
  });

  it("reports when a Cursor API key is missing", async () => {
    const service = createSystemSettingsService({
      execFileText: createExecFileText(),
      httpError,
      listCursorModels: async () => [],
      resolveCursorApiKey: async () => ({
        apiKey: null,
        available: false,
        source: null,
        warnings: [],
      }),
    });

    await expect(service.systemSettings()).resolves.toMatchObject({
      cursorApiKeyAvailable: false,
      cursorApiKeySource: null,
    });
  });

  it("saves the Cursor API key to macOS Keychain and validates it", async () => {
    const calls = [];
    const service = createSystemSettingsService({
      execFileText: createExecFileText(calls),
      httpError,
      listCursorModels: async () => [{ id: "model-a" }],
      platform: "darwin",
      resolveCursorApiKey: async () => ({ available: false, source: null, warnings: [] }),
      userName: "test-user",
    });

    await expect(service.saveCursorApiKey("cursor-secret")).resolves.toEqual({
      ok: true,
      message: "Success! API key has been saved and works.",
    });
    expect(calls).toEqual([
      {
        command: "security",
        args: ["add-generic-password", "-U", "-a", "test-user", "-s", "cursor_api_key", "-w", "cursor-secret"],
      },
    ]);
  });

  it("returns the standard failure when validation fails", async () => {
    const service = createSystemSettingsService({
      execFileText: createExecFileText(),
      httpError,
      listCursorModels: async () => {
        throw new Error("invalid");
      },
      platform: "darwin",
      resolveCursorApiKey: async () => ({ available: false, source: null, warnings: [] }),
    });

    await expect(service.saveCursorApiKey("bad-key")).rejects.toMatchObject({
      code: "cursor_api_key_validation_failed",
      message: "Failed! Please try again. If this issue persists, contact AllHail.AI",
    });
  });

  it("rejects saving Cursor API keys on non-mac platforms", async () => {
    const service = createSystemSettingsService({
      execFileText: createExecFileText(),
      httpError,
      listCursorModels: async () => [],
      platform: "linux",
      resolveCursorApiKey: async () => ({ available: false, source: null, warnings: [] }),
    });

    await expect(service.saveCursorApiKey("cursor-secret")).rejects.toMatchObject({
      code: "cursor_api_key_platform_unsupported",
      statusCode: 501,
    });
  });
});
