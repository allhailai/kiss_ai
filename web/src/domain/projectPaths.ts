export const designIdentityFilePath = "human_design_identity.md";
export const projectFilePath = "project.md";
export const questionsFilePath = "questions.md";

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

export function isAiManagedPath(path: string) {
  return (
    path === questionsFilePath ||
    path.startsWith(projectPathPrefixes.sources) ||
    path.startsWith(projectPathPrefixes.output) ||
    path.startsWith(projectPathPrefixes.build) ||
    path.startsWith(projectPathPrefixes.changeLogs)
  );
}
