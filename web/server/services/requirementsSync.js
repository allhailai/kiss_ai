import fs from "node:fs/promises";
import path from "node:path";
import {
  activeRejectionRecords,
  annotateConceptualDiffsWithMemory,
  buildRejectionMemoryPromptContext,
  emptyConceptualDiffMemory,
  filterSuppressedConceptualDiffs,
  normalizeConceptualDiffMemoryFile,
  updateConceptualDiffRejectionMemory,
} from "./conceptualDiffMemory.js";
import { extractApplyResultFromText, extractConceptualDiffsFromText, parseJsonTaggedContent } from "./conceptualDiffs.js";
import { prepareCursorAgentRun } from "./cursorAgentRun.js";
import { buildGitDiffPromptEntries } from "./gitDiffPrompt.js";

const requirementFilePaths = {
  goal: "human_goal_requirements.md",
  inputs: "human_input_requirements.md",
  outputs: "human_output_requirements.md",
};
const requirementFilePathSet = new Set(Object.values(requirementFilePaths));
const requirementSteps = ["goal", "inputs", "outputs"];
const maxPromptFileBytes = 24 * 1024;
const maxSignalDiffs = 40;
const conceptualDiffMemoryPath = ".conceptual-diff-memory.json";

function nowIso() {
  return new Date().toISOString();
}

function trimForPrompt(value, maxBytes = maxPromptFileBytes) {
  const text = String(value ?? "");
  if (Buffer.byteLength(text, "utf8") <= maxBytes) return text;
  return `${text.slice(0, maxBytes)}\n\n[Truncated for prompt size.]`;
}

function compactText(value, maxLength = 1200) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

function promptPath(FRAMEWORK_ROOT, relativePath) {
  return path.join(FRAMEWORK_ROOT, "prompts", "requirements_sync", relativePath);
}

async function readPrompt(FRAMEWORK_ROOT, relativePath) {
  return fs.readFile(promptPath(FRAMEWORK_ROOT, relativePath), "utf8");
}

async function loadConceptualDiffMemory(projectRoot) {
  try {
    return normalizeConceptualDiffMemoryFile(JSON.parse(await fs.readFile(path.join(projectRoot, conceptualDiffMemoryPath), "utf8")));
  } catch (error) {
    if (error.code === "ENOENT") return emptyConceptualDiffMemory();
    throw error;
  }
}

