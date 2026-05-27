import type { View } from "./views";
import { projectFilePath, designIdentityFilePath } from "../domain/projectPaths";

export type SimplifiedNavSectionId = "chat" | "define" | "source-data" | "wiki" | "reports" | "artifacts";

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
  { id: "wiki", label: "3) Wiki" },
  { id: "reports", label: "4) Reports" },
  { id: "artifacts", label: "5) Artifacts" },
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
  if (view === "requirements" || view === "design" || view === "review" || view === "questions" || view === "topics" || view === "dashboard") return "define";
  if (view === "inputs") return "source-data";
  if (view === "outputs") return "wiki";
  if (view === "reports") return "reports";
  if (view === "artifacts") return "artifacts";
  return "define";
}
