import type { View } from "./views";
import { projectFilePath, questionsFilePath, designIdentityFilePath } from "../domain/projectPaths";

export type SimplifiedNavSectionId = "chat" | "define" | "build" | "source-data" | "results";

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
  { id: "chat", label: "Chat" },
  { id: "define", label: "1) Define the project" },
  { id: "build", label: "2) Build the project" },
  { id: "source-data", label: "3) Source data view" },
  { id: "results", label: "4) Outputs Built" },
];

export const requirementNavLeaves: SimplifiedNavLeaf[] = [
  { id: "project", label: "Define: Project Brief", view: "requirements", path: projectFilePath },
  { id: "design", label: "Define: Design Identity", view: "design", path: designIdentityFilePath },
];

export const openQuestionsNavLeaf: SimplifiedNavLeaf = {
  id: "open-questions",
  label: "Review: Questions",
  view: "requirements",
  path: questionsFilePath,
};

export const chatNavLeaf: SimplifiedNavLeaf = {
  id: "chat",
  label: "Chat",
  view: "chat",
};

export function sectionForView(view: View): SimplifiedNavSectionId {
  if (view === "chat") return "chat";
  if (view === "requirements" || view === "design") return "define";
  if (view === "inputs") return "source-data";
  if (view === "outputs") return "results";
  return "build";
}
