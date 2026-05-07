import type { ProjectFile } from "../api";

export type View = "build-log" | "dashboard" | "requirements" | "inputs" | "outputs" | "annotations" | "design" | "rebuild";

export type RouteState = {
  projectSlug: string | null;
  view: View;
  filePath: string | null;
};

export const views: Array<{ id: View; label: string; description: string }> = [
  { id: "build-log", label: "Build Log", description: "Latest rebuild summary and history" },
  { id: "requirements", label: "Requirements", description: "Human-owned source of truth" },
  { id: "annotations", label: "AI Input Files", description: "AI-managed files under inputs_ai/" },
  { id: "inputs", label: "Human Input Files", description: "Human source material" },
  { id: "outputs", label: "Outputs", description: "Generated research and reports" },
  { id: "design", label: "Design", description: "Project visual identity" },
  { id: "rebuild", label: "Rebuild", description: "Run the project loop" },
  { id: "dashboard", label: "Tech Dashboard", description: "Project state and readiness" },
];

export const workflowMenuViews = views.filter((item) => item.id !== "design");
export const viewIds = new Set<View>(views.map((item) => item.id));
export const fileBackedViews = new Set<View>(["requirements", "inputs", "outputs", "annotations", "design"]);
export const defaultRoute: RouteState = { projectSlug: null, view: "rebuild", filePath: null };
export const selectedProjectStorageKey = "kiss_ai.selectedProject";
export const designProjectFile: ProjectFile = {
  path: "human_design_identity.md",
  name: "human_design_identity.md",
  kind: "design",
  editable: true,
  annotation: false,
};
export const requirementsExplainer =
  "These files are the source of truth for the project. Saving here directly changes human-owned project intent.";

export function viewForProjectPath(path: string): View | null {
  if (path === "human_design_identity.md") return "design";
  if (path.startsWith("human_")) return "requirements";
  if (path.startsWith("inputs_human/")) return "inputs";
  if (path.startsWith("inputs_ai/")) return "annotations";
  if (path.startsWith("outputs_ai/")) return "outputs";
  return null;
}
