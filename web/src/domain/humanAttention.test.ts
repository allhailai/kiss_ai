import { describe, expect, it } from "vitest";
import { friendlyHumanAttentionItem, friendlyHumanAttentionItems } from "./humanAttention";
import type { HumanAttentionItem } from "../contracts/api";

function makeItem(overrides: Partial<HumanAttentionItem> = {}): HumanAttentionItem {
  return {
    id: "test-item",
    severity: "info",
    category: "review",
    summary: "Test summary",
    affected_files: [],
    resolution_options: [],
    ...overrides,
  } as HumanAttentionItem;
}

describe("friendlyHumanAttentionItem", () => {
  it("maps runtime category to 'Project setup' title with fixed summary", () => {
    const result = friendlyHumanAttentionItem(makeItem({ category: "runtime" }));
    expect(result.title).toBe("Project setup");
    expect(result.summary).toContain("project setup choice");
  });

  it("maps source_gap/evidence categories to 'Source confidence'", () => {
    for (const category of ["source_gap", "evidence", "evidence_grade"]) {
      const result = friendlyHumanAttentionItem(makeItem({ category }));
      expect(result.title).toBe("Source confidence");
    }
  });

  it("maps schema/routing categories to 'Output location'", () => {
    for (const category of ["schema", "routing"]) {
      const result = friendlyHumanAttentionItem(makeItem({ category }));
      expect(result.title).toBe("Output location");
    }
  });

  it("falls back to 'Review note' for unknown categories", () => {
    const result = friendlyHumanAttentionItem(makeItem({ category: "unknown_thing" }));
    expect(result.title).toBe("Review note");
  });

  it("uses resolution option label for action when available", () => {
    const result = friendlyHumanAttentionItem(makeItem({
      resolution_options: [
        { id: "opt1", label: "Fix it", recommended: true, prompt: "fix" },
      ],
    }));
    expect(result.action).toBe("Fix it");
  });

  it("includes affected files in technical details", () => {
    const result = friendlyHumanAttentionItem(makeItem({
      affected_files: ["file1.md", "file2.md"],
    }));
    expect(result.technicalDetails.some((d) => d.includes("file1.md"))).toBe(true);
  });
});

describe("friendlyHumanAttentionItems", () => {
  it("maps and filters items", () => {
    const items = [
      makeItem({ id: "1", category: "runtime" }),
      makeItem({ id: "2", category: "evidence" }),
    ];
    const result = friendlyHumanAttentionItems(items);
    expect(result).toHaveLength(2);
    expect(result[0].title).toBe("Project setup");
    expect(result[1].title).toBe("Source confidence");
  });

  it("returns empty array for empty input", () => {
    expect(friendlyHumanAttentionItems([])).toEqual([]);
  });
});
