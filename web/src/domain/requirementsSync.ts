import type { RequirementsSyncStep } from "../contracts/api";
import type { RequirementAutoUpdatePath } from "./projectPaths";
import { requirementAutoUpdatePaths } from "./projectPaths";

export type RequirementsSyncStepStatus = "idle" | "generating" | "ready" | "error" | "applying" | "applied" | "skipped" | "failed";

export const requirementsSyncSteps: Array<{
  id: RequirementsSyncStep;
  label: string;
  filePath: RequirementAutoUpdatePath;
  description: string;
}> = [
  {
    id: "goal",
    label: "Goal",
    filePath: requirementAutoUpdatePaths[0],
    description: "Consolidate the controlling project contract.",
  },
  {
    id: "inputs",
    label: "Inputs",
    filePath: requirementAutoUpdatePaths[1],
    description: "Ensure source requirements support the goal.",
  },
  {
    id: "outputs",
    label: "Outputs",
    filePath: requirementAutoUpdatePaths[2],
    description: "Ensure deliverables address the goal.",
  },
];

export function requirementsSyncStepLabel(step: RequirementsSyncStep) {
  return requirementsSyncSteps.find((candidate) => candidate.id === step)?.label ?? step;
}
