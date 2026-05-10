import type { View } from "./views";
import { openQuestionsFilePath, requirementAutoUpdatePaths, requirementNavLabels } from "../domain/projectPaths";

export type SimplifiedNavSectionId = "build-log" | "chat" | "define" | "build" | "source-data" | "results";

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
  { id: "build-log", label: "Build Log" },
  { id: "chat", label: "Chat" },
  { id: "define", label: "1) Define the requirements" },
  { id: "build", label: "2) Build the project" },
  { id: "source-data", label: "3) Source data view" },
  { id: "results", label: "4) Outputs Built" },
];

export const requirementNavLeaves: SimplifiedNavLeaf[] = [
  ...requirementAutoUpdatePaths.map((path) => ({ id: path.replace(/^human_|_requirements\.md$/g, ""), label: requirementNavLabels[path], view: "requirements" as const, path })),
];

export const openQuestionsNavLeaf: SimplifiedNavLeaf = {
  id: "open-questions",
  label: "Answer: AI's Questions",
  view: "requirements",
  path: openQuestionsFilePath,
};

export const buildLogNavLeaf: SimplifiedNavLeaf = {
  id: "build-log",
  label: "Build Log",
  view: "build-log",
};

export const chatNavLeaf: SimplifiedNavLeaf = {
  id: "chat",
  label: "Chat",
  view: "chat",
};

export function sectionForView(view: View): SimplifiedNavSectionId {
  if (view === "build-log") return "build-log";
  if (view === "chat") return "chat";
  if (view === "requirements" || view === "design") return "define";
  if (view === "inputs" || view === "annotations") return "source-data";
  if (view === "outputs") return "results";
  return "build";
}
