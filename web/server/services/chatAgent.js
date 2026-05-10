import { randomUUID } from "node:crypto";

const maxPromptFileBytes = 24 * 1024;
const maxPromptHistoryMessages = 40;
const maxUserMessageBytes = 120 * 1024;
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

function normalizeContextRef(value) {
  const source = value && typeof value === "object" ? value : {};
  const filePath = String(source.path ?? "").trim();
  if (!filePath) return null;
  return {
    path: filePath,
    label: typeof source.label === "string" ? source.label.trim() : "",
    kind: typeof source.kind === "string" ? source.kind.trim() : "",
  };
}

function normalizeActiveFile(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const filePath = String(source.path ?? "").trim();
  if (!filePath) return null;
  return {
    path: filePath,
    label: typeof source.label === "string" ? source.label.trim() : undefined,
    kind: typeof source.kind === "string" ? source.kind.trim() : undefined,
    editable: typeof source.editable === "boolean" ? source.editable : undefined,
    annotation: typeof source.annotation === "boolean" ? source.annotation : undefined,
    contentHash: typeof source.contentHash === "string" ? source.contentHash.trim() : undefined,
    draftState: ["saved", "unsaved", "unknown"].includes(source.draftState) ? source.draftState : "unknown",
    role: source.role === "primary" || source.role === "secondary" ? source.role : undefined,
  };
}

function requireSendRequest(body, httpError) {
  const modelId = String(body?.modelId ?? "").trim();
  const content = String(body?.content ?? "").trim();
  const contextSource = body?.context && typeof body.context === "object" && !Array.isArray(body.context) ? body.context : {};
  const activeFiles = Array.isArray(contextSource.activeFiles) ? contextSource.activeFiles.map(normalizeActiveFile).filter(Boolean).slice(0, maxActiveFiles) : [];
  const fileRefs = Array.isArray(contextSource.fileRefs) ? contextSource.fileRefs.map(normalizeContextRef).filter(Boolean).slice(0, maxContextRefs) : [];

  if (!modelId) throw httpError("Chat requires a model.");
  if (!content) throw httpError("Chat requires a message.");
  if (Buffer.byteLength(content, "utf8") > maxUserMessageBytes) {
    throw httpError("Chat message is too large.", 413, "chat_message_too_large");
  }

  return {
    modelId,
    content,
    context: activeFiles.length || fileRefs.length ? { activeFiles, fileRefs } : undefined,
  };
}

function requireEditRequest(body, httpError) {
  const modelId = String(body?.modelId ?? "").trim();
  const content = String(body?.content ?? "").trim();

  if (!content) throw httpError("Chat requires a message.");
  if (Buffer.byteLength(content, "utf8") > maxUserMessageBytes) {
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
      const expectedHash = typeof ref.contentHash === "string" && ref.contentHash ? ref.contentHash : null;
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
        content: trimForPrompt(file.content),
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

async function createChatPrompt({ project, conversation, readTextFile, displayProjectName, readProjectHarness }) {
  const [harness, goal, inputs, outputs, openQuestions] = await Promise.all([
    readProjectHarness(project.path),
    readOptionalProjectText(readTextFile, project.path, "human_goal_requirements.md"),
    readOptionalProjectText(readTextFile, project.path, "human_input_requirements.md"),
    readOptionalProjectText(readTextFile, project.path, "human_output_requirements.md"),
    readOptionalProjectText(readTextFile, project.path, "human_open_questions.md"),
  ]);
  const activeFiles = conversation.messages.flatMap((message) => message.context?.activeFiles ?? []);
  const fileRefs = conversation.messages.flatMap((message) => message.context?.fileRefs ?? []);
  const uniqueActiveFiles = uniqueByPath(activeFiles, maxActiveFiles);
  const uniqueFileRefs = uniqueByPath(fileRefs, maxContextRefs);
  const [editableTargetFiles, sourceContextFiles] = await Promise.all([
    readActiveContextFiles({ project, readTextFile, activeFiles: uniqueActiveFiles }),
    readSourceContextFiles({ project, readTextFile, fileRefs: uniqueFileRefs }),
  ]);
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
    editableTargetFiles,
    sourceContextFiles,
  };

  return [
    "You are the project chat assistant for a local kiss_ai research project.",
    "",
    "Rules:",
    "- Answer the user's latest message using only this conversation and the supplied project context.",
    "- Treat a new conversation as fresh context; do not assume access to previous conversations.",
    "- You may propose or prepare updates for files listed in editableTargetFiles; do not directly edit files, run modifying commands, write logs, or create artifacts.",
    "- Treat sourceContextFiles as read-only sources to consider. Do not treat them as editable targets unless the same path also appears in editableTargetFiles.",
    "- Stay inside the current project. Source context files are limited to human_*.md, inputs_human/, inputs_ai/, and outputs_ai/.",
    "- Do not expose hidden chain-of-thought. Provide concise reasoning summaries when useful.",
    "- If context is missing, say what is missing and suggest the next best step.",
    "",
    conversationSummaryText(conversation),
    "",
    "Project and conversation payload:",
    JSON.stringify(payload, null, 2),
  ].join("\n");
}

function summarizeAssistantText(text) {
  const compact = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!compact) return "";
  return compact.length > 240 ? `${compact.slice(0, 237)}...` : compact;
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
        const prompt = await createChatPrompt({
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
        const finalConversation = await appendMessage(project, conversationId, {
          id: assistantMessageId,
          role: "assistant",
          content: assistantText.trim() || "No assistant response was returned.",
          createdAt: nowIso(),
          modelId,
          status: "complete",
          metadata: { cursorApiKeySource: cursorApiKey.source },
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
