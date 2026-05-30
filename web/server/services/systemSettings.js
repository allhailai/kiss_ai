const settingsSuccessMessage = "Success! API key has been saved and works.";
const settingsFailureMessage = "Failed! Please try again. If this issue persists, contact AllHail.AI";

export function createSystemSettingsService({
  httpError,
  listCursorModels,
  resolveCursorApiKey,
  secretStore,
}) {
  async function systemSettings() {
    const cursorApiKey = await resolveCursorApiKey();

    return {
      cursorApiKeyAvailable: cursorApiKey.available,
      cursorApiKeySource: cursorApiKey.source,
      cursorApiKeyWarnings: cursorApiKey.warnings ?? [],
    };
  }

  async function saveCursorApiKey(apiKey) {
    if (!secretStore.supported) {
      throw httpError("Saving Cursor API keys is not supported on this platform. Use the CURSOR_API_KEY environment variable or web/.env instead.", 501, "cursor_api_key_platform_unsupported");
    }

    try {
      await secretStore.write("cursor_api_key", apiKey);
    } catch {
      throw httpError(settingsFailureMessage, 500, "cursor_api_key_save_failed");
    }

    try {
      await listCursorModels(apiKey);
    } catch {
      throw httpError(settingsFailureMessage, 400, "cursor_api_key_validation_failed");
    }

    return {
      ok: true,
      message: settingsSuccessMessage,
    };
  }

  return {
    saveCursorApiKey,
    systemSettings,
  };
}

