import { createHash, randomUUID } from "node:crypto";
import { MAX_USER_MESSAGE_BYTES } from "../contracts/chatLimits.js";
import { normalizeChatContext } from "./chatContext.js";

const maxPromptFileBytes = 24 * 1024;
const maxPromptHistoryMessages = 40;
const maxContextFiles = 20;
const maxAiEditableFiles = 10;
const noProposalGuidanceMessage = [
  "What changes do you want to make to the editable files?",
  "I need guidance.",
  "No edits were found in the file nor messages provided for guidance.",
].join("\n");

function nowIso() {
  return new Date().toISOString();
}

function createMessageId() {
  return `msg_${randomUUID().replaceAll("-", "").slice(0, 18)}`;
}

function trimForPrompt(value, maxBytes = maxPromptFileBytes) {
  const text = String(value ?? "");
  if (Buffer.byteLength(text, "utf8") <= maxBytes) return text;
  return `${text.slice(0, maxBytes)}\n\n[Truncated for prompt size.]`;
}

function hashText(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function requireSendRequest(body, httpError) {
  const modelId = String(body?.modelId ?? "").trim();
  const content = String(body?.content ?? "").trim();
  const context = normalizeChatContext(body?.context, { maxDraftContentLength: 120_000 });

  if (!modelId) throw httpError("Chat requires a model.");
  if (!content) throw httpError("Chat requires a message.");
  if (Buffer.byteLength(content, "utf8") > MAX_USER_MESSAGE_BYTES) {
    throw httpError("Chat message is too large.", 413, "chat_message_too_large");
  }

  return {
    modelId,
    content,
    context,
  };
}

function requireEditRequest(body, httpError) {
  const modelId = String(body?.modelId ?? "").trim();
  const content = String(body?.content ?? "").trim();

  if (!content) throw httpError("Chat requires a message.");
  if (Buffer.byteLength(content, "utf8") > MAX_USER_MESSAGE_BYTES) {
    throw httpError("Chat message is too large.", 413, "chat_message_too_large");
  }

  return {
    modelId: modelId || undefined,
    content,
  };
}

function userMessageFromProposalRequest(body) {
  const content = String(body?.content ?? "").trim();
  if (!content) return null;
  return {
    id: createMessageId(),
    role: "user",
    content,
    createdAt: nowIso(),
    modelId: null,
    status: "complete",
    context: body.fileContext
      ? {
          ai_editable_files: body.fileContext.ai_editable_files ?? [],
          context_files: body.fileContext.context_files ?? [],
        }
      : undefined,
  };
}

function conversationSummaryText(conversation) {
  return conversation.summary ? `Conversation summary: ${conversation.summary}` : "Conversation summary: not generated yet.";
}

function formatHistoryMessage(message) {
  const role = message.role === "assistant" ? "assistant" : message.role === "system" ? "system" : "user";
  return {
    role,
    content: message.content,
    createdAt: message.createdAt,
    context: message.context ?? null,
  };
}

async function readOptionalProjectText(readTextFile, projectRoot, relativePath, maxBytes = maxPromptFileBytes) {
  try {
    const file = await readTextFile(projectRoot, relativePath);
    return trimForPrompt(file.content, maxBytes);
  } catch {
    return "";
  }
}

function uniqueByPath(files, limit) {
  return [...new Map(files.filter((file) => file?.path).map((file) => [file.path, file])).values()].slice(-limit);
}

async function readContextFiles({ project, readTextFile, contextFiles }) {
  return await Promise.all(contextFiles.map(async (contextFile) => {
    try {
      const file = await readTextFile(project.path, contextFile.path);
      if (!/^human_[^/]+\.md$/i.test(file.path) && !file.path.startsWith("inputs_human/") && !file.path.startsWith("inputs_ai/") && !file.path.startsWith("outputs_ai/")) {
        return {
          path: contextFile.path,
          error: "This path is outside the chat context allowlist.",
        };
      }

      return {
        path: file.path,
        label: contextFile.label || file.path,
        kind: file.kind,
        contentHash: file.contentHash,
        intent: "source",
        content: trimForPrompt(file.content),
      };
    } catch (error) {
      return {
        path: contextFile.path,
        error: error instanceof Error ? error.message : "Could not read file context.",
      };
    }
  }));
}

async function readAiEditableFiles({ project, readTextFile, aiEditableFiles }) {
  return await Promise.all(aiEditableFiles.map(async (editableFile) => {
    try {
      const file = await readTextFile(project.path, editableFile.path);
      if (!file.editable) {
        return {
          path: file.path,
          label: editableFile.label || file.path,
          intent: "editable_target",
          error: "This path is not editable in the lab UI.",
        };
      }

      const expectedHash = typeof editableFile.contentHash === "string" && editableFile.contentHash ? editableFile.contentHash : null;
      const hasUnsavedDraft = editableFile.draftState === "unsaved" && typeof editableFile.draftContent === "string";
      return {
        path: file.path,
        label: editableFile.label || file.path,
        kind: file.kind,
        editable: file.editable,
        annotation: file.annotation,
        expectedContentHash: expectedHash,
        contentHash: file.contentHash,
        hashStatus: expectedHash ? (expectedHash === file.contentHash ? "matched" : "changed") : "missing_hash",
        draftState: editableFile.draftState ?? "unknown",
        role: editableFile.role ?? "secondary",
        intent: "editable_target",
        contentSource: hasUnsavedDraft ? "unsaved_draft" : "saved_file",
        content: trimForPrompt(hasUnsavedDraft ? editableFile.draftContent : file.content),
      };
    } catch (error) {
      return {
        path: editableFile.path,
        label: editableFile.label || editableFile.path,
        intent: "editable_target",
        error: error instanceof Error ? error.message : "Could not read AI editable file context.",
      };
    }
  }));
}

async function readCurrentFileContext({ project, readTextFile, currentFile }) {
  if (!currentFile?.path) return null;

  try {
    const file = await readTextFile(project.path, currentFile.path);
    const expectedHash = typeof currentFile.contentHash === "string" && currentFile.contentHash ? currentFile.contentHash : null;
    const hasUnsavedDraft = currentFile.draftState === "unsaved" && typeof currentFile.draftContent === "string";

    return {
      path: file.path,
      label: currentFile.label || file.path,
      kind: file.kind,
      editable: file.editable,
      annotation: file.annotation,
      expectedContentHash: expectedHash,
      contentHash: file.contentHash,
      hashStatus: expectedHash ? (expectedHash === file.contentHash ? "matched" : "changed") : "missing_hash",
      draftState: currentFile.draftState ?? "unknown",
      role: currentFile.role ?? "primary",
      intent: "current_file_context",
      editableIntent: false,
      contentSource: hasUnsavedDraft ? "unsaved_draft" : "saved_file",
      content: trimForPrompt(hasUnsavedDraft ? currentFile.draftContent : file.content),
    };
  } catch (error) {
    return {
      path: currentFile.path,
      label: currentFile.label || currentFile.path,
      intent: "current_file_context",
      editableIntent: false,
      error: error instanceof Error ? error.message : "Could not read current file context.",
    };
  }
}

async function createChatPrompt({ project, conversation, readTextFile, displayProjectName, readProjectHarness }) {
  const [harness, goal, inputs, outputs, openQuestions] = await Promise.all([
    readProjectHarness(project.path),
    readOptionalProjectText(readTextFile, project.path, "human_goal_requirements.md"),
    readOptionalProjectText(readTextFile, project.path, "human_input_requirements.md"),
    readOptionalProjectText(readTextFile, project.path, "human_output_requirements.md"),
    readOptionalProjectText(readTextFile, project.path, "human_open_questions.md"),
  ]);
  const currentFile = [...conversation.messages].reverse().find((message) => message.context?.currentFile)?.context?.currentFile ?? null;
  const aiEditableFiles = conversation.fileContext?.ai_editable_files ?? [];
  const contextFiles = conversation.fileContext?.context_files ?? [];
  const uniqueAiEditableFiles = uniqueByPath(aiEditableFiles, maxAiEditableFiles);
  const uniqueContextFiles = uniqueByPath(contextFiles, maxContextFiles);
  const [currentFileContext, aiEditableFileResults, contextFileResults] = await Promise.all([
    readCurrentFileContext({ project, readTextFile, currentFile }),
    readAiEditableFiles({ project, readTextFile, aiEditableFiles: uniqueAiEditableFiles }),
    readContextFiles({ project, readTextFile, contextFiles: uniqueContextFiles }),
  ]);
  const authorizedAiEditableFiles = aiEditableFileResults.filter((file) => !file.error && file.editable);
  const rejectedAiEditableFiles = aiEditableFileResults.filter((file) => file.error);
  const authorizedEditablePaths = new Set(authorizedAiEditableFiles.map((file) => file.path));
  const history = conversation.messages.slice(-maxPromptHistoryMessages).map(formatHistoryMessage);
  const projectName = displayProjectName(harness.project_name ?? project.name, harness.project_slug ?? project.slug);

  const payload = {
    project: {
      slug: project.slug,
      name: projectName,
      root: project.path,
      setupStatus: harness.setup?.status ?? "unknown",
      lastRunAt: harness.last_run_at ?? null,
    },
    requirements: {
      goal,
      inputs,
      outputs,
      openQuestions,
    },
    conversation: {
      id: conversation.id,
      title: conversation.title,
      summary: conversation.summary,
      history,
    },
    currentFileContext,
    ai_editable_files: authorizedAiEditableFiles,
    rejected_ai_editable_files: rejectedAiEditableFiles,
    context_files: contextFileResults,
  };

  const prompt = [
    "You are the project chat assistant for a local kiss_ai research project.",
    "",
    "Rules:",
    "- Answer the user's latest message using this conversation and supplied project context first.",
    "- Treat a new conversation as fresh context; do not assume access to previous conversations.",
    "- Treat currentFileContext as read-only context for the file the user is viewing. It does not grant edit permission.",
    "- Context entries with contentSource=unsaved_draft reflect the user's current unsaved editor draft and should be treated as newer than saved file content.",
    "- You may propose or prepare updates for files listed in ai_editable_files; base proposals on the provided content field, do not directly edit files, run modifying commands, write logs, or create artifacts.",
    "- Treat context_files as read-only sources to consider. Do not treat them as editable targets unless the same path also appears in ai_editable_files.",
    "- When the user asks for file changes, propose edits only for ai_editable_files and keep the response proposal-only.",
    "- For each proposed file edit, include a tagged block: <file_edit><path>relative/path.md</path><summary>short summary</summary><proposedContent>full replacement file content</proposedContent></file_edit>.",
    "- The web UI may apply tagged file_edit proposals to the unsaved editor draft. Never write files directly.",
    "- User-selected context_files are the only ad hoc file contents included beyond the standard requirement files in the project payload.",
    "- If needed context is missing from currentFileContext, ai_editable_files, context_files, or the standard requirement files, say what is missing.",
    "- Stay inside the current project. User-selected source context files are limited to human_*.md, inputs_human/, inputs_ai/, and outputs_ai/.",
    "- Do not expose hidden chain-of-thought. Provide concise reasoning summaries when useful.",
    "- If context is missing, say what is missing and suggest the next best step.",
    "",
    conversationSummaryText(conversation),
    "",
    "Project and conversation payload:",
    JSON.stringify(payload, null, 2),
  ].join("\n");

  return { authorizedEditablePaths, prompt };
}

function summarizeAssistantText(text) {
  const compact = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!compact) return "";
  return compact.length > 240 ? `${compact.slice(0, 237)}...` : compact;
}

