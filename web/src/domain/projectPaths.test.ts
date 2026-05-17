import { describe, expect, it } from "vitest";
import { isChatSourceContextPath, isUserOwnedPath, isAiManagedPath } from "./projectPaths";

describe("project path predicates", () => {
  it("recognizes v2 user-owned files", () => {
    expect(isUserOwnedPath("project.md")).toBe(true);
    expect(isUserOwnedPath("human_design_identity.md")).toBe(true);
    expect(isUserOwnedPath("inputs_human/source.pdf")).toBe(true);
    expect(isUserOwnedPath("questions.md")).toBe(false); // AI-managed
    expect(isUserOwnedPath("sources/notes.md")).toBe(false);
    expect(isUserOwnedPath("outputs_ai/report.md")).toBe(false);
  });

  it("recognizes v2 AI-managed files", () => {
    expect(isAiManagedPath("sources/notes.md")).toBe(true);
    expect(isAiManagedPath("outputs_ai/report.md")).toBe(true);
    expect(isAiManagedPath("project.md")).toBe(false);
    expect(isAiManagedPath("inputs_human/source.pdf")).toBe(false);
  });

  it("recognizes chat source context paths", () => {
    expect(isChatSourceContextPath("project.md")).toBe(true);
    expect(isChatSourceContextPath("questions.md")).toBe(true);
    expect(isChatSourceContextPath("inputs_human/source.pdf")).toBe(true);
    expect(isChatSourceContextPath("sources/notes.md")).toBe(true);
    expect(isChatSourceContextPath("outputs_ai/report.md")).toBe(true);
    expect(isChatSourceContextPath("change_logs/change_logs.md")).toBe(false);
  });
});
