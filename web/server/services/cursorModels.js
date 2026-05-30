import { Cursor } from "@cursor/sdk";
import fs from "node:fs/promises";
import path from "node:path";

export function createCursorModelService({ WEB_ROOT, httpError, secretStore, warnedCursorKeyMessages }) {
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

  function warnAboutCursorKeySources(warnings) {
    for (const warning of warnings) {
      if (warnedCursorKeyMessages.has(warning)) continue;

      warnedCursorKeyMessages.add(warning);
      console.warn(`[kiss_ai UI warning] ${warning}`);
    }
  }

  const secretStoreLabel = secretStore.sourceLabel("cursor_api_key");

  async function resolveCursorApiKey() {
    const processEnvKey = process.env.CURSOR_API_KEY?.trim() || null;
    const dotEnvKey = await readDotEnvCursorApiKey();
    const secretStoreKey = await secretStore.read("cursor_api_key");
    const warnings = [];

    if (processEnvKey && dotEnvKey) {
      warnings.push(
        "Cursor API key is present in both the CURSOR_API_KEY environment variable and web/.env. Using CURSOR_API_KEY.",
      );
    }

    const envKey = processEnvKey || dotEnvKey;
    const envSource = processEnvKey ? "CURSOR_API_KEY environment variable" : dotEnvKey ? "web/.env" : null;

    if (envKey && secretStoreKey) {
      warnings.push(
        `Cursor API key is present in both ${envSource} and ${secretStoreLabel}. Using ${envSource}.`,
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

    if (secretStoreKey) {
      return {
        apiKey: secretStoreKey,
        available: true,
        source: secretStoreLabel,
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

  // Cache for Cursor model list — avoids hitting the Cursor API rate limit (30 req/min)
  let modelsCache = { key: "", models: [], expiresAt: 0 };
  const MODELS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  async function listCursorModels(apiKey) {
    const now = Date.now();
    if (modelsCache.key === apiKey && now < modelsCache.expiresAt) {
      return modelsCache.models;
    }

    const models = await Cursor.models.list({ apiKey });
    const filtered = models
      .filter((model) => !isMaxModeModel(model))
      .filter((model) => !isAutoModel(model))
      .map((model) => ({
        id: model.id,
        displayName: model.displayName,
        description: model.description ?? "",
        provider: getRebuildModelProvider(model),
        tier: getRebuildModelTier(model),
      }));

    modelsCache = { key: apiKey, models: filtered, expiresAt: now + MODELS_CACHE_TTL_MS };
    return filtered;
  }

  /**
   * Find the latest Composer model by scanning available models for IDs matching
   * "composer-<version>" and selecting the one with the highest version number.
   * Returns the model ID string, or null if no Composer models are available.
   */
  function findLatestComposerModelId(models) {
    const composerModels = models
      .filter((model) => /^composer-/i.test(model.id))
      .map((model) => {
        const versionMatch = model.id.match(/^composer-(.+)$/i);
        return { id: model.id, version: versionMatch ? parseFloat(versionMatch[1]) : 0 };
      })
      .filter((entry) => !Number.isNaN(entry.version))
      .sort((a, b) => b.version - a.version);

    return composerModels[0]?.id ?? null;
  }

  function pickRebuildModelId(models, requestedModelId) {
    const availableModelIds = new Set(models.map((model) => model.id));
    const trimmedRequestedModelId = requestedModelId?.trim() || "";

    if (trimmedRequestedModelId) {
      if (availableModelIds.has(trimmedRequestedModelId)) return trimmedRequestedModelId;
      throw httpError(`Cannot use this model: ${trimmedRequestedModelId}. Available models: ${models.map((model) => model.id).join(", ")}.`);
    }

    const latestComposer = findLatestComposerModelId(models);
    const mediumOpenAiModel = models.find((model) => model.tier === "medium" && /^gpt-/.test(model.id));
    const mediumModel = models.find((model) => model.tier === "medium");
    const preferredModelIds = [process.env.CURSOR_MODEL?.trim(), latestComposer, mediumOpenAiModel?.id, mediumModel?.id].filter(Boolean);
    return preferredModelIds.find((modelId) => availableModelIds.has(modelId)) ?? models[0]?.id ?? "composer-2";
  }

  return { listCursorModels, pickRebuildModelId, resolveCursorApiKey };
}
