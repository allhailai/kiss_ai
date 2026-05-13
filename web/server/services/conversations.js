import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { MAX_STORED_MESSAGE_BYTES } from "../contracts/chatLimits.js";
import { normalizeChatContext, normalizeConversationFileContext } from "./chatContext.js";

const conversationVersion = 1;
const conversationIdPattern = /^[a-zA-Z0-9_-]+$/;
const maxTitleLength = 120;
const maxSummaryLength = 500;
const staleStreamingMessageMs = 10 * 60 * 1000;
const maxEditProposals = 20;
const maxConceptualDiffs = 100;

function nowIso() {
  return new Date().toISOString();
}

function createId(prefix) {
  return `${prefix}_${randomUUID().replaceAll("-", "").slice(0, 18)}`;
}

function datestamp(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}_${month}_${day}`;
}

function trimText(value, maxLength) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function optionalText(value, maxLength) {
  const text = trimText(value, maxLength);
  return text || "";
}

function normalizeStringList(value, maxItems = 8, maxLength = 240) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => optionalText(item, maxLength)).filter(Boolean).slice(0, maxItems);
}

function normalizeConceptualDiffScope(value) {
  return ["local", "section", "multi_section", "document"].includes(value) ? value : "";
}

function normalizeConceptualDiffTarget(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const sections = normalizeStringList(source.sections);
  const anchors = normalizeStringList(source.anchors);
  const explicitScope = normalizeConceptualDiffScope(source.scope);
  const inferredScope = sections.length > 1 ? "multi_section" : sections.length ? "section" : anchors.length ? "local" : "";
  const scope = explicitScope || inferredScope;

  if (!scope) return null;

  return {
    scope,
    ...(sections.length ? { sections } : {}),
    ...(anchors.length ? { anchors } : {}),
  };
}

function normalizeConceptualDiffIntent(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const objective = optionalText(source.objective, 800);
  if (!objective) return null;

  const rationale = optionalText(source.rationale, 800);
  const mustPreserve = normalizeStringList(source.mustPreserve, 8, 260);
  const avoid = normalizeStringList(source.avoid, 8, 260);

  return {
    objective,
    ...(rationale ? { rationale } : {}),
    ...(mustPreserve.length ? { mustPreserve } : {}),
    ...(avoid.length ? { avoid } : {}),
  };
}

function normalizeConceptualDiffEvidence(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const userGuidance = normalizeStringList(source.userGuidance, 6, 260);
  const gitDiffSignals = normalizeStringList(source.gitDiffSignals, 6, 260);
  const contextSignals = normalizeStringList(source.contextSignals, 6, 260);

  if (!userGuidance.length && !gitDiffSignals.length && !contextSignals.length) return null;

  return {
    ...(userGuidance.length ? { userGuidance } : {}),
    ...(gitDiffSignals.length ? { gitDiffSignals } : {}),
    ...(contextSignals.length ? { contextSignals } : {}),
  };
}

function normalizeConceptualDiffApplyNotes(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const expectedChangeShape = optionalText(source.expectedChangeShape, 600);
  const nonGoals = normalizeStringList(source.nonGoals, 8, 260);
  const riskLevel = ["low", "medium", "high"].includes(source.riskLevel) ? source.riskLevel : "";

  if (!expectedChangeShape && !nonGoals.length && !riskLevel) return null;

  return {
    ...(expectedChangeShape ? { expectedChangeShape } : {}),
    ...(nonGoals.length ? { nonGoals } : {}),
    ...(riskLevel ? { riskLevel } : {}),
  };
}

function titleFromContent(content) {
  const firstLine = String(content ?? "")
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);
  if (!firstLine) return "New conversation";
  return firstLine.length > 72 ? `${firstLine.slice(0, 69)}...` : firstLine;
}

function normalizeMessage(value, fallback = {}) {
  const source = value && typeof value === "object" ? value : {};
  const createdAt = typeof source.createdAt === "string" ? source.createdAt : fallback.createdAt ?? nowIso();
  const updatedAt = typeof source.updatedAt === "string" ? source.updatedAt : source.status === "streaming" ? nowIso() : null;
  const role = ["user", "assistant", "system"].includes(source.role) ? source.role : fallback.role ?? "assistant";
  let status = ["complete", "streaming", "error"].includes(source.status) ? source.status : fallback.status ?? "complete";
  const content = typeof source.content === "string" ? source.content : "";
  const metadata = source.metadata && typeof source.metadata === "object" && !Array.isArray(source.metadata) ? source.metadata : {};
  const streamingTimestamp = Date.parse(source.updatedAt ?? source.createdAt ?? createdAt);
  const isStaleStreamingMessage = status === "streaming" && Number.isFinite(streamingTimestamp) && Date.now() - streamingTimestamp > staleStreamingMessageMs;

  if (isStaleStreamingMessage) {
    status = "error";
  }

  return {
    id: typeof source.id === "string" && source.id.trim() ? source.id : createId("msg"),
    role,
    content: isStaleStreamingMessage
      ? `${content.trim()}\n\n[Chat generation was interrupted before completion. Start a new message to continue.]`.trim()
      : content,
    createdAt,
    updatedAt,
    modelId: typeof source.modelId === "string" && source.modelId.trim() ? source.modelId.trim() : null,
    status,
    context: normalizeChatContext(source.context, { maxDraftContentLength: MAX_STORED_MESSAGE_BYTES }),
    metadata,
  };
}

function normalizeConceptualDiff(value) {
  const source = value && typeof value === "object" ? value : {};
  const id = typeof source.id === "string" && source.id.trim() ? source.id.trim().slice(0, 80) : createId("diff");
  const filePath = trimText(source.filePath, 300);
  const title = trimText(source.title, 160);
  const summary = trimText(source.summary, 1200);
  const status = source.status === "rejected" ? "rejected" : "accepted";
  const target = normalizeConceptualDiffTarget(source.target);
  const intent = normalizeConceptualDiffIntent(source.intent);
  const evidence = normalizeConceptualDiffEvidence(source.evidence);
  const applyNotes = normalizeConceptualDiffApplyNotes(source.applyNotes);

  if (!filePath || !title || !summary) return null;

  return {
    id,
    filePath,
    title,
    summary,
    status,
    ...(target ? { target } : {}),
    ...(intent ? { intent } : {}),
    ...(evidence ? { evidence } : {}),
    ...(applyNotes ? { applyNotes } : {}),
  };
}

function normalizeEditProposal(value) {
  const source = value && typeof value === "object" ? value : {};
  const id = typeof source.id === "string" && source.id.trim() ? source.id.trim().slice(0, 80) : createId("proposal");
  const timestamp = nowIso();
  const status = ["proposed", "applying", "applied", "partial", "failed"].includes(source.status) ? source.status : "proposed";
  const conceptualDiffs = Array.isArray(source.conceptualDiffs)
    ? source.conceptualDiffs.map(normalizeConceptualDiff).filter(Boolean).slice(0, maxConceptualDiffs)
    : [];

  return {
    id,
    ...(typeof source.sourceMessageId === "string" && source.sourceMessageId.trim() ? { sourceMessageId: source.sourceMessageId.trim().slice(0, 80) } : {}),
    status,
    createdAt: typeof source.createdAt === "string" ? source.createdAt : timestamp,
    updatedAt: typeof source.updatedAt === "string" ? source.updatedAt : timestamp,
    ...(typeof source.appliedAt === "string" && source.appliedAt.trim() ? { appliedAt: source.appliedAt } : {}),
    conceptualDiffs,
    ...(typeof source.notice === "string" && source.notice.trim() ? { notice: trimText(source.notice, 1200) } : {}),
  };
}

function normalizeEditProposals(value) {
  return Array.isArray(value) ? value.map(normalizeEditProposal).filter(Boolean).slice(-maxEditProposals) : [];
}

function normalizeConversation(project, value, fallback = {}) {
  const source = value && typeof value === "object" ? value : {};
  const id = typeof source.id === "string" && conversationIdPattern.test(source.id) ? source.id : fallback.id;
  const timestamp = nowIso();
  const createdAt = typeof source.createdAt === "string" ? source.createdAt : fallback.createdAt ?? timestamp;
  const updatedAt = typeof source.updatedAt === "string" ? source.updatedAt : fallback.updatedAt ?? createdAt;
  const messages = Array.isArray(source.messages) ? source.messages.map(normalizeMessage) : [];

  return {
    version: conversationVersion,
    id,
    projectSlug: typeof source.projectSlug === "string" ? source.projectSlug : project.slug,
    title: trimText(source.title, maxTitleLength) || fallback.title || "New conversation",
    summary: trimText(source.summary, maxSummaryLength),
    createdAt,
    updatedAt,
    defaultModelId: typeof source.defaultModelId === "string" && source.defaultModelId.trim() ? source.defaultModelId.trim() : null,
    fileContext: normalizeConversationFileContext(source.fileContext, { maxDraftContentLength: MAX_STORED_MESSAGE_BYTES }),
    editProposals: normalizeEditProposals(source.editProposals),
    messages,
  };
}

function summaryFromConversation(conversation, file) {
  const lastModelMessage = [...conversation.messages].reverse().find((message) => message.modelId);
  return {
    id: conversation.id,
    file,
    title: conversation.title,
    summary: conversation.summary,
    modelId: conversation.defaultModelId ?? lastModelMessage?.modelId ?? null,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    messageCount: conversation.messages.length,
    archived: false,
  };
}

function normalizeIndexRecord(value) {
  const source = value && typeof value === "object" ? value : {};
  const id = typeof source.id === "string" && conversationIdPattern.test(source.id) ? source.id : "";
  const file = typeof source.file === "string" && source.file.startsWith("conversations/") && source.file.endsWith(".json") ? source.file : "";
  if (!id || !file) return null;

  return {
    id,
    file,
    title: trimText(source.title, maxTitleLength) || "New conversation",
    summary: trimText(source.summary, maxSummaryLength),
    modelId: typeof source.modelId === "string" && source.modelId.trim() ? source.modelId.trim() : null,
    createdAt: typeof source.createdAt === "string" ? source.createdAt : nowIso(),
    updatedAt: typeof source.updatedAt === "string" ? source.updatedAt : nowIso(),
    messageCount: Number.isFinite(source.messageCount) ? Math.max(0, Number(source.messageCount)) : 0,
    archived: Boolean(source.archived),
  };
}

function normalizeIndex(value) {
  const source = value && typeof value === "object" ? value : {};
  const conversations = Array.isArray(source.conversations) ? source.conversations.map(normalizeIndexRecord).filter(Boolean) : [];
  return {
    version: conversationVersion,
    conversations: conversations.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
  };
}

export function createConversationService({ httpError, projectPath }) {
  const subscribers = new Map();
  const mutationQueues = new Map();

  async function withProjectMutation(project, operation) {
    const key = project.slug ?? project.path;
    const previous = mutationQueues.get(key) ?? Promise.resolve();
    const queued = previous.catch(() => undefined).then(operation);
    mutationQueues.set(key, queued);

    try {
      return await queued;
    } finally {
      if (mutationQueues.get(key) === queued) {
        mutationQueues.delete(key);
      }
    }
  }

  function requireConversationId(conversationId) {
    const id = String(conversationId ?? "").trim();
    if (!conversationIdPattern.test(id)) {
      throw httpError("Invalid conversation id.", 400, "invalid_conversation_id");
    }
    return id;
  }

  function conversationFilePath(projectRoot, indexRecord) {
    const file = String(indexRecord?.file ?? "");
    if (!file.startsWith("conversations/") || !file.endsWith(".json") || file.includes("..")) {
      throw httpError("Invalid conversation file path.", 500, "invalid_conversation_file");
    }
    return projectPath(projectRoot, file);
  }

  async function readJsonFile(projectRoot, relativePath, fallback, errorCode) {
    const { absolute } = projectPath(projectRoot, relativePath);
    try {
      return JSON.parse(await fs.readFile(absolute, "utf8"));
    } catch (error) {
      if (error?.code === "ENOENT" && fallback !== undefined) return fallback;
      if (error instanceof SyntaxError) {
        throw httpError(`Could not parse ${relativePath}. Fix or remove the corrupt JSON file.`, 500, errorCode);
      }
      throw error;
    }
  }

  async function writeJsonAtomic(projectRoot, relativePath, value) {
    const { absolute } = projectPath(projectRoot, relativePath);
    await fs.mkdir(path.dirname(absolute), { recursive: true });
    const temporary = `${absolute}.${process.pid}.${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`;
    await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    await fs.rename(temporary, absolute);
  }

  async function readIndex(projectRoot) {
    return normalizeIndex(await readJsonFile(projectRoot, "conversations/conversations.json", { version: conversationVersion, conversations: [] }, "corrupt_conversation_index"));
  }

  async function writeIndex(projectRoot, index) {
    await writeJsonAtomic(projectRoot, "conversations/conversations.json", normalizeIndex(index));
  }

  function subscriberKey(projectSlug, conversationId) {
    return `${projectSlug}:${conversationId}`;
  }

  function notify(projectSlug, conversationId, event) {
    const key = subscriberKey(projectSlug, conversationId);
    const handlers = subscribers.get(key);
    if (!handlers?.size) return;
    for (const handler of handlers) handler(event);
  }

  function subscribe(projectSlug, conversationId, handler) {
    const id = requireConversationId(conversationId);
    const key = subscriberKey(projectSlug, id);
    const handlers = subscribers.get(key) ?? new Set();
    handlers.add(handler);
    subscribers.set(key, handlers);

    return () => {
      handlers.delete(handler);
      if (!handlers.size) subscribers.delete(key);
    };
  }

  async function listConversations(project) {
    const index = await readIndex(project.path);
    return { conversations: index.conversations };
  }

  async function readConversation(project, conversationId) {
    const id = requireConversationId(conversationId);
    const index = await readIndex(project.path);
    const record = index.conversations.find((candidate) => candidate.id === id);
    if (!record) throw httpError("Conversation not found.", 404, "conversation_not_found");

    const { relative } = conversationFilePath(project.path, record);
    const source = await readJsonFile(project.path, relative, undefined, "corrupt_conversation");
    return normalizeConversation(project, source, { id, title: record.title, createdAt: record.createdAt, updatedAt: record.updatedAt });
  }

  async function createConversationUnlocked(project, body = {}) {
    const id = createId("conv");
    const createdAt = nowIso();
    const file = `conversations/${datestamp()}_${id}.json`;
    const conversation = normalizeConversation(
      project,
      {
        id,
        title: trimText(body?.title, maxTitleLength) || "New conversation",
        summary: "",
        createdAt,
        updatedAt: createdAt,
        defaultModelId: trimText(body?.modelId, 160) || null,
        fileContext: normalizeConversationFileContext(body?.fileContext, { maxDraftContentLength: MAX_STORED_MESSAGE_BYTES }),
        messages: [],
      },
      { id, createdAt, updatedAt: createdAt },
    );
    const index = await readIndex(project.path);
    const conversations = [summaryFromConversation(conversation, file), ...index.conversations];

    await writeJsonAtomic(project.path, file, conversation);
    await writeIndex(project.path, { version: conversationVersion, conversations });
    return conversation;
  }

  async function createConversation(project, body = {}) {
    return await withProjectMutation(project, () => createConversationUnlocked(project, body));
  }

  async function updateConversationUnlocked(project, conversationId, body = {}) {
    const conversation = await readConversation(project, conversationId);
    const next = {
      ...conversation,
      title: body?.title === undefined ? conversation.title : trimText(body.title, maxTitleLength) || conversation.title,
      summary: body?.summary === undefined ? conversation.summary : trimText(body.summary, maxSummaryLength),
      fileContext:
        body?.fileContext === undefined
          ? conversation.fileContext
          : normalizeConversationFileContext(body.fileContext, { maxDraftContentLength: MAX_STORED_MESSAGE_BYTES }),
      editProposals: body?.editProposals === undefined ? conversation.editProposals : normalizeEditProposals(body.editProposals),
      updatedAt: nowIso(),
    };
    const index = await readIndex(project.path);
    const record = index.conversations.find((candidate) => candidate.id === next.id);
    if (!record) throw httpError("Conversation not found.", 404, "conversation_not_found");

    const summary = { ...summaryFromConversation(next, record.file), archived: body?.archived === undefined ? record.archived : Boolean(body.archived) };
    await writeJsonAtomic(project.path, record.file, next);
    await writeIndex(project.path, {
      ...index,
      conversations: [summary, ...index.conversations.filter((candidate) => candidate.id !== next.id)],
    });
    notify(project.slug, next.id, { type: "snapshot", conversation: next });
    return next;
  }

  async function updateConversation(project, conversationId, body = {}) {
    return await withProjectMutation(project, () => updateConversationUnlocked(project, conversationId, body));
  }

  async function writeConversationUnlocked(project, conversation, options = {}) {
    const archived = options.archived;
    const next = normalizeConversation(project, { ...conversation, updatedAt: conversation.updatedAt ?? nowIso() }, { id: conversation.id });
    const index = await readIndex(project.path);
    const record = index.conversations.find((candidate) => candidate.id === next.id);
    if (!record) throw httpError("Conversation not found.", 404, "conversation_not_found");

    await writeJsonAtomic(project.path, record.file, next);
    await writeIndex(project.path, {
      ...index,
      conversations: [
        { ...summaryFromConversation(next, record.file), archived: archived ?? record.archived },
        ...index.conversations.filter((candidate) => candidate.id !== next.id),
      ],
    });
    notify(project.slug, next.id, { type: "snapshot", conversation: next });
    return next;
  }

  async function writeConversation(project, conversation, options = {}) {
    return await withProjectMutation(project, () => writeConversationUnlocked(project, conversation, options));
  }

  async function appendMessageUnlocked(project, conversationId, messageInput) {
    const conversation = await readConversation(project, conversationId);
    const message = normalizeMessage(messageInput);

    if (Buffer.byteLength(message.content, "utf8") > MAX_STORED_MESSAGE_BYTES) {
      throw httpError("Chat message is too large.", 413, "chat_message_too_large");
    }

    const firstUserMessage = conversation.messages.find((candidate) => candidate.role === "user");
    const next = {
      ...conversation,
      title: conversation.title === "New conversation" && message.role === "user" && !firstUserMessage ? titleFromContent(message.content) : conversation.title,
      defaultModelId: message.modelId ?? conversation.defaultModelId,
      updatedAt: nowIso(),
      messages: [...conversation.messages, message],
    };

    return await writeConversationUnlocked(project, next);
  }

  async function appendMessage(project, conversationId, messageInput) {
    return await withProjectMutation(project, () => appendMessageUnlocked(project, conversationId, messageInput));
  }

  async function editUserMessageUnlocked(project, conversationId, messageId, content) {
    const conversation = await readConversation(project, conversationId);
    const targetMessageId = String(messageId ?? "").trim();
    const targetIndex = conversation.messages.findIndex((message) => message.id === targetMessageId);

    if (targetIndex < 0) {
      throw httpError("Chat message not found.", 404, "chat_message_not_found");
    }

    const existingMessage = conversation.messages[targetIndex];
    if (existingMessage.role !== "user") {
      throw httpError("Only user messages can be edited.", 400, "chat_message_not_editable");
    }

    const nextContent = trimText(content, MAX_STORED_MESSAGE_BYTES);
    if (!nextContent) {
      throw httpError("Chat requires a message.", 400, "chat_message_required");
    }
    if (Buffer.byteLength(nextContent, "utf8") > MAX_STORED_MESSAGE_BYTES) {
      throw httpError("Chat message is too large.", 413, "chat_message_too_large");
    }

    const firstUserIndex = conversation.messages.findIndex((candidate) => candidate.role === "user");
    const previousAutoTitle = firstUserIndex >= 0 ? titleFromContent(conversation.messages[firstUserIndex].content) : "New conversation";
    const updatedAt = nowIso();
    const editedMessage = normalizeMessage(
      {
        ...existingMessage,
        content: nextContent,
        updatedAt,
        status: "complete",
      },
      existingMessage,
    );
    const title =
      targetIndex === firstUserIndex && (conversation.title === "New conversation" || conversation.title === previousAutoTitle)
        ? titleFromContent(nextContent)
        : conversation.title;
    const next = {
      ...conversation,
      title,
      summary: "",
      updatedAt,
      messages: [...conversation.messages.slice(0, targetIndex), editedMessage],
    };

    return await writeConversationUnlocked(project, next);
  }

  async function editUserMessage(project, conversationId, messageId, content) {
    return await withProjectMutation(project, () => editUserMessageUnlocked(project, conversationId, messageId, content));
  }

  return {
    appendMessage,
    createConversation,
    editUserMessage,
    listConversations,
    notifyConversation: notify,
    readConversation,
    subscribeToConversation: subscribe,
    updateConversation,
    writeConversation,
  };
}
