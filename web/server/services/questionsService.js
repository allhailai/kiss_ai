import fs from "node:fs/promises";
import path from "node:path";

const QUESTIONS_PATH = ".build/questions.json";

/**
 * Read questions.json, returning { questions: [] } if missing or invalid.
 */
export async function readQuestions(projectPath) {
  try {
    const raw = await fs.readFile(path.join(projectPath, QUESTIONS_PATH), "utf-8");
    const data = JSON.parse(raw);
    return { questions: Array.isArray(data.questions) ? data.questions : [] };
  } catch {
    return { questions: [] };
  }
}

/**
 * Write questions to .build/questions.json
 */
export async function writeQuestions(projectPath, questions) {
  const outPath = path.join(projectPath, QUESTIONS_PATH);
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify({ questions }, null, 2) + "\n", "utf-8");
}

/**
 * Answer a question by ID.
 * Returns the updated question or null if not found.
 */
export async function answerQuestion(projectPath, questionId, answerText) {
  const data = await readQuestions(projectPath);
  const question = data.questions.find((q) => q.id === questionId);

  if (!question) return null;

  question.answer = answerText;
  question.answeredAt = new Date().toISOString();
  question.status = "answered";

  await writeQuestions(projectPath, data.questions);
  return question;
}

/**
 * Scan a file for <!-- BUILD_QUESTION: {...} --> markers.
 * Returns an array of enriched question objects.
 */
export function extractBuildQuestions(fileContent, outputFilePath, buildMeta) {
  const questions = [];
  const markerRegex = /<!--\s*BUILD_QUESTION:\s*(\{[\s\S]*?\})\s*-->/g;

  let match;
  while ((match = markerRegex.exec(fileContent)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);

      if (!parsed.text || typeof parsed.text !== "string") continue;

      const id = `q-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

      questions.push({
        id,
        text: parsed.text.trim(),
        context: (parsed.context || "").trim(),
        priority: ["blocking", "important", "informational"].includes(parsed.priority) ? parsed.priority : "informational",
        status: "open",
        askedAt: new Date().toISOString(),
        askedDuring: {
          phase: buildMeta?.phase || "3b",
          buildId: buildMeta?.buildId || null,
          modelId: buildMeta?.modelId || null,
        },
        relatedFiles: [outputFilePath],
        relatedTopics: [],
        answer: null,
        answeredAt: null,
      });
    } catch {
      // Malformed JSON in marker — skip silently
    }
  }

  return questions;
}

/**
 * Scan all directed output files for BUILD_QUESTION markers.
 * Returns all raw questions with metadata.
 */
export async function extractAllBuildQuestions(projectPath, outputFiles, buildMeta) {
  const allQuestions = [];

  for (const outputFile of outputFiles) {
    try {
      const fullPath = path.join(projectPath, outputFile);
      const content = await fs.readFile(fullPath, "utf-8");
      const questions = extractBuildQuestions(content, outputFile, buildMeta);
      allQuestions.push(...questions);
    } catch {
      // File doesn't exist or can't be read — skip
    }
  }

  return allQuestions;
}

/**
 * Get summary counts for the status endpoint.
 */
export async function getQuestionCounts(projectPath) {
  const data = await readQuestions(projectPath);
  const open = data.questions.filter((q) => q.status === "open");

  return {
    openQuestionsCount: open.length,
    blockingQuestionsCount: open.filter((q) => q.priority === "blocking").length,
    totalQuestionsCount: data.questions.length,
  };
}
