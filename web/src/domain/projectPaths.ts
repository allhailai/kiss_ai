export const designIdentityFilePath = "human_design_identity.md";
export const projectFilePath = "project.md";
export const questionsFilePath = "questions.md";

// v1 backwards compatibility — kept for project discovery of unmigrated projects
export const legacyGoalRequirementsPath = "human_goal_requirements.md";
export const legacyOpenQuestionsPath = "human_open_questions.md";

export const projectPathPrefixes = {
  humanInput: "inputs_human/",
  sources: "sources/",
  output: "outputs_ai/",
  changeLogs: "change_logs/",
  build: ".build/",
} as const;

export const projectPathRoots = Object.values(projectPathPrefixes);

export function isDesignIdentityPath(path: string) {
  return path === designIdentityFilePath;
}

export function isProjectFilePath(path: string) {
  return path === projectFilePath;
}

export function isUserOwnedPath(path: string) {
  return (
    path === projectFilePath ||
    path === designIdentityFilePath ||
    path.startsWith(projectPathPrefixes.humanInput)
  );
}

export function isAiManagedPath(path: string) {
  return (
    path === questionsFilePath ||
    path.startsWith(projectPathPrefixes.sources) ||
    path.startsWith(projectPathPrefixes.output) ||
    path.startsWith(projectPathPrefixes.build) ||
    path.startsWith(projectPathPrefixes.changeLogs)
  );
}

export function isChatSourceContextPath(path: string) {
  return (
    isUserOwnedPath(path) ||
    path === questionsFilePath ||
    path.startsWith(projectPathPrefixes.sources) ||
    path.startsWith(projectPathPrefixes.output)
  );
}
