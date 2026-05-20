import type { ProjectFile } from "../contracts/api";
import { designIdentityFilePath, isDesignIdentityPath, projectPathPrefixes } from "../domain/projectPaths";

export type View = "chat" | "dashboard" | "requirements" | "inputs" | "outputs" | "design" | "questions" | "suggestions" | "topics";

export type RouteState = {
  projectSlug: string | null;
  view: View;
  filePath: string | null;
  context: Record<string, string>;
};

const views: View[] = ["chat", "requirements", "inputs", "outputs", "design", "dashboard", "questions", "suggestions", "topics"];

export const viewIds = new Set<View>(views);
export const fileBackedViews = new Set<View>(["requirements", "inputs", "outputs", "design"]);
export const defaultRoute: RouteState = { projectSlug: null, view: "dashboard", filePath: null, context: {} };
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
  if (path === "project.md") return "requirements";
  if (path === "questions.md") return "questions";
  if (path.startsWith("human_")) return "requirements";
  if (path.startsWith(projectPathPrefixes.humanInput)) return "inputs";
  if (path.startsWith(projectPathPrefixes.sources)) return "inputs";
  if (path.startsWith(projectPathPrefixes.output)) return "outputs";
  return null;
}
