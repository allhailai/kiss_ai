import { isDesignIdentityPath, projectPathPrefixes } from "../domain/projectPaths";

export type View = "chat" | "dashboard" | "requirements" | "inputs" | "outputs" | "design" | "review" | "questions" | "topics";

/** Legacy review sub-views that now redirect to the unified "review" view with a tab param.
 *  "suggestions" is kept here only for bookmark redirect compatibility — the feature directory was removed. */
export type LegacyReviewView = "questions" | "suggestions" | "topics";
export const legacyReviewViews = new Set<LegacyReviewView>(["questions", "suggestions", "topics"]);

export type ReviewTab = "questions" | "topics" | "attention";

export type RouteState = {
  projectSlug: string | null;
  view: View;
  filePath: string | null;
  context: Record<string, string>;
};

const views: View[] = ["chat", "requirements", "inputs", "outputs", "design", "dashboard", "review", "questions", "topics"];

export const viewIds = new Set<View>(views);
export const fileBackedViews = new Set<View>(["requirements", "inputs", "outputs", "design"]);
export const defaultRoute: RouteState = { projectSlug: null, view: "dashboard", filePath: null, context: {} };

export function viewForProjectPath(path: string): View | null {
  if (isDesignIdentityPath(path)) return "design";
  if (path === "project.md") return "requirements";
  if (path === "questions.md") return "review";
  if (path.startsWith("human_")) return "requirements";
  if (path.startsWith(projectPathPrefixes.humanInput)) return "inputs";
  if (path.startsWith(projectPathPrefixes.sources)) return "inputs";
  if (path.startsWith(projectPathPrefixes.output)) return "outputs";
  return null;
}
