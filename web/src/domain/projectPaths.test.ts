import { describe, expect, it } from "vitest";
import { isChatSourceContextPath, isHumanRequirementPath } from "./projectPaths";

describe("project path predicates", () => {
  it("recognizes root human requirement files", () => {
    expect(isHumanRequirementPath("human_goal_requirements.md")).toBe(true);
    expect(isHumanRequirementPath("inputs_human/human_goal_requirements.md")).toBe(false);
  });

  it("recognizes chat source context paths", () => {
    expect(isChatSourceContextPath("human_input_requirements.md")).toBe(true);
    expect(isChatSourceContextPath("inputs_human/source.pdf")).toBe(true);
    expect(isChatSourceContextPath("inputs_ai/notes.md")).toBe(true);
    expect(isChatSourceContextPath("outputs_ai/report.md")).toBe(true);
    expect(isChatSourceContextPath("change_logs/change_logs.md")).toBe(false);
  });
});
