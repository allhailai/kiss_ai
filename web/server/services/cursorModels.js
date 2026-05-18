import { Cursor } from "@cursor/sdk";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

export function createCursorModelService({ WEB_ROOT, httpError, warnedCursorKeyMessages }) {
  function execFileText(command, args, options = {}) {
    return new Promise((resolve, reject) => {
      execFile(command, args, options, (error, stdout, stderr) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(String(stdout || stderr).trim());
      });
    });
  }

  function parseEnvValue(rawValue) {
    const value = rawValue.trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      return value.slice(1, -1);
    }

    return value;
  }

  async function readDotEnvCursorApiKey() {
    try {
      const envText = await fs.readFile(path.join(WEB_ROOT, ".env"), "utf8");
      const line = envText
        .split("\n")
        .map((candidate) => candidate.trim())
        .find((candidate) => candidate && !candidate.startsWith("#") && candidate.startsWith("CURSOR_API_KEY="));

      if (!line) return null;

      return parseEnvValue(line.slice("CURSOR_API_KEY=".length));
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw error;
    }
  }

  async function readKeychainCursorApiKey() {
    if (process.platform !== "darwin") return null;

    try {
      const value = await execFileText("security", [
        "find-generic-password",
        "-a",
        process.env.USER ?? "",
        "-s",
        "cursor_api_key",
        "-w",
      ]);
      return value || null;
    } catch {
      return null;
    }
  }

  function warnAboutCursorKeySources(warnings) {
    for (const warning of warnings) {
      if (warnedCursorKeyMessages.has(warning)) continue;

      warnedCursorKeyMessages.add(warning);
      console.warn(`[kiss_ai UI warning] ${warning}`);
    }
  }

  async function resolveCursorApiKey() {
    const processEnvKey = process.env.CURSOR_API_KEY?.trim() || null;
    const dotEnvKey = await readDotEnvCursorApiKey();
    const keychainKey = await readKeychainCursorApiKey();
    const warnings = [];

    if (processEnvKey && dotEnvKey) {
      warnings.push(
        "Cursor API key is present in both the CURSOR_API_KEY environment variable and web/.env. Using CURSOR_API_KEY.",
      );
    }

    const envKey = processEnvKey || dotEnvKey;
    const envSource = processEnvKey ? "CURSOR_API_KEY environment variable" : dotEnvKey ? "web/.env" : null;

    if (envKey && keychainKey) {
      warnings.push(
        `Cursor API key is present in both ${envSource} and macOS Keychain item cursor_api_key. Using ${envSource}.`,
      );
    }

    warnAboutCursorKeySources(warnings);

    if (envKey) {
      return {
        apiKey: envKey,
        available: true,
        source: envSource,
        warnings,
      };
    }

    if (keychainKey) {
      return {
        apiKey: keychainKey,
        available: true,
        source: "macOS Keychain item cursor_api_key",
        warnings,
      };
    }

    return {
      apiKey: null,
      available: false,
      source: null,
      warnings,
    };
  }

  function isMaxModeModel(model) {
    const display = String(model.displayName ?? "").toLowerCase();
    const id = String(model.id ?? "").toLowerCase();
    if (/\bmax\s*mode\b/.test(display)) return true;
    if (/\(max\)/.test(display)) return true;
    if (/-max$/.test(id) || /-max-/.test(id)) return true;
    return false;
  }

  function isAutoModel(model) {
    return String(model.id ?? "").toLowerCase() === "default";
  }

  function getRebuildModelTier(model) {
    const text = `${model.id ?? ""} ${model.displayName ?? ""}`.toLowerCase();

    if (/\b(composer|haiku|flash|mini|nano|spark|fast)\b/.test(text)) return "small";
    if (/\b(opus|pro|grok|extra high|high)\b/.test(text)) return "high";
    return "medium";
  }

  function getRebuildModelProvider(model) {
    const text = `${model.id ?? ""} ${model.displayName ?? ""}`.toLowerCase();

    if (/\b(composer)\b/.test(text)) return "Cursor";
    if (/\b(gpt|codex)\b/.test(text)) return "OpenAI";
    if (/\b(claude|sonnet|opus|haiku)\b/.test(text)) return "Anthropic";
    if (/\b(gemini)\b/.test(text)) return "Google";
    if (/\b(grok)\b/.test(text)) return "xAI";
    return "";
  }

  async function listCursorModels(apiKey) {
    const models = await Cursor.models.list({ apiKey });
    return models
      .filter((model) => !isMaxModeModel(model))
      .filter((model) => !isAutoModel(model))
      .map((model) => ({
        id: model.id,
        displayName: model.displayName,
        description: model.description ?? "",
        provider: getRebuildModelProvider(model),
        tier: getRebuildModelTier(model),
      }));
  }

  function pickRebuildModelId(models, requestedModelId) {
    const availableModelIds = new Set(models.map((model) => model.id));
    const trimmedRequestedModelId = requestedModelId?.trim() || "";

    if (trimmedRequestedModelId) {
      if (availableModelIds.has(trimmedRequestedModelId)) return trimmedRequestedModelId;
      throw httpError(`Cannot use this model: ${trimmedRequestedModelId}. Available models: ${models.map((model) => model.id).join(", ")}.`);
    }

    const mediumOpenAiModel = models.find((model) => model.tier === "medium" && /^gpt-/.test(model.id));
    const mediumModel = models.find((model) => model.tier === "medium");
    const preferredModelIds = [process.env.CURSOR_MODEL?.trim(), "composer-2", mediumOpenAiModel?.id, mediumModel?.id].filter(Boolean);
    return preferredModelIds.find((modelId) => availableModelIds.has(modelId)) ?? models[0]?.id ?? "composer-2";
  }

  return { listCursorModels, pickRebuildModelId, resolveCursorApiKey };
}
