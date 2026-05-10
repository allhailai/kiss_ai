import type { ProjectFile } from "../contracts/api";
import { designIdentityFilePath, isDesignIdentityPath, projectPathPrefixes } from "../domain/projectPaths";

export type View = "build-log" | "chat" | "dashboard" | "requirements" | "inputs" | "outputs" | "annotations" | "design" | "rebuild";

export type RouteState = {
  projectSlug: string | null;
  view: View;
  filePath: string | null;
  context: Record<string, string>;
};

const views: Array<{ id: View; label: string; description: string }> = [
  { id: "build-log", label: "Build Log", description: "Latest rebuild summary and history" },
  { id: "chat", label: "Chat", description: "Project-local agent conversations" },
  { id: "requirements", label: "Requirements", description: "Human-owned source of truth" },
  { id: "annotations", label: "AI Input Files", description: `AI-managed files under ${projectPathPrefixes.aiInput}` },
  { id: "inputs", label: "Human Input Files", description: "Human source material" },
  { id: "outputs", label: "Outputs", description: "Generated research and reports" },
  { id: "design", label: "Design", description: "Project visual identity" },
  { id: "rebuild", label: "Rebuild", description: "Run the project loop" },
  { id: "dashboard", label: "Tech Dashboard", description: "Project state and readiness" },
];

export const viewIds = new Set<View>(views.map((item) => item.id));
export const fileBackedViews = new Set<View>(["requirements", "inputs", "outputs", "annotations", "design"]);
export const defaultRoute: RouteState = { projectSlug: null, view: "rebuild", filePath: null, context: {} };
export const selectedProjectStorageKey = "kiss_ai.selectedProject";
export const designProjectFile: ProjectFile = {
  path: designIdentityFilePath,
  name: designIdentityFilePath,
  kind: "design",
  editable: true,
  annotation: false,
};

export function viewForProjectPath(path: string): View | null {
  if (isDesignIdentityPath(path)) return "design";
  if (path.startsWith("human_")) return "requirements";
  if (path.startsWith(projectPathPrefixes.humanInput)) return "inputs";
  if (path.startsWith(projectPathPrefixes.aiInput)) return "annotations";
  if (path.startsWith(projectPathPrefixes.output)) return "outputs";
  return null;
}
