import { describe, expect, it } from "vitest";
import {
  annotateConceptualDiffsWithMemory,
  buildRejectionMemoryPromptContext,
  conceptualDiffFingerprint,
  emptyConceptualDiffMemory,
  filterSuppressedConceptualDiffs,
  updateConceptualDiffRejectionMemory,
} from "./conceptualDiffMemory.js";

const rejectedDiff = {
  id: "diff_rejected",
  filePath: "human_goal_requirements.md",
  title: "Expand audience",
  summary: "Expand the audience to clinicians.",
  status: "rejected",
  target: { scope: "section", sections: ["Audience"] },
  intent: { objective: "Include clinicians in the audience.", avoid: ["Expanding beyond clinical users"] },
  evidence: { userGuidance: ["Add clinician audience."] },
  applyNotes: { nonGoals: ["Do not add payer audience."], riskLevel: "medium" },
};

describe("conceptual diff rejection memory", () => {
  it("produces stable fingerprints for equivalent conceptual diffs", () => {
    expect(conceptualDiffFingerprint(rejectedDiff)).toBe(
      conceptualDiffFingerprint({
        ...rejectedDiff,
        title: "Different display title",
        target: { scope: "section", sections: [" Audience "] },
      }),
    );
  });

  it("persists rejected conceptual diffs as active project memory", async () => {
    const memory = updateConceptualDiffRejectionMemory(emptyConceptualDiffMemory(), {
      conceptualDiffs: [rejectedDiff],
      flow: "ai_file_assist",
      sourceContentHash: "hash-before",
    });

    expect(memory.records).toEqual([
      expect.objectContaining({
        filePath: "human_goal_requirements.md",
        flow: "ai_file_assist",
        status: "active",
        rejectionCount: 1,
        sourceContentHash: "hash-before",
      }),
    ]);
  });

  it("filters exact repeats while allowing explicit reconsideration", async () => {
    const memory = updateConceptualDiffRejectionMemory(emptyConceptualDiffMemory(), {
      conceptualDiffs: [rejectedDiff],
      flow: "requirements_sync",
      step: "goal",
    });
    const records = memory.records;
    const annotated = annotateConceptualDiffsWithMemory([{ ...rejectedDiff, status: "accepted" }], records);

    expect(filterSuppressedConceptualDiffs(annotated, records)).toEqual([]);
    expect(filterSuppressedConceptualDiffs(annotated, records, { userInstruction: "Please reconsider the clinician audience." })).toHaveLength(1);
  });

  it("builds prompt-ready rejection memory context", async () => {
    const memory = updateConceptualDiffRejectionMemory(emptyConceptualDiffMemory(), {
      conceptualDiffs: [rejectedDiff],
      flow: "requirements_sync",
      step: "goal",
    });

    const context = buildRejectionMemoryPromptContext(memory, {
      filePaths: new Set(["human_goal_requirements.md"]),
      flow: "requirements_sync",
      step: "goal",
    });

    expect(context.records).toEqual([
      expect.objectContaining({
        title: "Expand audience",
        filePath: "human_goal_requirements.md",
      }),
    ]);
    expect(context.rules.join(" ")).toContain("soft suppressions");
  });
});
