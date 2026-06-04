import { isDesignIdentityPath, projectPathPrefixes } from "../domain/projectPaths";

export type View = "ai" | "requirements" | "inputs" | "outputs" | "reports" | "artifacts" | "design" | "settings";

/** Legacy view IDs that are still recognized in URLs but redirect to the "ai" view. */
export type LegacyAiView = "chat" | "review" | "questions" | "topics" | "suggestions";
export const legacyAiViews = new Set<string>(["chat", "review", "questions", "topics", "suggestions"]);

/** Tab IDs for the unified AI workspace. */
export type AiTab = "conversations" | "topics" | "questions";

export type RouteState = {
  projectSlug: string | null;
  view: View;
  filePath: string | null;
  context: Record<string, string>;
};

const views: View[] = ["ai", "requirements", "inputs", "outputs", "reports", "artifacts", "design", "settings"];

export const viewIds = new Set<View>(views);
export const fileBackedViews = new Set<View>(["requirements", "inputs", "outputs", "reports", "artifacts", "design"]);
export const defaultRoute: RouteState = { projectSlug: null, view: "ai", filePath: null, context: {} };

export function viewForProjectPath(path: string): View | null {
  if (isDesignIdentityPath(path)) return "design";
  if (path === "project.md") return "requirements";
  if (path === "questions.md") return "ai";
  if (path.startsWith("human_")) return "requirements";
  if (path.startsWith(projectPathPrefixes.humanInput)) return "inputs";
  if (path.startsWith(projectPathPrefixes.sources)) return "inputs";
  if (path.startsWith(projectPathPrefixes.output)) return "outputs";
  if (path.startsWith("artifacts/")) return "artifacts";
  return null;
}
