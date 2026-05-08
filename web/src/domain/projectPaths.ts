export const designIdentityFilePath = "human_design_identity.md";

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
