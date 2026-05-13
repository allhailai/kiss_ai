import { describe, expect, it } from "vitest";
import { extractConceptualDiffsFromText, normalizeConceptualDiff } from "./conceptualDiffs.js";

describe("conceptual diff normalization", () => {
  it("preserves stored conversation diffs without an editable-path allowlist", () => {
    expect(
      normalizeConceptualDiff({
        id: "diff_existing",
        filePath: "archived/path.md",
        title: "Stored change",
        summary: "Keep this persisted proposal available.",
        status: "rejected",
      }),
    ).toMatchObject({
      id: "diff_existing",
      filePath: "archived/path.md",
      status: "rejected",
    });
  });

  it("filters model-output diffs through the editable-path allowlist", () => {
    const rawText = JSON.stringify({
      conceptualDiffs: [
        { path: "allowed.md", title: "Allowed", description: "Allowed summary" },
        { path: "blocked.md", title: "Blocked", description: "Blocked summary" },
      ],
    });

    expect(extractConceptualDiffsFromText(rawText, "edit_proposal_json", new Set(["allowed.md"]))).toEqual([
      expect.objectContaining({
        filePath: "allowed.md",
        summary: "Allowed summary",
      }),
    ]);
  });
});
