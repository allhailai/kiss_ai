import { describe, expect, it } from "vitest";
import { httpError } from "./httpErrors.js";
import { createSystemSettingsService } from "./systemSettings.js";

function createMockSecretStore({ supported = true, writeFail = false } = {}) {
  const calls = [];
  return {
    calls,
    read: async (serviceName) => {
      calls.push({ op: "read", serviceName });
      return null;
    },
    write: async (serviceName, value) => {
      calls.push({ op: "write", serviceName, value });
      if (writeFail) throw new Error("write failed");
    },
    sourceLabel: (serviceName) => `test-store item ${serviceName}`,
    supported,
  };
}

describe("systemSettings service", () => {
  it("reports when a Cursor API key is available without returning the key", async () => {
    const service = createSystemSettingsService({
      httpError,
      listCursorModels: async () => [],
      resolveCursorApiKey: async () => ({
        apiKey: "secret-key",
        available: true,
        source: "test-store item cursor_api_key",
        warnings: [],
      }),
      secretStore: createMockSecretStore(),
    });

    await expect(service.systemSettings()).resolves.toEqual({
      cursorApiKeyAvailable: true,
      cursorApiKeySource: "test-store item cursor_api_key",
      cursorApiKeyWarnings: [],
    });
  });

  it("reports when a Cursor API key is missing", async () => {
    const service = createSystemSettingsService({
      httpError,
      listCursorModels: async () => [],
      resolveCursorApiKey: async () => ({
        apiKey: null,
        available: false,
        source: null,
        warnings: [],
      }),
      secretStore: createMockSecretStore(),
    });

    await expect(service.systemSettings()).resolves.toMatchObject({
      cursorApiKeyAvailable: false,
      cursorApiKeySource: null,
    });
  });

  it("saves the Cursor API key via the secret store and validates it", async () => {
    const secretStore = createMockSecretStore();
    const service = createSystemSettingsService({
      httpError,
      listCursorModels: async () => [{ id: "model-a" }],
      resolveCursorApiKey: async () => ({ available: false, source: null, warnings: [] }),
      secretStore,
    });

    await expect(service.saveCursorApiKey("cursor-secret")).resolves.toEqual({
      ok: true,
      message: "Success! API key has been saved and works.",
    });
    expect(secretStore.calls).toEqual([
      { op: "write", serviceName: "cursor_api_key", value: "cursor-secret" },
    ]);
  });

  it("returns the standard failure when validation fails", async () => {
    const service = createSystemSettingsService({
      httpError,
      listCursorModels: async () => {
        throw new Error("invalid");
      },
      resolveCursorApiKey: async () => ({ available: false, source: null, warnings: [] }),
      secretStore: createMockSecretStore(),
    });

    await expect(service.saveCursorApiKey("bad-key")).rejects.toMatchObject({
      code: "cursor_api_key_validation_failed",
      message: "Failed! Please try again. If this issue persists, contact AllHail.AI",
    });
  });

  it("returns the standard failure when the secret store write fails", async () => {
    const service = createSystemSettingsService({
      httpError,
      listCursorModels: async () => [{ id: "model-a" }],
      resolveCursorApiKey: async () => ({ available: false, source: null, warnings: [] }),
      secretStore: createMockSecretStore({ writeFail: true }),
    });

    await expect(service.saveCursorApiKey("cursor-secret")).rejects.toMatchObject({
      code: "cursor_api_key_save_failed",
    });
  });

  it("rejects saving Cursor API keys on unsupported platforms", async () => {
    const service = createSystemSettingsService({
      httpError,
      listCursorModels: async () => [],
      resolveCursorApiKey: async () => ({ available: false, source: null, warnings: [] }),
      secretStore: createMockSecretStore({ supported: false }),
    });

    await expect(service.saveCursorApiKey("cursor-secret")).rejects.toMatchObject({
      code: "cursor_api_key_platform_unsupported",
      statusCode: 501,
    });
  });
});
