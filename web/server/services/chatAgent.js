import { createChatAgentPipelines } from "./pipelines/chatPipelines.js";
import { extractConceptualDiffsFromText, extractApplyResultFromText } from "./conceptualDiffs.js";
export * from "./pipelines/chatParsers.js";

export function extractConceptualDiffs(rawText, authorizedEditablePaths) {
  return extractConceptualDiffsFromText(rawText, "edit_proposal_json", authorizedEditablePaths);
}

export function extractApplyResult(rawText, allowedFailedIds = null) {
  return extractApplyResultFromText(rawText, "apply_result_json", allowedFailedIds);
}

export function createChatAgentService(dependencies) {
  return createChatAgentPipelines(dependencies);
}