function firstTagContent(text, tagName, { trim = true } = {}) {
  const pattern = new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, "i");
  const value = String(text ?? "").match(pattern)?.[1] ?? "";
  return trim ? value.trim() : value;
}

function allTagContent(text, tagName) {
  const pattern = new RegExp(`<${tagName}>\\s*([\\s\\S]*?)\\s*<\\/${tagName}>`, "gi");
  return [...String(text ?? "").matchAll(pattern)].map((match) => match[1]?.trim() ?? "");
}

function parseJsonTaggedContent(text, tagName) {
  const tagged = firstTagContent(text, tagName);
  const candidate = tagged || String(text ?? "").trim();
  if (!candidate) return null;

  try {
    return JSON.parse(candidate);
  } catch {
    const jsonMatch = candidate.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    try {
      return JSON.parse(jsonMatch[0]);
    } catch {
      return null;
    }
  }
}

function createProposalId() {
  return `proposal_${randomUUID().replaceAll("-", "").slice(0, 18)}`;
}

function createConceptualDiffId() {
  return `diff_${randomUUID().replaceAll("-", "").slice(0, 18)}`;
}

function normalizeConceptualDiffResult(value, authorizedEditablePaths) {
  const source = value && typeof value === "object" ? value : {};
  const filePath = String(source.filePath ?? source.path ?? "").trim();
  const title = String(source.title ?? "").trim();
  const summary = String(source.summary ?? source.description ?? "").trim();

  if (!filePath || !title || !summary || !authorizedEditablePaths.has(filePath)) return null;

  return {
    id: createConceptualDiffId(),
    filePath,
    title: title.slice(0, 160),
    summary: summary.slice(0, 1200),
    status: "accepted",
  };
}

