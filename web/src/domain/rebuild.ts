import type { RebuildModel, RebuildState } from "../contracts/api";

const terminalRebuildStatuses = new Set<RebuildState["status"]>([
  "finished",
  "finished_with_attention",
  "error",
  "blocked",
  "interrupted",
]);

export function isTerminalRebuildStatus(status: RebuildState["status"]) {
  return terminalRebuildStatuses.has(status);
}

export function resolveEffectiveRebuildModelId(selectedModelId: string, models: RebuildModel[], fallbackModelId = "default") {
  return selectedModelId || models[0]?.id || fallbackModelId;
}
