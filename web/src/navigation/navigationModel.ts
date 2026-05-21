import type { View } from "./views";
import { projectFilePath, designIdentityFilePath } from "../domain/projectPaths";

export type SimplifiedNavSectionId = "chat" | "define" | "source-data" | "results";

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
  { id: "source-data", label: "2) Source data view" },
  { id: "results", label: "3) Outputs Built" },
];

export const requirementNavLeaves: SimplifiedNavLeaf[] = [
  { id: "project", label: "Define: Project Brief", view: "requirements", path: projectFilePath },
];

export const reviewNavLeaf: SimplifiedNavLeaf = {
  id: "ai-review",
  label: "AI Review",
  view: "review",
};

export const chatNavLeaf: SimplifiedNavLeaf = {
  id: "chat",
  label: "Chat",
  view: "chat",
};

export function sectionForView(view: View): SimplifiedNavSectionId {
  if (view === "chat") return "chat";
  if (view === "requirements" || view === "design" || view === "review" || view === "questions" || view === "suggestions" || view === "topics" || view === "dashboard") return "define";
  if (view === "inputs") return "source-data";
  if (view === "outputs") return "results";
  return "define";
}

