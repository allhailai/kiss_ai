import fs from "node:fs/promises";
import path from "node:path";

const settingsSuccessMessage = "Success! API key has been saved and works.";
const settingsFailureMessage = "Failed! Please try again. If this issue persists, contact AllHail.AI";

export function createSystemSettingsService({
  httpError,
  listCursorModels,
  resolveCursorApiKey,
  secretStore,
  WEB_ROOT,
}) {
  async function systemSettings() {
    const cursorApiKey = await resolveCursorApiKey();

    return {
      cursorApiKeyAvailable: cursorApiKey.available,
      cursorApiKeySource: cursorApiKey.source,
      cursorApiKeyWarnings: cursorApiKey.warnings ?? [],
      githubPatAvailable: Boolean(process.env.KISS_AI_GITHUB_PAT),
    };
  }

  /**
   * Write the Cursor API key to `web/.env` as a fallback when the OS
   * credential store is unavailable (headless Linux, Docker, etc.).
   * Preserves existing env vars and updates CURSOR_API_KEY in place.
   */
  async function writeDotEnvCursorApiKey(apiKey) {
    const envPath = path.join(WEB_ROOT, ".env");
    const entry = `CURSOR_API_KEY="${apiKey}"`;
    let content = "";

    try {
      content = await fs.readFile(envPath, "utf8");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }

    if (content) {
      const lines = content.split("\n");
      const index = lines.findIndex(
        (line) => line.trim().startsWith("CURSOR_API_KEY=") && !line.trim().startsWith("#"),
      );

      if (index !== -1) {
        lines[index] = entry;
        content = lines.join("\n");
      } else {
        content = content.trimEnd() + "\n" + entry + "\n";
      }
    } else {
      content = entry + "\n";
    }

    await fs.writeFile(envPath, content, "utf8");
  }

  async function saveCursorApiKey(apiKey) {
    try {
      if (secretStore.supported) {
        await secretStore.write("cursor_api_key", apiKey);
      } else {
        await writeDotEnvCursorApiKey(apiKey);
      }
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

  async function writeDotEnvGithubPat(pat) {
    const envPath = path.join(WEB_ROOT, ".env");
    const entry = `KISS_AI_GITHUB_PAT="${pat}"`;
    let content = "";

    try {
      content = await fs.readFile(envPath, "utf8");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }

    if (content) {
      const lines = content.split("\n");
      const index = lines.findIndex(
        (line) => line.trim().startsWith("KISS_AI_GITHUB_PAT=") && !line.trim().startsWith("#"),
      );

      if (index !== -1) {
        lines[index] = entry;
        content = lines.join("\n");
      } else {
        content = content.trimEnd() + "\n" + entry + "\n";
      }
    } else {
      content = entry + "\n";
    }

    await fs.writeFile(envPath, content, "utf8");
    process.env.KISS_AI_GITHUB_PAT = pat;
  }

  async function saveGithubPat(pat) {
    try {
      if (secretStore.supported) {
        await secretStore.write("github_pat", pat);
      } else {
        await writeDotEnvGithubPat(pat);
      }
      process.env.KISS_AI_GITHUB_PAT = pat;
    } catch {
      throw httpError(settingsFailureMessage, 500, "github_pat_save_failed");
    }

    return {
      ok: true,
      message: settingsSuccessMessage,
    };
  }

  return {
    saveCursorApiKey,
    saveGithubPat,
    systemSettings,
  };
}


