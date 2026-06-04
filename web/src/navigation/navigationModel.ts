import type { View } from "./views";
import { projectFilePath } from "../domain/projectPaths";

export type SimplifiedNavSectionId = "ai" | "knowledgebase" | "outputs";

export type SimplifiedNavSection = {
  id: SimplifiedNavSectionId;
  label: string;
};

export const simplifiedNavSections: SimplifiedNavSection[] = [
  { id: "ai", label: "Home" },
  { id: "knowledgebase", label: "Research" },
  { id: "outputs", label: "Documents" },
];

/** The define section now directly opens project.md — no expandable children. */
export const defineNavTarget: { view: View; path: string } = {
  view: "requirements",
  path: projectFilePath,
};

export function sectionForView(view: View, filePath?: string | null): SimplifiedNavSectionId {
  if (view === "ai") return "ai";
  if (view === "settings") return "ai";
  if (view === "requirements" || view === "design") return "knowledgebase";
  if (view === "inputs") return "knowledgebase";
  if (view === "outputs") return filePath?.startsWith("outputs_ai/reports/") ? "outputs" : "knowledgebase";
  if (view === "reports") return "outputs";
  if (view === "artifacts") return "outputs";
  return "knowledgebase";
}
