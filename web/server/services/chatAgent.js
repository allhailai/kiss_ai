import { createHash, randomUUID } from "node:crypto";
import { MAX_USER_MESSAGE_BYTES } from "../contracts/chatLimits.js";
import { normalizeChatContext } from "./chatContext.js";

const maxPromptFileBytes = 24 * 1024;
const maxPromptHistoryMessages = 40;
const maxContextRefs = 20;
const maxActiveFiles = 10;

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

function uniqueByPath(refs, limit) {
  return [...new Map(refs.filter((ref) => ref?.path).map((ref) => [ref.path, ref])).values()].slice(-limit);
}

async function readSourceContextFiles({ project, readTextFile, fileRefs }) {
  return await Promise.all(fileRefs.map(async (ref) => {
    try {
      const file = await readTextFile(project.path, ref.path);
      if (!/^human_[^/]+\.md$/i.test(file.path) && !file.path.startsWith("inputs_human/") && !file.path.startsWith("inputs_ai/") && !file.path.startsWith("outputs_ai/")) {
        return {
          path: ref.path,
          error: "This path is outside the chat context allowlist.",
        };
      }

      return {
        path: file.path,
        label: ref.label || file.path,
        kind: file.kind,
        contentHash: file.contentHash,
        intent: "source",
        content: trimForPrompt(file.content),
      };
    } catch (error) {
      return {
        path: ref.path,
        error: error instanceof Error ? error.message : "Could not read file context.",
      };
    }
  }));
}

