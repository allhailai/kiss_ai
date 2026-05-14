const settingsSuccessMessage = "Success! API key has been saved and works.";
const settingsFailureMessage = "Failed! Please try again. If this issue persists, contact AllHail.AI";

export function createSystemSettingsService({
  execFileText,
  httpError,
  listCursorModels,
  platform = process.platform,
  resolveCursorApiKey,
  userName = process.env.USER ?? "",
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
    if (platform !== "darwin") {
      throw httpError("Saving Cursor API keys is only supported on macOS right now.", 501, "cursor_api_key_platform_unsupported");
    }

    try {
      await execFileText("security", ["add-generic-password", "-U", "-a", userName, "-s", "cursor_api_key", "-w", apiKey]);
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
