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

export function rebuildStatusLabel(status: string | null | undefined) {
  switch (status) {
    case "running":
      return "Building";
    case "finished":
    case "finished_with_attention":
      return "Build complete";
    case "error":
      return "Build error";
    case "blocked":
      return "Build blocked";
    case "interrupted":
      return "Build interrupted";
    case "idle":
    case null:
    case undefined:
      return "Not started";
    default:
      return status;
  }
}
