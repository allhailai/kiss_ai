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
  summary: string;
};

export const simplifiedNavSections: SimplifiedNavSection[] = [
  { id: "define", label: "(1) Define", summary: "Goals, sources, output shape, and questions" },
  { id: "build", label: "(2) Build", summary: "Run the project loop" },
  { id: "source-data", label: "(3) Source Data", summary: "Human and AI acquired material" },
  { id: "results", label: "(4) Results", summary: "Wiki and generated outputs" },
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