export function extractConceptualDiffs(rawText, authorizedEditablePaths) {
  const parsed = parseJsonTaggedContent(rawText, "edit_proposal_json");
  const candidates = Array.isArray(parsed?.conceptualDiffs) ? parsed.conceptualDiffs : Array.isArray(parsed) ? parsed : [];
  return candidates.map((candidate) => normalizeConceptualDiffResult(candidate, authorizedEditablePaths)).filter(Boolean);
}

export function extractApplyResult(rawText, allowedFailedIds = null) {
  const parsed = parseJsonTaggedContent(rawText, "apply_result_json");
  const allowedIds = allowedFailedIds ? new Set(allowedFailedIds) : null;
  const failedConceptualDiffIds = Array.isArray(parsed?.failedConceptualDiffIds)
    ? parsed.failedConceptualDiffIds.filter((id) => typeof id === "string" && (!allowedIds || allowedIds.has(id)))
    : [];
  return {
    failedConceptualDiffIds,
    notice: typeof parsed?.notice === "string" && parsed.notice.trim() ? parsed.notice.trim().slice(0, 1200) : "",
    valid: Boolean(parsed && typeof parsed === "object" && !Array.isArray(parsed)),
  };
}

function proposalNotice(conceptualDiffs) {
  if (!conceptualDiffs.length) return "No proposed changes were generated.";
  return `Generated ${conceptualDiffs.length} proposed change${conceptualDiffs.length === 1 ? "" : "s"}.`;
}

