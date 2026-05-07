import type { View } from "./views";

export type SimplifiedNavSectionId = "define" | "build" | "source-data" | "results";

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
  { id: "define", label: "(1) Define the requirements" },
  { id: "build", label: "(2) Build the project" },
  { id: "source-data", label: "(3) Source data view" },
  { id: "results", label: "(4) Information built" },
];

export const requirementNavLeaves: SimplifiedNavLeaf[] = [
  { id: "goal", label: "Define: Goal", view: "requirements", path: "human_goal_requirements.md" },
  { id: "input-sources", label: "Define: Source Info to Get", view: "requirements", path: "human_input_requirements.md" },
  { id: "output-structure", label: "Define: Output Structure", view: "requirements", path: "human_output_requirements.md" },
];

export const openQuestionsNavLeaf: SimplifiedNavLeaf = {
  id: "open-questions",
  label: "Answer: AI's Questions",
  view: "requirements",
  path: "human_open_questions.md",
};

export const buildNavLeaf: SimplifiedNavLeaf = {
  id: "build",
  label: "Build",
  view: "rebuild",
};

export function sectionForView(view: View): SimplifiedNavSectionId {
  if (view === "requirements" || view === "design") return "define";
  if (view === "inputs" || view === "annotations") return "source-data";
  if (view === "outputs") return "results";
  return "build";
}
