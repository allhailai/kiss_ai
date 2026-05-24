import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readQuestions, writeQuestions, extractBuildQuestions, extractAllBuildQuestions, getQuestionCounts } from "./questionsService.js";

describe("questionsService", () => {
  async function makeTempDir() {
    return await fs.mkdtemp(path.join(os.tmpdir(), "kiss-ai-questions-"));
  }

  describe("readQuestions", () => {
    it("returns empty array when questions file does not exist", async () => {
      const dir = await makeTempDir();
      const result = await readQuestions(dir);
      expect(result).toEqual({ questions: [] });
    });

    it("reads a well-formed questions file", async () => {
      const dir = await makeTempDir();
      const questions = [{ id: "q-1", text: "What is X?", status: "open" }];
      await fs.mkdir(path.join(dir, ".build"), { recursive: true });
      await fs.writeFile(
        path.join(dir, ".build/questions.json"),
        JSON.stringify({ questions }),
        "utf-8"
      );

      const result = await readQuestions(dir);
      expect(result.questions).toHaveLength(1);
      expect(result.questions[0].id).toBe("q-1");
    });

    it("returns empty array when questions file is malformed JSON", async () => {
      const dir = await makeTempDir();
      await fs.mkdir(path.join(dir, ".build"), { recursive: true });
      await fs.writeFile(path.join(dir, ".build/questions.json"), "{broken", "utf-8");

      const result = await readQuestions(dir);
      expect(result).toEqual({ questions: [] });
    });

    it("returns empty array when questions field is not an array", async () => {
      const dir = await makeTempDir();
      await fs.mkdir(path.join(dir, ".build"), { recursive: true });
      await fs.writeFile(
        path.join(dir, ".build/questions.json"),
        JSON.stringify({ questions: "not-an-array" }),
        "utf-8"
      );

      const result = await readQuestions(dir);
      expect(result).toEqual({ questions: [] });
    });
  });

  describe("writeQuestions", () => {
    it("creates the .build directory and writes the file", async () => {
      const dir = await makeTempDir();
      const questions = [{ id: "q-1", text: "What is X?" }];

      await writeQuestions(dir, questions);

      const raw = await fs.readFile(path.join(dir, ".build/questions.json"), "utf-8");
      const parsed = JSON.parse(raw);
      expect(parsed.questions).toHaveLength(1);
      expect(parsed.questions[0].id).toBe("q-1");
    });
  });

  describe("extractBuildQuestions", () => {
    it("extracts BUILD_QUESTION markers from file content", () => {
      const content = `# Report
Some text here.
<!-- BUILD_QUESTION: {"text": "Is this correct?", "priority": "blocking"} -->
More text.
<!-- BUILD_QUESTION: {"text": "Confirm this?", "context": "Section 2", "priority": "informational"} -->
`;
      const questions = extractBuildQuestions(content, "outputs_ai/report.md", {
        phase: "3b",
        buildId: "build-1",
        modelId: "model-1",
      });

      expect(questions).toHaveLength(2);
      expect(questions[0].text).toBe("Is this correct?");
      expect(questions[0].priority).toBe("blocking");
      expect(questions[0].relatedFiles).toEqual(["outputs_ai/report.md"]);
      expect(questions[1].text).toBe("Confirm this?");
      expect(questions[1].context).toBe("Section 2");
    });

    it("skips malformed JSON in markers", () => {
      const content = `<!-- BUILD_QUESTION: {broken json} -->`;
      const questions = extractBuildQuestions(content, "test.md", {});
      expect(questions).toHaveLength(0);
    });

    it("skips markers without text field", () => {
      const content = `<!-- BUILD_QUESTION: {"context": "no text here"} -->`;
      const questions = extractBuildQuestions(content, "test.md", {});
      expect(questions).toHaveLength(0);
    });

    it("defaults invalid priority to informational", () => {
      const content = `<!-- BUILD_QUESTION: {"text": "Q1", "priority": "super-critical"} -->`;
      const questions = extractBuildQuestions(content, "test.md", {});
      expect(questions[0].priority).toBe("informational");
    });

    it("returns empty array for content with no markers", () => {
      const content = "Just regular markdown content.";
      const questions = extractBuildQuestions(content, "test.md", {});
      expect(questions).toHaveLength(0);
    });
  });

  describe("extractAllBuildQuestions", () => {
    it("extracts questions from multiple output files", async () => {
      const dir = await makeTempDir();
      await fs.mkdir(path.join(dir, "outputs_ai"), { recursive: true });

      await fs.writeFile(
        path.join(dir, "outputs_ai/report.md"),
        `<!-- BUILD_QUESTION: {"text": "From report"} -->`,
        "utf-8"
      );
      await fs.writeFile(
        path.join(dir, "outputs_ai/summary.md"),
        `<!-- BUILD_QUESTION: {"text": "From summary"} -->`,
        "utf-8"
      );

      const questions = await extractAllBuildQuestions(
        dir,
        ["outputs_ai/report.md", "outputs_ai/summary.md"],
        { phase: "3b" }
      );

      expect(questions).toHaveLength(2);
      expect(questions.map((q) => q.text)).toEqual(["From report", "From summary"]);
    });

    it("skips files that do not exist", async () => {
      const dir = await makeTempDir();
      const questions = await extractAllBuildQuestions(dir, ["nonexistent.md"], {});
      expect(questions).toHaveLength(0);
    });
  });

  describe("getQuestionCounts", () => {
    it("returns correct counts for mixed statuses", async () => {
      const dir = await makeTempDir();
      const questions = [
        { id: "q-1", text: "Q1", status: "open", priority: "blocking" },
        { id: "q-2", text: "Q2", status: "open", priority: "informational" },
        { id: "q-3", text: "Q3", status: "answered", priority: "blocking" },
      ];
      await writeQuestions(dir, questions);

      const counts = await getQuestionCounts(dir);
      expect(counts.openQuestionsCount).toBe(2);
      expect(counts.blockingQuestionsCount).toBe(1);
      expect(counts.totalQuestionsCount).toBe(3);
    });

    it("returns zero counts when no questions exist", async () => {
      const dir = await makeTempDir();
      const counts = await getQuestionCounts(dir);
      expect(counts).toEqual({
        openQuestionsCount: 0,
        blockingQuestionsCount: 0,
        totalQuestionsCount: 0,
      });
    });
  });
});