async function readActiveContextFiles({ project, readTextFile, activeFiles }) {
  return await Promise.all(activeFiles.map(async (ref) => {
    try {
      const file = await readTextFile(project.path, ref.path);
      if (!file.editable) {
        return {
          path: file.path,
          label: ref.label || file.path,
          intent: "editable_target",
          error: "This path is not editable in the lab UI.",
        };
      }

      const expectedHash = typeof ref.contentHash === "string" && ref.contentHash ? ref.contentHash : null;
      const hasUnsavedDraft = ref.draftState === "unsaved" && typeof ref.draftContent === "string";
      return {
        path: file.path,
        label: ref.label || file.path,
        kind: file.kind,
        editable: file.editable,
        annotation: file.annotation,
        expectedContentHash: expectedHash,
        contentHash: file.contentHash,
        hashStatus: expectedHash ? (expectedHash === file.contentHash ? "matched" : "changed") : "missing_hash",
        draftState: ref.draftState ?? "unknown",
        role: ref.role ?? "secondary",
        intent: "editable_target",
        contentSource: hasUnsavedDraft ? "unsaved_draft" : "saved_file",
        content: trimForPrompt(hasUnsavedDraft ? ref.draftContent : file.content),
      };
    } catch (error) {
      return {
        path: ref.path,
        label: ref.label || ref.path,
        intent: "editable_target",
        error: error instanceof Error ? error.message : "Could not read active file context.",
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
  const activeFiles = conversation.messages.flatMap((message) => message.context?.editableFiles ?? message.context?.activeFiles ?? []);
  const fileRefs = conversation.messages.flatMap((message) => message.context?.sourceFiles ?? message.context?.fileRefs ?? []);
  const uniqueEditableFiles = uniqueByPath(activeFiles, maxActiveFiles);
  const uniqueSourceFiles = uniqueByPath(fileRefs, maxContextRefs);
  const [currentFileContext, editableTargetFileResults, sourceContextFiles] = await Promise.all([
    readCurrentFileContext({ project, readTextFile, currentFile }),
    readActiveContextFiles({ project, readTextFile, activeFiles: uniqueEditableFiles }),
    readSourceContextFiles({ project, readTextFile, fileRefs: uniqueSourceFiles }),
  ]);
  const editableTargetFiles = editableTargetFileResults.filter((file) => !file.error && file.editable);
  const rejectedEditableTargetFiles = editableTargetFileResults.filter((file) => file.error);
  const authorizedEditablePaths = new Set(editableTargetFiles.map((file) => file.path));
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
    editableTargetFiles,
    rejectedEditableTargetFiles,
    sourceContextFiles,
  };

  const prompt = [
    "You are the project chat assistant for a local kiss_ai research project.",
    "",
    "Rules:",
    "- Answer the user's latest message using this conversation and supplied project context first.",
    "- Treat a new conversation as fresh context; do not assume access to previous conversations.",
    "- Treat currentFileContext as read-only context for the file the user is viewing. It does not grant edit permission.",
    "- Context entries with contentSource=unsaved_draft reflect the user's current unsaved editor draft and should be treated as newer than saved file content.",
    "- You may propose or prepare updates for files listed in editableTargetFiles; base proposals on the provided content field, do not directly edit files, run modifying commands, write logs, or create artifacts.",
    "- Treat sourceContextFiles as read-only sources to consider. Do not treat them as editable targets unless the same path also appears in editableTargetFiles.",
    "- When the user asks for file changes, propose edits only for editableTargetFiles and keep the response proposal-only.",
    "- For each proposed file edit, include a tagged block: <file_edit><path>relative/path.md</path><summary>short summary</summary><proposedContent>full replacement file content</proposedContent></file_edit>.",
    "- The web UI may apply tagged file_edit proposals to the unsaved editor draft. Never write files directly.",
    "- User-selected sourceContextFiles are the only ad hoc file contents included beyond the standard requirement files in the project payload.",
    "- If needed context is missing from currentFileContext, editableTargetFiles, sourceContextFiles, or the standard requirement files, say what is missing.",
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

export function extractFileEditProposals(rawText, conversation, authorizedEditablePaths = null) {
  const editableTargets = new Map(
    conversation.messages
      .flatMap((message) => message.context?.editableFiles ?? message.context?.activeFiles ?? [])
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
  httpError,
  listCursorModels,
  notifyConversation,
  pickRebuildModelId,
  readConversation,
  readProjectHarness,
  readTextFile,
  resolveCursorApiKey,
  runCursorAgent,
  writeConversation,
}) {
  const activeChats = new Set();

  function activeChatKey(project, conversationId) {
    return `${project.slug}:${conversationId}`;
  }

  function startAssistantGeneration({ project, conversationId, key, conversationWithUser, assistantMessageId, cursorApiKey, modelId }) {
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
        activeChats.delete(key);
      }
    })();
  }

  async function prepareChatRun(project, conversationId, requestedModelId) {
    const key = activeChatKey(project, conversationId);

    if (activeChats.has(key)) {
      throw httpError("This conversation already has a message in progress.", 409, "chat_already_running");
    }

    const cursorApiKey = await resolveCursorApiKey();
    if (!cursorApiKey.available) {
      throw httpError("No Cursor API key found. Chat is unavailable from the UI.", 503, "cursor_api_key_unavailable");
    }

    const models = await listCursorModels(cursorApiKey.apiKey);
    if (!models.length) {
      throw httpError("No Cursor models are available for chat.", 503, "cursor_models_unavailable");
    }

    const modelId = pickRebuildModelId(models, requestedModelId);
    activeChats.add(key);
    return { cursorApiKey, key, modelId };
  }

  async function sendChatMessage(project, conversationId, body) {
    const request = requireSendRequest(body, httpError);
    const { cursorApiKey, key, modelId } = await prepareChatRun(project, conversationId, request.modelId);

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
      startAssistantGeneration({ project, conversationId, key, conversationWithUser, assistantMessageId, cursorApiKey, modelId });

      return conversationWithUser;
    } catch (error) {
      activeChats.delete(key);
      throw error;
    }
  }

  async function editChatMessage(project, conversationId, messageId, body) {
    const request = requireEditRequest(body, httpError);
    const { cursorApiKey, key, modelId } = await prepareChatRun(project, conversationId, request.modelId);
    const assistantMessageId = createMessageId();

    try {
      const conversationWithUser = await editUserMessage(project, conversationId, messageId, request.content);
      notifyConversation(project.slug, conversationId, { type: "snapshot", conversation: conversationWithUser });
      startAssistantGeneration({ project, conversationId, key, conversationWithUser, assistantMessageId, cursorApiKey, modelId });

      return conversationWithUser;
    } catch (error) {
      activeChats.delete(key);
      throw error;
    }
  }

  return { editChatMessage, sendChatMessage };
}
