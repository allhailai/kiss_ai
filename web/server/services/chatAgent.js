import { randomUUID } from "node:crypto";

const maxPromptFileBytes = 24 * 1024;
const maxPromptHistoryMessages = 40;
const maxUserMessageBytes = 120 * 1024;

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

function requireSendRequest(body, httpError) {
  const modelId = String(body?.modelId ?? "").trim();
  const content = String(body?.content ?? "").trim();
  const contextSource = body?.context && typeof body.context === "object" && !Array.isArray(body.context) ? body.context : {};
  const fileRefs = Array.isArray(contextSource.fileRefs) ? contextSource.fileRefs.map(normalizeContextRef).filter(Boolean).slice(0, 20) : [];

  if (!modelId) throw httpError("Chat requires a model.");
  if (!content) throw httpError("Chat requires a message.");
  if (Buffer.byteLength(content, "utf8") > maxUserMessageBytes) {
    throw httpError("Chat message is too large.", 413, "chat_message_too_large");
  }

  return {
    modelId,
    content,
    context: fileRefs.length ? { fileRefs } : undefined,
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

async function readContextFiles({ project, readTextFile, fileRefs }) {
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
        kind: file.kind,
        contentHash: file.contentHash,
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

async function createChatPrompt({ project, conversation, readTextFile, displayProjectName, readProjectHarness }) {
  const [harness, goal, inputs, outputs, openQuestions] = await Promise.all([
    readProjectHarness(project.path),
    readOptionalProjectText(readTextFile, project.path, "human_goal_requirements.md"),
    readOptionalProjectText(readTextFile, project.path, "human_input_requirements.md"),
    readOptionalProjectText(readTextFile, project.path, "human_output_requirements.md"),
    readOptionalProjectText(readTextFile, project.path, "human_open_questions.md"),
  ]);
  const fileRefs = conversation.messages.flatMap((message) => message.context?.fileRefs ?? []);
  const uniqueFileRefs = [...new Map(fileRefs.map((ref) => [ref.path, ref])).values()].slice(-20);
  const contextFiles = await readContextFiles({ project, readTextFile, fileRefs: uniqueFileRefs });
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
    explicitContextFiles: contextFiles,
  };

  return [
    "You are the project chat assistant for a local kiss_ai research project.",
    "",
    "Rules:",
    "- Answer the user's latest message using only this conversation and the supplied project context.",
    "- Treat a new conversation as fresh context; do not assume access to previous conversations.",
    "- You may discuss suggested changes, but do not edit files, run modifying commands, write logs, or create artifacts.",
    "- Stay inside the current project. Relevant user/project files are limited to human_*.md, inputs_human/, inputs_ai/, and outputs_ai/.",
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