function groupDiffsByFile(conceptualDiffs) {
  const groups = new Map();
  conceptualDiffs.forEach((diff) => {
    const list = groups.get(diff.filePath) ?? [];
    list.push(diff);
    groups.set(diff.filePath, list);
  });
  return [...groups.entries()].map(([filePath, diffs]) => ({ filePath, diffs }));
}

function normalizeGitDiffTextResult(value) {
  if (value && typeof value === "object") {
    return {
      diff: typeof value.diff === "string" ? value.diff : "",
      ...(typeof value.diffError === "string" && value.diffError ? { diffError: value.diffError } : {}),
    };
  }

  return { diff: typeof value === "string" ? value : "" };
}

async function readScopedFilePayload({ project, readTextFile, gitFileDiffText, conversation }) {
  const aiEditableFiles = uniqueByPath(conversation.fileContext?.ai_editable_files ?? [], maxAiEditableFiles);
  const contextFiles = uniqueByPath(conversation.fileContext?.context_files ?? [], maxContextFiles);
  const [aiEditableFileResults, contextFileResults] = await Promise.all([
    readAiEditableFiles({ project, readTextFile, aiEditableFiles }),
    readContextFiles({ project, readTextFile, contextFiles }),
  ]);
  const authorizedAiEditableFiles = aiEditableFileResults.filter((file) => !file.error && file.editable);
  const rejectedAiEditableFiles = aiEditableFileResults.filter((file) => file.error);
  const readableContextFiles = contextFileResults.filter((file) => !file.error);
  const diffPaths = uniqueByPath([...authorizedAiEditableFiles, ...readableContextFiles], maxAiEditableFiles + maxContextFiles);
  const gitDiffs = await Promise.all(
    diffPaths.map(async (file) => {
      const result = normalizeGitDiffTextResult(await gitFileDiffText(project.path, file.path));
      return {
        path: file.path,
        diff: trimForPrompt(result.diff),
        ...(result.diffError ? { diffError: result.diffError } : {}),
      };
    }),
  );

  return {
    authorizedAiEditableFiles,
    rejectedAiEditableFiles,
    contextFileResults,
    gitDiffs,
  };
}

function currentConversationMessages(conversation) {
  return conversation.messages.map(formatHistoryMessage);
}

