import type { ProjectFile } from "../contracts/api";
import { designIdentityFilePath, isDesignIdentityPath, projectPathPrefixes } from "../domain/projectPaths";

export type View = "chat" | "dashboard" | "requirements" | "inputs" | "outputs" | "design" | "rebuild";

export type RouteState = {
  projectSlug: string | null;
  view: View;
  filePath: string | null;
  context: Record<string, string>;
};

const views: View[] = ["chat", "requirements", "inputs", "outputs", "design", "rebuild", "dashboard"];

export const viewIds = new Set<View>(views);
export const fileBackedViews = new Set<View>(["requirements", "inputs", "outputs", "design"]);
export const defaultRoute: RouteState = { projectSlug: null, view: "rebuild", filePath: null, context: {} };
export const selectedProjectStorageKey = "kiss_ai.selectedProject";
export const designProjectFile: ProjectFile = {
  path: designIdentityFilePath,
  name: designIdentityFilePath,
  kind: "design",
  editable: true,
  annotation: false,
  chatContextReadable: false,
};

export function viewForProjectPath(path: string): View | null {
  if (isDesignIdentityPath(path)) return "design";
  if (path.startsWith("human_")) return "requirements";
  if (path.startsWith(projectPathPrefixes.humanInput)) return "inputs";
  if (path.startsWith(projectPathPrefixes.aiInput)) return "inputs";
  if (path.startsWith(projectPathPrefixes.output)) return "outputs";
  return null;
}
