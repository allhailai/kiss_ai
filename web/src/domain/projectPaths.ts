import type { RequirementAutoUpdatePath } from "../contracts/api";

export const designIdentityFilePath = "human_design_identity.md";
export const openQuestionsFilePath = "human_open_questions.md";
export const humanAttentionQueuePath = "change_logs/human_attention_queue.md";

export const requirementAutoUpdatePaths: RequirementAutoUpdatePath[] = [
  "human_goal_requirements.md",
  "human_input_requirements.md",
  "human_output_requirements.md",
];

export const requirementAutoUpdateLabels: Record<RequirementAutoUpdatePath, string> = {
  "human_goal_requirements.md": "Goal Requirements",
  "human_input_requirements.md": "Input Requirements",
  "human_output_requirements.md": "Output Requirements",
};

export const requirementNavLabels: Record<RequirementAutoUpdatePath, string> = {
  "human_goal_requirements.md": "Define: Goal",
  "human_input_requirements.md": "Define: Source Info to Get",
  "human_output_requirements.md": "Define: Output Structure",
};

export const projectPathPrefixes = {
  humanInput: "inputs_human/",
  aiInput: "inputs_ai/",
  output: "outputs_ai/",
  changeLogs: "change_logs/",
} as const;

export const projectPathRoots = Object.values(projectPathPrefixes);

export function isDesignIdentityPath(path: string) {
  return path === designIdentityFilePath;
}

export function isRequirementAutoUpdatePath(path: string): path is RequirementAutoUpdatePath {
  return requirementAutoUpdatePaths.includes(path as RequirementAutoUpdatePath);
}

export function isHumanRequirementPath(path: string) {
  return /^human_[^/]+\.md$/i.test(path);
}

export function isChatSourceContextPath(path: string) {
  return (
    isHumanRequirementPath(path) ||
    path.startsWith(projectPathPrefixes.humanInput) ||
    path.startsWith(projectPathPrefixes.aiInput) ||
    path.startsWith(projectPathPrefixes.output)
  );
}
