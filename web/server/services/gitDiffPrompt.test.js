import { describe, expect, it } from "vitest";
import { buildGitDiffPromptEntries } from "./gitDiffPrompt.js";

describe("git diff prompt entries", () => {
  it("uses bulk diff results when they are available", async () => {
    const entries = await buildGitDiffPromptEntries({
      projectRoot: "/project",
      files: [
        { path: "a.md", kind: "human" },
        { path: "b.md", kind: "human" },
      ],
      gitFileDiffText: async () => {
        throw new Error("per-file fallback should not run");
      },
      gitFileDiffTexts: async () => [
        { path: "a.md", diff: "diff a", diffError: "" },
        { path: "b.md", diff: "diff b", diffError: "warning" },
      ],
      trimForPrompt: (value) => value.slice(0, 6),
    });

    expect(entries).toEqual([
      { path: "a.md", kind: "human", diff: "diff a" },
      { path: "b.md", kind: "human", diff: "diff b", diffError: "warning" },
    ]);
  });

  it("falls back to per-file diff results for harnesses without bulk support", async () => {
    const entries = await buildGitDiffPromptEntries({
      projectRoot: "/project",
      files: [{ path: "a.md" }],
      gitFileDiffText: async (_projectRoot, path) => ({ diff: `diff ${path}`, diffError: "" }),
      trimForPrompt: (value) => value,
    });

    expect(entries).toEqual([{ path: "a.md", diff: "diff a.md" }]);
  });
});