async function saveConceptualDiffMemory(projectRoot, memory) {
  const normalized = normalizeConceptualDiffMemoryFile(memory);
  await fs.writeFile(path.join(projectRoot, conceptualDiffMemoryPath), `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  return normalized;
}

async function readOptionalTextFile(readTextFile, projectRoot, relativePath) {
  try {
    return await readTextFile(projectRoot, relativePath);
  } catch (error) {
    return {
      path: relativePath,
      content: "",
      contentHash: "",
      error: error instanceof Error ? error.message : "Could not read file.",
    };
  }
}

function isRelevantSignalPath(statusLine) {
  const pathText = String(statusLine ?? "").slice(3).trim();
  return (
    /^human_[^/]+_requirements\.md$/i.test(pathText) ||
    requirementFilePathSet.has(pathText) ||
    pathText.startsWith("inputs_human/") ||
    pathText.startsWith("inputs_ai/") ||
    pathText.startsWith("outputs_ai/")
  );
}

function uniqueByPath(files) {
  return [...new Map(files.filter((file) => file?.path).map((file) => [file.path, file])).values()];
}

async function readProjectFilesForRoot(listProjectFiles, projectRoot, rootRelative) {
  try {
    return await listProjectFiles(projectRoot, rootRelative);
  } catch {
    return [];
  }
}

async function collectSignalInventory({ project, gitFileDiffText, gitFileDiffTexts, gitStatus, listProjectFiles }) {
  const [statusLines, humanInputs, aiInputs, outputs] = await Promise.all([
    gitStatus(project.path),
    readProjectFilesForRoot(listProjectFiles, project.path, "inputs_human"),
    readProjectFilesForRoot(listProjectFiles, project.path, "inputs_ai"),
    readProjectFilesForRoot(listProjectFiles, project.path, "outputs_ai"),
  ]);
  const relevantStatus = statusLines.filter(isRelevantSignalPath);
  const diffCandidates = uniqueByPath([
    ...Object.values(requirementFilePaths).map((filePath) => ({ path: filePath, kind: "human_requirement" })),
    ...humanInputs,
    ...aiInputs,
    ...outputs,
  ]).slice(0, maxSignalDiffs);
  const diffs = await buildGitDiffPromptEntries({ projectRoot: project.path, files: diffCandidates, gitFileDiffText, gitFileDiffTexts, trimForPrompt });

  return {
    gitStatus: relevantStatus,
    humanInputs: humanInputs.map((file) => ({
      path: file.path,
      name: file.name,
      modifiedAt: file.modifiedAt ?? null,
      previewable: file.previewable !== false,
    })),
    aiInputs: aiInputs.map((file) => ({ path: file.path, modifiedAt: file.modifiedAt ?? null })),
    outputs: outputs.map((file) => ({ path: file.path, modifiedAt: file.modifiedAt ?? null })),
    gitDiffs: diffs.filter((entry) => entry.diff.trim() || entry.diffError),
  };
}

async function readRequirementsContext({ project, readTextFile }) {
  const [goal, inputs, outputs, openQuestions, annotationLog] = await Promise.all([
    readOptionalTextFile(readTextFile, project.path, requirementFilePaths.goal),
    readOptionalTextFile(readTextFile, project.path, requirementFilePaths.inputs),
    readOptionalTextFile(readTextFile, project.path, requirementFilePaths.outputs),
    readOptionalTextFile(readTextFile, project.path, "human_open_questions.md"),
    readOptionalTextFile(readTextFile, project.path, "change_logs/annotation_change_logs.md"),
  ]);
  const requirementFiles = { goal, inputs, outputs };

  return {
    requirementFiles: Object.fromEntries(
      Object.entries(requirementFiles).map(([step, file]) => [
        step,
        {
          path: file.path,
          content: file.content,
          contentHash: file.contentHash,
          error: file.error,
        },
      ]),
    ),
    openQuestions: {
      path: openQuestions.path,
      content: openQuestions.content,
      contentHash: openQuestions.contentHash,
      error: openQuestions.error,
    },
    annotationLog: {
      path: annotationLog.path,
      content: trimForPrompt(annotationLog.content),
      contentHash: annotationLog.contentHash,
      error: annotationLog.error,
    },
  };
}

function normalizeStep(value) {
  const step = String(value ?? "").trim();
  return requirementSteps.includes(step) ? step : "goal";
}

function normalizeStringArray(value) {
  return Array.isArray(value) ? value.map((item) => String(item ?? "").trim()).filter(Boolean).slice(0, 30) : [];
}

export function extractRequirementsSyncProposal(rawText, { step, targetFilePath, originalContentHash }) {
  const parsed = parseJsonTaggedContent(rawText, "requirements_sync_proposal_json");
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }

  const conceptualDiffs = extractConceptualDiffsFromText(rawText, "requirements_sync_proposal_json", new Set([targetFilePath]), { idPrefix: "rsdiff" });
  return {
    step,
    targetFilePath,
    originalContentHash,
    summary: String(parsed.summary ?? "Prepared requirements sync proposal.").trim().slice(0, 1200),
    conceptualDiffs,
    sourceSignalsUsed: normalizeStringArray(parsed.sourceSignalsUsed),
    generatedAt: nowIso(),
  };
}

export function extractRequirementsSyncApplyResult(rawText, allowedFailedIds = null) {
  return extractApplyResultFromText(rawText, "requirements_sync_apply_json", allowedFailedIds);
}

function logEntry({ modelId, proposal, appliedFile, failedConceptualDiffIds }) {
  const timestamp = nowIso();
  const failed = failedConceptualDiffIds.length ? failedConceptualDiffIds.map((id) => `- ${id}`).join("\n") : "- None";

  return [
    `## ${timestamp} - Requirements Sync`,
    "",
    `**Model:** ${modelId}`,
    `**Target:** ${proposal.targetFilePath}`,
    "",
    "### File Changed",
    appliedFile ? `- ${appliedFile.path}` : "- None",
    "",
    "### Conceptual Summary",
    `- ${proposal.summary}`,
    "",
    "### Failed Conceptual Diffs",
    failed,
    "",
  ].join("\n");
}

