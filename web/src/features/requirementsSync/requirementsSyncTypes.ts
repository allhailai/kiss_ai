import type { RequirementsSyncStep } from "../../contracts/api";

export const requirementsSyncSteps: Array<{
  id: RequirementsSyncStep;
  label: string;
  filePath: string;
  description: string;
}> = [
  {
    id: "goal",
    label: "Goal",
    filePath: "human_goal_requirements.md",
    description: "Consolidate the controlling project contract.",
  },
  {
    id: "inputs",
    label: "Inputs",
    filePath: "human_input_requirements.md",
    description: "Ensure source requirements support the goal.",
  },
  {
    id: "outputs",
    label: "Outputs",
    filePath: "human_output_requirements.md",
    description: "Ensure deliverables address the goal.",
  },
];

export function nextRequirementsSyncStep(step: RequirementsSyncStep): RequirementsSyncStep | null {
  const index = requirementsSyncSteps.findIndex((candidate) => candidate.id === step);
  return requirementsSyncSteps[index + 1]?.id ?? null;
}
