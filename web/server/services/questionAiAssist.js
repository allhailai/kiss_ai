import { prepareCursorAgentRun } from "./cursorAgentRun.js";

/**
 * Create the question AI assist service.
 *
 * This service generates an AI-drafted answer for a build question.
 * It sends the question text, context, user draft, and related file paths
 * to a Cursor agent, which can use its built-in web search and file reading
 * tools to construct a comprehensive answer.
 */
export function createQuestionAiAssistService({
  httpError,
  listCursorModels,
  pickRebuildModelId,
  projectAgentLock,
  resolveCursorApiKey,
  runCursorAgentText,
}) {
  async function assistQuestion(project, body) {
    const modelId = String(body?.modelId ?? "").trim();
    const questionText = String(body?.questionText ?? "").trim();
    const questionContext = String(body?.questionContext ?? "").trim();
    const userDraft = String(body?.userDraft ?? "").trim();
    const relatedFiles = Array.isArray(body?.relatedFiles) ? body.relatedFiles.filter((f) => typeof f === "string") : [];

    if (!modelId) throw httpError("AI Assist requires a model.", 400, "missing_model");
    if (!questionText) throw httpError("AI Assist requires a question.", 400, "missing_question");

    const { cursorApiKey, modelId: resolvedModelId, releaseProjectAgent } = await prepareCursorAgentRun({
      httpError,
      label: "question_ai_assist",
      listCursorModels,
      noApiKeyMessage: "No Cursor API key found. AI Assist is unavailable.",
      noModelsMessage: "No Cursor models are available for AI Assist.",
      pickRebuildModelId,
      project,
      projectAgentLock,
      requestedModelId: modelId,
      resolveCursorApiKey,
    });

    try {
      const prompt = buildQuestionAssistPrompt({
        projectRoot: project.path,
        projectSlug: project.slug,
        questionText,
        questionContext,
        userDraft,
        relatedFiles,
      });

      const rawAnswer = await runCursorAgentText({
        project,
        apiKey: cursorApiKey.apiKey,
        modelId: resolvedModelId,
        prompt,
      });

      if (!rawAnswer) {
        return {
          answer: "The AI could not generate an answer. Please try again or provide more context.",
          confidence: "low",
          confidenceReason: "No response was generated.",
        };
      }

      return parseAssistResponse(rawAnswer);
    } finally {
      releaseProjectAgent();
    }
  }

  return { assistQuestion };
}

const confidenceLevels = new Set(["high", "medium", "low"]);
const confidenceBlockPattern = /\n---\nCONFIDENCE:\s*(high|medium|low)\s*\nREASON:\s*(.+)/is;

/**
 * Parse the structured agent response to extract confidence metadata and the
 * clean answer body.
 *
 * Expected format from the agent:
 *   <answer text>
 *   ---
 *   CONFIDENCE: High
 *   REASON: Web search data confirmed the classification.
 */
function parseAssistResponse(raw) {
  const match = raw.match(confidenceBlockPattern);

  if (match) {
    const answer = raw.slice(0, match.index).trim();
    const confidence = match[1].trim().toLowerCase();
    const confidenceReason = match[2].trim();

    return {
      answer: answer || raw.trim(),
      confidence: confidenceLevels.has(confidence) ? confidence : "medium",
      confidenceReason: confidenceReason || "No justification provided.",
    };
  }

  // Fallback: agent didn't follow the format — return the full text as the answer.
  return {
    answer: raw.trim(),
    confidence: "medium",
    confidenceReason: "Confidence could not be determined from the agent response.",
  };
}

function buildQuestionAssistPrompt({ projectRoot, projectSlug, questionText, questionContext, userDraft, relatedFiles }) {
  const sections = [
    "You are answering a build question for a local kiss_ai research project.",
    "",
    "## Critical Output Rules",
    "",
    "- Output ONLY the direct answer. Begin immediately with the answer content.",
    "- Do NOT express intent, describe your plan, or narrate what you will do.",
    "  BAD: \"I'll search for information about...\" or \"Let me look into...\"",
    "  GOOD: Begin directly with the factual answer.",
    "- Do NOT include preamble, commentary, meta-instructions, or thinking.",
    "- Do not wrap the answer in markdown code fences or XML tags.",
    "- Keep the answer concise but thorough. Prioritize actionable information.",
    "",
    "## Confidence Footer (Required)",
    "",
    "After your answer, include exactly this footer separated by a line of three dashes.",
    "Replace the placeholders with your actual assessment:",
    "",
    "---",
    "CONFIDENCE: High|Medium|Low",
    "REASON: 1-2 sentence justification for your confidence level, citing what evidence supports your answer.",
    "",
    "Confidence guide:",
    "- High: Answer confirmed by web search results, official documentation, or direct file evidence.",
    "- Medium: Answer based on strong reasoning and partial evidence, but not fully confirmed.",
    "- Low: Answer is best-effort based on limited information; user should verify independently.",
    "",
    "## Research Instructions",
    "",
    "- Search the web if helpful to provide accurate, current information.",
    "- If a user draft is provided, treat it as the user's starting thoughts — improve, expand, and refine it.",
    "- If no user draft is provided, write a complete answer from scratch.",
    "- Related files are listed below. You can read them from the project directory to understand context.",
    "",
    `Project slug: ${projectSlug}`,
    `Project root: ${projectRoot}`,
    "",
    "## Question",
    "",
    questionText,
    "",
  ];

  if (questionContext) {
    sections.push("## Additional Context", "", questionContext, "");
  }

  if (userDraft) {
    sections.push("## User's Current Draft Answer", "", userDraft, "");
  }

  if (relatedFiles.length > 0) {
    sections.push(
      "## Related Files",
      "",
      "These files are relevant to the question. You can read them from the project directory for additional context:",
      "",
      ...relatedFiles.map((f) => `- ${f}`),
      "",
    );
  }

  return sections.join("\n");
}