async function createEditProposalPrompt({ project, conversation, readTextFile, gitFileDiffText }) {
  const payload = await readScopedFilePayload({ project, readTextFile, gitFileDiffText, conversation });
  const authorizedEditablePaths = new Set(payload.authorizedAiEditableFiles.map((file) => file.path));
  const hasUserMessages = conversation.messages.some((message) => message.role === "user" && String(message.content ?? "").trim());
  const hasScopedDiffs = payload.gitDiffs.some((entry) => entry.diff.trim());

  if (!payload.authorizedAiEditableFiles.length) {
    return {
      authorizedEditablePaths,
      guidance: "Add at least one AI Editable file before proposing edits.",
    };
  }

  if (!hasUserMessages && !hasScopedDiffs) {
    return {
      authorizedEditablePaths,
      guidance: noProposalGuidanceMessage,
    };
  }

  const promptPayload = {
    project: {
      slug: project.slug,
      root: project.path,
    },
    conversation: {
      id: conversation.id,
      messages: currentConversationMessages(conversation),
    },
    ai_editable_files: payload.authorizedAiEditableFiles,
    rejected_ai_editable_files: payload.rejectedAiEditableFiles,
    context_files: payload.contextFileResults,
    git_diffs: payload.gitDiffs,
  };

  return {
    authorizedEditablePaths,
    prompt: [
      "You are preparing Proposed Changes for a local kiss_ai research project.",
      "",
      "Rules:",
      "- Read only. Do not edit files, write logs, run modifying commands, or create artifacts.",
      "- Use only the current conversation messages, selected context files, selected AI Editable files, and scoped git diffs in the payload.",
      "- Propose changes only for paths listed in ai_editable_files.",
      "- Each proposed change must be conceptual and terse, not a low-level patch.",
      "- Group proposals per file using filePath.",
      "- Return only JSON wrapped in <edit_proposal_json> tags.",
      "- JSON shape: {\"conceptualDiffs\":[{\"filePath\":\"relative/path.md\",\"title\":\"short title\",\"summary\":\"terse conceptual change\"}]}",
      "",
      "Payload:",
      JSON.stringify(promptPayload, null, 2),
    ].join("\n"),
  };
}

async function createApplyProposalPrompt({ project, conversation, proposal, readTextFile, gitFileDiffText }) {
  const payload = await readScopedFilePayload({ project, readTextFile, gitFileDiffText, conversation });
  const allAcceptedConceptualDiffs = proposal.conceptualDiffs.filter((diff) => diff.status === "accepted");
  const rejectedConceptualDiffs = proposal.conceptualDiffs.filter((diff) => diff.status === "rejected");
  const acceptedPaths = new Set(allAcceptedConceptualDiffs.map((diff) => diff.filePath));
  const editablePaths = new Set(payload.authorizedAiEditableFiles.map((file) => file.path));
  const allowedEditPaths = [...acceptedPaths].filter((path) => editablePaths.has(path));
  const acceptedConceptualDiffs = allAcceptedConceptualDiffs.filter((diff) => allowedEditPaths.includes(diff.filePath));

  if (!acceptedConceptualDiffs.length || !allowedEditPaths.length) {
    return {
      prompt: null,
      notice: "No accepted proposed changes were available to apply.",
    };
  }

  const promptPayload = {
    project: {
      slug: project.slug,
      root: project.path,
    },
    conversation: {
      id: conversation.id,
      messages: currentConversationMessages(conversation),
    },
    approved_conceptual_diffs: acceptedConceptualDiffs,
    rejected_conceptual_diffs: rejectedConceptualDiffs,
    allowed_edit_paths: allowedEditPaths,
    ai_editable_files: payload.authorizedAiEditableFiles.filter((file) => allowedEditPaths.includes(file.path)),
    context_files: payload.contextFileResults,
    git_diffs: payload.gitDiffs,
  };

  return {
    approvedConceptualDiffIds: acceptedConceptualDiffs.map((diff) => diff.id),
    prompt: [
      "You are applying approved Proposed Changes for a local kiss_ai research project.",
      "",
      "Rules:",
      "- You may edit files directly on disk using surgical edits.",
      "- Edit only files listed in allowed_edit_paths.",
      "- Do not edit files that have no accepted conceptual diff.",
      "- Do not edit context files unless they are also listed in allowed_edit_paths.",
      "- Treat rejected_conceptual_diffs as explicit negative constraints.",
      "- Preserve the user's intent and keep edits scoped to the approved conceptual diffs.",
      "- Partial apply is allowed. If any approved conceptual diff cannot be applied, skip it and report it.",
      "- Stay inside the current project.",
      "- After editing, return JSON wrapped in <apply_result_json> tags.",
      "- JSON shape: {\"failedConceptualDiffIds\":[\"diff_id\"],\"notice\":\"short user-facing summary\"}",
      "",
      "Payload:",
      JSON.stringify(promptPayload, null, 2),
    ].join("\n"),
  };
}

