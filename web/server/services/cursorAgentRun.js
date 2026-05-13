export async function prepareCursorAgentRun({
  httpError,
  label,
  listCursorModels,
  noApiKeyMessage,
  noModelsMessage,
  pickRebuildModelId,
  project,
  projectAgentLock,
  requestedModelId,
  resolveCursorApiKey,
}) {
  const releaseProjectAgent = projectAgentLock.acquire(project, label);
  try {
    const cursorApiKey = await resolveCursorApiKey();
    if (!cursorApiKey.available) {
      throw httpError(noApiKeyMessage, 503, "cursor_api_key_unavailable");
    }

    const models = await listCursorModels(cursorApiKey.apiKey);
    if (!models.length) {
      throw httpError(noModelsMessage, 503, "cursor_models_unavailable");
    }

    const modelId = pickRebuildModelId(models, requestedModelId);
    return { cursorApiKey, modelId, releaseProjectAgent };
  } catch (error) {
    releaseProjectAgent();
    throw error;
  }
}
