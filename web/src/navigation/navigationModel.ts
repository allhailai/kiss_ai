import type { View } from "./views";
import { projectFilePath } from "../domain/projectPaths";

export type SimplifiedNavSectionId = "ai" | "define" | "source-data" | "wiki" | "reports" | "artifacts";

export type SimplifiedNavLeaf = {
  id: string;
  label: string;
  view: View;
  path?: string;
};

export type SimplifiedNavSection = {
  id: SimplifiedNavSectionId;
  label: string;
};

export const simplifiedNavSections: SimplifiedNavSection[] = [
  { id: "ai", label: "AI" },
  { id: "define", label: "1) Project Definition" },
  { id: "source-data", label: "2) Source data view" },
  { id: "wiki", label: "3) Wiki" },
  { id: "reports", label: "4) Reports" },
  { id: "artifacts", label: "5) Artifacts" },
];

/** The define section now directly opens project.md — no expandable children. */
export const defineNavTarget: { view: View; path: string } = {
  view: "requirements",
  path: projectFilePath,
};

export function sectionForView(view: View, filePath?: string | null): SimplifiedNavSectionId {
  if (view === "ai") return "ai";
  if (view === "requirements" || view === "design") return "define";
  if (view === "inputs") return "source-data";
  if (view === "outputs") {
    if (filePath?.startsWith("outputs_ai/reports/")) return "reports";
    return "wiki";
  }
  if (view === "reports") return "reports";
  if (view === "artifacts") return "artifacts";
  return "define";
}