export function extractFileEditProposals(rawText, conversation, authorizedEditablePaths = null) {
  const conversationEditableTargets = conversation.fileContext?.ai_editable_files?.length
    ? conversation.fileContext.ai_editable_files
    : conversation.messages.flatMap((message) => message.context?.ai_editable_files ?? []);
  const editableTargets = new Map(
    conversationEditableTargets
      .filter((file) => file?.path)
      .map((file) => [file.path, file]),
  );

  return allTagContent(rawText, "file_edit")
    .map((editText) => {
      const path = firstTagContent(editText, "path");
      const target = editableTargets.get(path);
      const proposedContent = firstTagContent(editText, "proposedContent", { trim: false });
      if (authorizedEditablePaths && !authorizedEditablePaths.has(path)) return null;
      if (!path || !target || !proposedContent) return null;

      return {
        path,
        summary: firstTagContent(editText, "summary") || `Proposed edit for ${path}.`,
        proposedContent,
        contentHashBefore: target.contentHash,
        draftStateBefore: target.draftState,
        ...(target.draftState === "unsaved" && typeof target.draftContent === "string"
          ? { draftContentHashBefore: hashText(target.draftContent) }
          : {}),
        status: "proposed",
      };
    })
    .filter(Boolean);
}

export function createChatAgentService({
  appendMessage,
  displayProjectName,
  editUserMessage,
  gitFileDiffText,
  httpError,
  listCursorModels,
  notifyConversation,
  pickRebuildModelId,
  projectAgentLock,
  readConversation,
  readProjectHarness,
  readTextFile,
  resolveCursorApiKey,
  runCursorAgent,
  writeConversation,
}) {
  function startAssistantGeneration({ project, conversationId, releaseProjectAgent, conversationWithUser, assistantMessageId, cursorApiKey, modelId }) {
    void (async () => {
      const assistantTextChunks = [];
      try {
        const { authorizedEditablePaths, prompt } = await createChatPrompt({
          project,
          conversation: conversationWithUser,
          displayProjectName,
          readProjectHarness,
          readTextFile,
        });

        await runCursorAgent({
          project,
          apiKey: cursorApiKey.apiKey,
          modelId,
          prompt,
          onEvent: async (event) => {
            if (event.type !== "assistant_delta" || !event.text) return;
            assistantTextChunks.push(event.text);
            notifyConversation(project.slug, conversationId, {
              type: "message_delta",
              conversationId,
              messageId: assistantMessageId,
              delta: event.text,
              updatedAt: nowIso(),
            });
          },
        });

        const assistantText = assistantTextChunks.join("");
        const fileEdits = extractFileEditProposals(assistantText, conversationWithUser, authorizedEditablePaths);
        const finalConversation = await appendMessage(project, conversationId, {
          id: assistantMessageId,
          role: "assistant",
          content: assistantText.trim() || "No assistant response was returned.",
          createdAt: nowIso(),
          modelId,
          status: "complete",
          metadata: {
            cursorApiKeySource: cursorApiKey.source,
            ...(fileEdits.length ? { fileEdits } : {}),
          },
        });
        const nextConversation =
          finalConversation.summary || !assistantText
            ? finalConversation
            : await writeConversation(project, {
                ...finalConversation,
                summary: summarizeAssistantText(assistantText),
                updatedAt: nowIso(),
              });
        const message = nextConversation.messages.find((candidate) => candidate.id === assistantMessageId) ?? nextConversation.messages.at(-1);

        notifyConversation(project.slug, conversationId, {
          type: "message_complete",
          conversation: nextConversation,
          message,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Chat failed.";
        try {
          const finalConversation = await appendMessage(project, conversationId, {
            id: assistantMessageId,
            role: "assistant",
            content: errorMessage,
            createdAt: nowIso(),
            modelId,
            status: "error",
          });
          notifyConversation(project.slug, conversationId, {
            type: "message_complete",
            conversation: finalConversation,
            message: finalConversation.messages.at(-1),
          });
        } catch {
          notifyConversation(project.slug, conversationId, {
            type: "error",
            conversationId,
            message: errorMessage,
            updatedAt: nowIso(),
          });
        }
      } finally {
        releaseProjectAgent();
      }
    })();
  }

  async function prepareAgentRun(project, requestedModelId, label) {
    const releaseProjectAgent = projectAgentLock.acquire(project, label);
    try {
      const cursorApiKey = await resolveCursorApiKey();
      if (!cursorApiKey.available) {
        throw httpError("No Cursor API key found. Chat is unavailable from the UI.", 503, "cursor_api_key_unavailable");
      }

      const models = await listCursorModels(cursorApiKey.apiKey);
      if (!models.length) {
        throw httpError("No Cursor models are available for chat.", 503, "cursor_models_unavailable");
      }

      const modelId = pickRebuildModelId(models, requestedModelId);
      return { cursorApiKey, modelId, releaseProjectAgent };
    } catch (error) {
      releaseProjectAgent();
      throw error;
    }
  }

  async function sendChatMessage(project, conversationId, body) {
    const request = requireSendRequest(body, httpError);
    const { cursorApiKey, modelId, releaseProjectAgent } = await prepareAgentRun(project, request.modelId, "chat");

    const userMessage = {
      id: createMessageId(),
      role: "user",
      content: request.content,
      createdAt: nowIso(),
      modelId: null,
      status: "complete",
      context: request.context,
    };
    const assistantMessageId = createMessageId();

    try {
      const conversationWithUser = await appendMessage(project, conversationId, userMessage);
      notifyConversation(project.slug, conversationId, { type: "snapshot", conversation: conversationWithUser });
      startAssistantGeneration({ project, conversationId, releaseProjectAgent, conversationWithUser, assistantMessageId, cursorApiKey, modelId });

      return conversationWithUser;
    } catch (error) {
      releaseProjectAgent();
      throw error;
    }
  }

  async function editChatMessage(project, conversationId, messageId, body) {
    const request = requireEditRequest(body, httpError);
    const { cursorApiKey, modelId, releaseProjectAgent } = await prepareAgentRun(project, request.modelId, "chat");
    const assistantMessageId = createMessageId();

    try {
      const conversationWithUser = await editUserMessage(project, conversationId, messageId, request.content);
      notifyConversation(project.slug, conversationId, { type: "snapshot", conversation: conversationWithUser });
      startAssistantGeneration({ project, conversationId, releaseProjectAgent, conversationWithUser, assistantMessageId, cursorApiKey, modelId });

      return conversationWithUser;
    } catch (error) {
      releaseProjectAgent();
      throw error;
    }
  }

  async function generateEditProposal(project, conversationId, body) {
    const requestedModelId = String(body?.modelId ?? "").trim();
    if (!requestedModelId) throw httpError("Edit proposals require a model.");

    const { cursorApiKey, modelId, releaseProjectAgent } = await prepareAgentRun(project, requestedModelId, "edit_proposal");
    try {
      const conversation = await readConversation(project, conversationId);
      const userMessage = userMessageFromProposalRequest(body);
      const conversationWithUser = userMessage ? await appendMessage(project, conversationId, userMessage) : conversation;
      const conversationWithContext = await writeConversation(project, {
        ...conversationWithUser,
        fileContext: body.fileContext ?? conversation.fileContext,
        updatedAt: nowIso(),
      });
      const { authorizedEditablePaths, guidance, prompt } = await createEditProposalPrompt({
        project,
        conversation: conversationWithContext,
        gitFileDiffText,
        readTextFile,
      });

      if (guidance) {
        const withGuidance = await appendMessage(project, conversationId, {
          id: createMessageId(),
          role: "assistant",
          content: guidance,
          createdAt: nowIso(),
          modelId,
          status: "complete",
        });
        notifyConversation(project.slug, conversationId, { type: "snapshot", conversation: withGuidance });
        return withGuidance;
      }

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

      const conceptualDiffs = extractConceptualDiffs(assistantText, authorizedEditablePaths);
      const timestamp = nowIso();
      const proposal = {
        id: createProposalId(),
        ...(userMessage?.id ? { sourceMessageId: userMessage.id } : {}),
        status: conceptualDiffs.length ? "proposed" : "failed",
        createdAt: timestamp,
        updatedAt: timestamp,
        conceptualDiffs,
        notice: proposalNotice(conceptualDiffs),
      };
      const nextConversation = await writeConversation(project, {
        ...conversationWithContext,
        editProposals: [...(conversationWithContext.editProposals ?? []), proposal],
        updatedAt: timestamp,
      });
      notifyConversation(project.slug, conversationId, { type: "snapshot", conversation: nextConversation });
      return nextConversation;
    } finally {
      releaseProjectAgent();
    }
  }

  async function updateEditProposal(project, conversationId, proposalId, body) {
    const conversation = await readConversation(project, conversationId);
    const updates = new Map((body?.conceptualDiffs ?? []).map((diff) => [diff.id, diff.status]));
    const timestamp = nowIso();
    let foundProposal = false;
    const editProposals = (conversation.editProposals ?? []).map((proposal) => {
      if (proposal.id !== proposalId) return proposal;
      foundProposal = true;
      return {
        ...proposal,
        updatedAt: timestamp,
        conceptualDiffs: proposal.conceptualDiffs.map((diff) => ({
          ...diff,
          status: updates.get(diff.id) === "rejected" ? "rejected" : updates.get(diff.id) === "accepted" ? "accepted" : diff.status,
        })),
      };
    });

    if (!foundProposal) throw httpError("Edit proposal not found.", 404, "edit_proposal_not_found");

    const nextConversation = await writeConversation(project, {
      ...conversation,
      editProposals,
      updatedAt: timestamp,
    });
    notifyConversation(project.slug, conversationId, { type: "snapshot", conversation: nextConversation });
    return nextConversation;
  }

  async function applyEditProposal(project, conversationId, proposalId, body) {
    const requestedModelId = String(body?.modelId ?? "").trim();
    if (!requestedModelId) throw httpError("Applying a proposal requires a model.");

    const { cursorApiKey, modelId, releaseProjectAgent } = await prepareAgentRun(project, requestedModelId, "edit_proposal_apply");
    try {
      const conversation = await readConversation(project, conversationId);
      const proposal = (conversation.editProposals ?? []).find((candidate) => candidate.id === proposalId);
      if (!proposal) throw httpError("Edit proposal not found.", 404, "edit_proposal_not_found");

      const applyingAt = nowIso();
      const applyingConversation = await writeConversation(project, {
        ...conversation,
        editProposals: conversation.editProposals.map((candidate) =>
          candidate.id === proposalId ? { ...candidate, status: "applying", updatedAt: applyingAt, appliedAt: undefined } : candidate,
        ),
        updatedAt: applyingAt,
      });
      notifyConversation(project.slug, conversationId, { type: "snapshot", conversation: applyingConversation });

      const applyingProposal = applyingConversation.editProposals.find((candidate) => candidate.id === proposalId);
      const { approvedConceptualDiffIds = [], prompt, notice } = await createApplyProposalPrompt({
        project,
        conversation: applyingConversation,
        gitFileDiffText,
        proposal: applyingProposal,
        readTextFile,
      });

      if (!prompt) {
        const failedAt = nowIso();
        const failedConversation = await writeConversation(project, {
          ...applyingConversation,
          editProposals: applyingConversation.editProposals.map((candidate) =>
            candidate.id === proposalId ? { ...candidate, status: "failed", notice, updatedAt: failedAt, appliedAt: undefined } : candidate,
          ),
          updatedAt: failedAt,
        });
        notifyConversation(project.slug, conversationId, { type: "snapshot", conversation: failedConversation });
        return failedConversation;
      }

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

      const applyResult = extractApplyResult(assistantText, approvedConceptualDiffIds);
      const completedAt = nowIso();
      const status = !applyResult.valid ? "failed" : applyResult.failedConceptualDiffIds.length ? "partial" : "applied";
      const completedConversation = await writeConversation(project, {
        ...applyingConversation,
        editProposals: applyingConversation.editProposals.map((candidate) =>
          candidate.id === proposalId
            ? {
                ...candidate,
                status,
                notice:
                  applyResult.notice ||
                  (status === "applied"
                    ? "Applied the approved proposed changes."
                    : status === "partial"
                      ? "Applied some approved proposed changes. Some items need review."
                      : "The apply run did not return a valid result summary. Review the files before trying again."),
                updatedAt: completedAt,
                appliedAt: status === "applied" || status === "partial" ? completedAt : undefined,
              }
            : candidate,
        ),
        updatedAt: completedAt,
      });
      notifyConversation(project.slug, conversationId, { type: "snapshot", conversation: completedConversation });
      return completedConversation;
    } catch (error) {
      try {
        const conversation = await readConversation(project, conversationId);
        const failedAt = nowIso();
        const failedConversation = await writeConversation(project, {
          ...conversation,
          editProposals: (conversation.editProposals ?? []).map((candidate) =>
            candidate.id === proposalId
              ? {
                  ...candidate,
                  status: "failed",
                  notice: error instanceof Error ? error.message : "Could not apply the proposal.",
                  updatedAt: failedAt,
                  appliedAt: undefined,
                }
              : candidate,
          ),
          updatedAt: failedAt,
        });
        notifyConversation(project.slug, conversationId, { type: "snapshot", conversation: failedConversation });
        return failedConversation;
      } catch {
        throw error;
      }
    } finally {
      releaseProjectAgent();
    }
  }

  return { applyEditProposal, editChatMessage, generateEditProposal, sendChatMessage, updateEditProposal };
}