async function prependRequirementsSyncLog(projectRoot, entry) {
  const logPath = path.join(projectRoot, "change_logs", "requirements_sync_log.md");
  await fs.mkdir(path.dirname(logPath), { recursive: true });
  let existing = "# Requirements Sync Log\n\n";
  try {
    existing = await fs.readFile(logPath, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  const normalizedExisting = existing.trimEnd();
  await fs.writeFile(logPath, `${normalizedExisting}\n\n${entry}`, "utf8");
}

function proposalPromptPayload({ project, rejectionMemory = null, step, targetFilePath, requirementsContext, signalInventory, userInstruction }) {
  return {
    project: {
      slug: project.slug,
      root: project.path,
    },
    step,
    targetFilePath,
    requirements: requirementsContext.requirementFiles,
    openQuestions: {
      ...requirementsContext.openQuestions,
      content: trimForPrompt(requirementsContext.openQuestions.content),
    },
    annotationLog: requirementsContext.annotationLog,
    signals: signalInventory,
    userInstruction: userInstruction || "",
    conceptual_diff_rejection_memory: rejectionMemory
      ? buildRejectionMemoryPromptContext(rejectionMemory, {
          filePaths: new Set([targetFilePath]),
          flow: "requirements_sync",
          step,
          userInstruction,
        })
      : undefined,
  };
}

export function createRequirementsSyncService({
  FRAMEWORK_ROOT,
  gitFileDiffText,
  gitFileDiffTexts = null,
  gitStatus,
  httpError,
  listCursorModels,
  listProjectFiles,
  pickRebuildModelId,
  projectAgentLock,
  readTextFile,
  resolveCursorApiKey,
  runCursorAgent,
}) {
  async function prepareAgentRun(project, requestedModelId) {
    return prepareCursorAgentRun({
      httpError,
      label: "requirements_sync",
      listCursorModels,
      noApiKeyMessage: "No Cursor API key found. Requirements sync is unavailable from the UI.",
      noModelsMessage: "No Cursor models are available for requirements sync.",
      pickRebuildModelId,
      project,
      projectAgentLock,
      requestedModelId,
      resolveCursorApiKey,
    });
  }

  async function createPrompt({ project, rejectionMemory, step, requirementsContext, signalInventory, userInstruction }) {
    const targetFilePath = requirementFilePaths[step];
    const [systemPrompt, stepPrompt, outputContract] = await Promise.all([
      readPrompt(FRAMEWORK_ROOT, "system.md"),
      readPrompt(FRAMEWORK_ROOT, `step_${step}.md`),
      readPrompt(FRAMEWORK_ROOT, "output_contract.md"),
    ]);
    const payload = proposalPromptPayload({ project, rejectionMemory, step, targetFilePath, requirementsContext, signalInventory, userInstruction });

    return [
      systemPrompt.trim(),
      "",
      stepPrompt.trim(),
      "",
      outputContract.trim(),
      "",
      "Project payload:",
      JSON.stringify(payload, null, 2),
    ].join("\n");
  }

  async function createApplyPrompt({ project, proposal, requirementsContext, signalInventory, userInstruction }) {
    const step = normalizeStep(proposal.step);
    const targetFilePath = requirementFilePaths[step];
    const [systemPrompt, stepPrompt, applyContract] = await Promise.all([
      readPrompt(FRAMEWORK_ROOT, "system.md"),
      readPrompt(FRAMEWORK_ROOT, `step_${step}.md`),
      readPrompt(FRAMEWORK_ROOT, "apply_contract.md"),
    ]);
    const acceptedConceptualDiffs = proposal.conceptualDiffs.filter((diff) => diff.status === "accepted" && diff.filePath === targetFilePath);
    const rejectedConceptualDiffs = proposal.conceptualDiffs.filter((diff) => diff.status === "rejected");
    const payload = {
      ...proposalPromptPayload({ project, step, targetFilePath, requirementsContext, signalInventory, userInstruction }),
      approved_conceptual_diffs: acceptedConceptualDiffs,
      rejected_conceptual_diffs: rejectedConceptualDiffs,
      allowed_edit_paths: [targetFilePath],
    };

    return [
      systemPrompt.trim(),
      "",
      stepPrompt.trim(),
      "",
      applyContract.trim(),
      "",
      "Project payload:",
      JSON.stringify(payload, null, 2),
    ].join("\n");
  }

  async function proposeRequirementsSync(project, body) {
    const step = normalizeStep(body.step);
    const requestedModelId = String(body.modelId ?? "").trim();
    if (!requestedModelId) throw httpError("Requirements sync requires a model.");

    const { cursorApiKey, modelId, releaseProjectAgent } = await prepareAgentRun(project, requestedModelId);
    try {
      const [requirementsContext, signalInventory, rejectionMemory] = await Promise.all([
        readRequirementsContext({ project, readTextFile }),
        collectSignalInventory({ project, gitFileDiffText, gitFileDiffTexts, gitStatus, listProjectFiles }),
        loadConceptualDiffMemory(project.path),
      ]);
      const targetFilePath = requirementFilePaths[step];
      const targetFile = requirementsContext.requirementFiles[step];
      const prompt = await createPrompt({
        project,
        rejectionMemory,
        requirementsContext,
        signalInventory,
        step,
        userInstruction: body.userInstruction,
      });
      let assistantText = "";
      await runCursorAgent({
        project,
        apiKey: cursorApiKey.apiKey,
        modelId,
        prompt,
        onEvent: async (event) => {
          if (event.type === "assistant_delta" && event.text) assistantText += event.text;
        },
      });

      const proposal = extractRequirementsSyncProposal(assistantText, {
        step,
        targetFilePath,
        originalContentHash: targetFile.contentHash,
      });
      if (!proposal) {
        throw httpError("Requirements sync did not return a valid proposal. Try again or choose a different model.", 502, "requirements_sync_invalid_output");
      }

      const activeRecords = activeRejectionRecords(rejectionMemory, {
        filePaths: new Set([targetFilePath]),
        flow: "requirements_sync",
        step,
      });
      const conceptualDiffs = filterSuppressedConceptualDiffs(annotateConceptualDiffsWithMemory(proposal.conceptualDiffs, activeRecords), activeRecords, {
        userInstruction: body.userInstruction,
      });

      return {
        proposal: {
          ...proposal,
          conceptualDiffs,
          modelId,
          sourceSignalsUsed: proposal.sourceSignalsUsed.length
            ? proposal.sourceSignalsUsed
            : signalInventory.gitStatus.map((line) => `Git status: ${line}`).slice(0, 10),
        },
      };
    } finally {
      releaseProjectAgent();
    }
  }

  async function recordRequirementsSyncReview(project, body) {
    const proposal = body.proposal;
    if (!proposal) throw httpError("Requirements Sync review requires a proposal.", 400, "requirements_sync_review_empty");
    const step = normalizeStep(proposal.step);
    const targetPath = String(proposal.targetFilePath ?? "").trim();
    if (targetPath !== requirementFilePaths[step]) throw httpError(`Cannot record requirements sync review for ${targetPath}.`, 403, "requirements_sync_path_not_allowed");
    const conceptualDiffs = proposal.conceptualDiffs.filter((diff) => diff.filePath === targetPath && (diff.status === "rejected" || diff.memory?.reconsidersRejectedId));
    if (!conceptualDiffs.length) return { recordedRejectedConceptualDiffIds: [] };

    const memory = await loadConceptualDiffMemory(project.path);
    await saveConceptualDiffMemory(project.path, updateConceptualDiffRejectionMemory(memory, {
      conceptualDiffs,
      evidenceSnapshot: { sourceSignals: proposal.sourceSignalsUsed ?? [] },
      flow: "requirements_sync",
      sourceContentHash: proposal.originalContentHash,
      step,
    }));

    return {
      recordedRejectedConceptualDiffIds: conceptualDiffs.filter((diff) => diff.status === "rejected").map((diff) => diff.id),
    };
  }

  function validateApplyProposal(proposal, errorPrefix = "Cannot apply requirements sync") {
    if (!proposal) throw httpError("Apply requires a requirements sync proposal.", 400, "requirements_sync_empty_apply");
    const step = normalizeStep(proposal.step);
    const targetPath = String(proposal.targetFilePath ?? "").trim();
    if (targetPath !== requirementFilePaths[step]) throw httpError(`${errorPrefix} to ${targetPath}.`, 403, "requirements_sync_path_not_allowed");
    return { step, targetPath };
  }

  async function applyRequirementsSync(project, body) {
    const proposal = body.proposal;
    const { targetPath } = validateApplyProposal(proposal);
    const acceptedConceptualDiffs = proposal.conceptualDiffs.filter((diff) => diff.status === "accepted" && diff.filePath === targetPath);
    await recordRequirementsSyncReview(project, { proposal });
    if (proposal.conceptualDiffs.length && !acceptedConceptualDiffs.length) {
      throw httpError("Accept at least one conceptual diff before applying Requirements Sync.", 400, "requirements_sync_no_accepted_diffs");
    }

    const requestedModelId = String(body.modelId ?? "").trim();
    if (!requestedModelId) throw httpError("Requirements sync apply requires a model.", 400, "requirements_sync_model_required");

    const { cursorApiKey, modelId, releaseProjectAgent } = await prepareAgentRun(project, requestedModelId);
    try {
      const [requirementsContext, signalInventory] = await Promise.all([
        readRequirementsContext({ project, readTextFile }),
        collectSignalInventory({ project, gitFileDiffText, gitFileDiffTexts, gitStatus, listProjectFiles }),
      ]);
      const prompt = await createApplyPrompt({
        project,
        proposal,
        requirementsContext,
        signalInventory,
        userInstruction: body.userInstruction,
      });
      let assistantText = "";
      await runCursorAgent({
        project,
        apiKey: cursorApiKey.apiKey,
        modelId,
        prompt,
        onEvent: async (event) => {
          if (event.type === "assistant_delta" && event.text) assistantText += event.text;
        },
      });
      const applyResult = extractRequirementsSyncApplyResult(
        assistantText,
        acceptedConceptualDiffs.map((diff) => diff.id),
      );
      const applied = await readTextFile(project.path, targetPath);
      const appliedFile = {
        path: applied.path,
        contentHash: applied.contentHash,
      };

      await prependRequirementsSyncLog(
        project.path,
        logEntry({
          appliedFile,
          failedConceptualDiffIds: applyResult.valid ? applyResult.failedConceptualDiffIds : acceptedConceptualDiffs.map((diff) => diff.id),
          modelId,
          proposal,
        }),
      );

      return {
        appliedFile,
        failedConceptualDiffIds: applyResult.valid ? applyResult.failedConceptualDiffIds : acceptedConceptualDiffs.map((diff) => diff.id),
        summary:
          applyResult.notice ||
          (applyResult.valid ? `Applied Requirements Sync to ${targetPath}.` : "Requirements Sync apply did not return a valid result summary. Review the file before continuing."),
      };
    } finally {
      releaseProjectAgent();
    }
  }

  async function applyRequirementsSyncBatch(project, body) {
    const requestedModelId = String(body.modelId ?? "").trim();
    if (!requestedModelId) throw httpError("Requirements sync batch apply requires a model.", 400, "requirements_sync_model_required");

    const proposalByStep = new Map();
    for (const proposal of body.proposals ?? []) {
      const { step } = validateApplyProposal(proposal, "Cannot batch apply requirements sync");
      if (proposalByStep.has(step)) throw httpError(`Duplicate Requirements Sync proposal for ${step}.`, 400, "requirements_sync_duplicate_step");
      proposalByStep.set(step, proposal);
    }

    const missingSteps = requirementSteps.filter((step) => !proposalByStep.has(step));
    if (missingSteps.length) {
      throw httpError(`Requirements Sync batch apply is missing proposal(s): ${missingSteps.join(", ")}.`, 400, "requirements_sync_missing_steps");
    }

    const results = [];
    for (const step of requirementSteps) {
      const proposal = proposalByStep.get(step);
      const targetPath = requirementFilePaths[step];
      const acceptedConceptualDiffs = proposal.conceptualDiffs.filter((diff) => diff.status === "accepted" && diff.filePath === targetPath);

      if (!acceptedConceptualDiffs.length) {
        await recordRequirementsSyncReview(project, { proposal });
        results.push({
          step,
          targetFilePath: targetPath,
          status: "skipped",
          appliedFile: null,
          failedConceptualDiffIds: [],
          summary: proposal.conceptualDiffs.length
            ? `Skipped ${targetPath}; no conceptual diffs were accepted.`
            : `Skipped ${targetPath}; no conceptual diffs were proposed.`,
        });
        continue;
      }

      try {
        const response = await applyRequirementsSync(project, { modelId: requestedModelId, proposal });
        results.push({
          step,
          targetFilePath: targetPath,
          status: response.failedConceptualDiffIds.length ? "failed" : "applied",
          appliedFile: response.appliedFile,
          failedConceptualDiffIds: response.failedConceptualDiffIds,
          summary: response.summary,
        });
      } catch (error) {
        results.push({
          step,
          targetFilePath: targetPath,
          status: "failed",
          appliedFile: null,
          failedConceptualDiffIds: acceptedConceptualDiffs.map((diff) => diff.id),
          summary: error instanceof Error ? error.message : `Could not apply Requirements Sync to ${targetPath}.`,
        });
      }
    }

    const appliedCount = results.filter((result) => result.status === "applied").length;
    const failedCount = results.filter((result) => result.status === "failed").length;
    const skippedCount = results.filter((result) => result.status === "skipped").length;
    return {
      results,
      summary: `Requirements Sync complete: ${appliedCount} applied, ${skippedCount} skipped, ${failedCount} failed.`,
    };
  }

  async function requirementsSyncSignals(project) {
    const signalInventory = await collectSignalInventory({ project, gitFileDiffText, gitFileDiffTexts, gitStatus, listProjectFiles });
    const openQuestions = await readOptionalTextFile(readTextFile, project.path, "human_open_questions.md");
    const openQuestionLines = openQuestions.content
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => /^[-*]\s+\S/.test(line) || /\?$/.test(line));

    return {
      hasSignals: Boolean(signalInventory.gitStatus.length || openQuestionLines.length),
      gitStatus: signalInventory.gitStatus,
      openQuestions: openQuestionLines.slice(0, 20),
      summary: compactText(
        [
          signalInventory.gitStatus.length ? `${signalInventory.gitStatus.length} relevant Git change signal(s)` : "",
          openQuestionLines.length ? `${openQuestionLines.length} possible open question signal(s)` : "",
        ]
          .filter(Boolean)
          .join("; ") || "No requirements sync signals detected.",
      ),
    };
  }

  return {
    applyRequirementsSyncBatch,
    applyRequirementsSync,
    proposeRequirementsSync,
    recordRequirementsSyncReview,
    requirementsSyncSignals,
  };
}
