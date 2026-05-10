import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const maxPromptFileBytes = 24 * 1024;
const maxPromptHistoryMessages = 40;
const maxUserMessageBytes = 120 * 1024;
const defaultAgentSessionTitle = "Agent Chat";
const maxGeneratedTitleLength = 72;

function trimForPrompt(value, maxBytes = maxPromptFileBytes) {
  const text = String(value ?? "");
  if (Buffer.byteLength(text, "utf8") <= maxBytes) return text;
  return `${text.slice(0, maxBytes)}\n\n[Truncated for prompt size.]`;
}

function normalizeGeneratedTitle(value) {
  const title = String(value ?? "")
    .trim()
    .replace(/^["'`]+|["'`.]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!title) return defaultAgentSessionTitle;
  return title.length > maxGeneratedTitleLength ? `${title.slice(0, maxGeneratedTitleLength - 3)}...` : title;
}

function normalizePathLike(value) {
  return String(value ?? "").trim();
}

function normalizeContextFile(value, role = "secondary") {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const filePath = normalizePathLike(source.path);
  if (!filePath) return null;

  return {
    path: filePath,
    label: typeof source.label === "string" ? source.label.trim() : undefined,
    kind: typeof source.kind === "string" ? source.kind.trim() : undefined,
    editable: typeof source.editable === "boolean" ? source.editable : undefined,
    annotation: typeof source.annotation === "boolean" ? source.annotation : undefined,
    contentHash: typeof source.contentHash === "string" ? source.contentHash.trim() : undefined,
    draftState: ["saved", "unsaved", "unknown"].includes(source.draftState) ? source.draftState : "unknown",
    role: source.role === "primary" || source.role === "secondary" ? source.role : role,
  };
}

function normalizeContextRef(value, source = "manual") {
  const ref = normalizeContextFile(value);
  if (!ref) return null;

  return {
    path: ref.path,
    label: ref.label,
    kind: ref.kind,
    source,
  };
}

function normalizeMessageContext(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const activeFiles = Array.isArray(source.activeFiles) ? source.activeFiles.map((file) => normalizeContextFile(file)).filter(Boolean).slice(0, 10) : [];
  const fileRefs = Array.isArray(source.fileRefs) ? source.fileRefs.map((ref) => normalizeContextRef(ref)).filter(Boolean).slice(0, 20) : [];

  return activeFiles.length || fileRefs.length
    ? {
        activeFiles,
        fileRefs,
      }
    : undefined;
}

function formatHistoryMessage(message) {
  return {
    role: message.role === "assistant" ? "assistant" : message.role === "system" ? "system" : "user",
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

function uniqueContextRefs(context) {
  const activeRefs = (context?.activeFiles ?? []).map((file) => ({
    ...file,
    source: "active_file",
  }));
  const manualRefs = (context?.fileRefs ?? []).map((ref) => ({
    ...ref,
    source: ref.source ?? "manual",
  }));
  const refsByPath = new Map();

  for (const ref of [...activeRefs, ...manualRefs]) {
    if (!refsByPath.has(ref.path)) {
      refsByPath.set(ref.path, ref);
      continue;
    }

    const existing = refsByPath.get(ref.path);
    refsByPath.set(ref.path, {
      ...existing,
      ...ref,
      source: existing.source === "active_file" ? existing.source : ref.source,
    });
  }

  return [...refsByPath.values()].slice(0, 20);
}

function collectSessionContext(session, latestContext) {
  const historicalActiveFiles = session.messages.flatMap((message) => message.context?.activeFiles ?? []);
  const historicalFileRefs = session.messages.flatMap((message) => message.context?.fileRefs ?? []);
  const latestActiveFiles = latestContext?.activeFiles ?? [];
  const latestFileRefs = latestContext?.fileRefs ?? [];

  return {
    activeFiles: latestActiveFiles.length ? latestActiveFiles : historicalActiveFiles.slice(-10),
    fileRefs: [...historicalFileRefs, ...latestFileRefs].slice(-20),
  };
}

async function readContextFiles({ project, readTextFile, context }) {
  const contextFiles = [];
  const omittedContextFiles = [];

  for (const ref of uniqueContextRefs(context)) {
    try {
      const file = await readTextFile(project.path, ref.path);
      const expectedHash = typeof ref.contentHash === "string" && ref.contentHash ? ref.contentHash : null;
      const hashStatus = expectedHash ? (expectedHash === file.contentHash ? "matched" : "changed") : "missing_hash";

      contextFiles.push({
        path: file.path,
        label: ref.label ?? file.path,
        source: ref.source,
        kind: file.kind,
        editable: file.editable,
        annotation: file.annotation,
        expectedContentHash: expectedHash,
        contentHash: file.contentHash,
        hashStatus,
        draftState: ref.draftState ?? "unknown",
        content: trimForPrompt(file.content),
      });
    } catch (error) {
      omittedContextFiles.push({
        path: ref.path,
        label: ref.label ?? ref.path,
        source: ref.source,
        reason: error?.code === "ENOENT" ? "missing" : error instanceof Error ? error.message : "unavailable",
      });
    }
  }

  return { contextFiles, omittedContextFiles };
}

async function createAgentPrompt({ project, session, context, readProjectHarness, readTextFile, displayProjectName }) {
  const contextForResolution = collectSessionContext(session, context);
  const [harness, goal, inputs, outputs, openQuestions, resolvedContext] = await Promise.all([
    readProjectHarness(project.path),
    readOptionalProjectText(readTextFile, project.path, "human_goal_requirements.md"),
    readOptionalProjectText(readTextFile, project.path, "human_input_requirements.md"),
    readOptionalProjectText(readTextFile, project.path, "human_output_requirements.md"),
    readOptionalProjectText(readTextFile, project.path, "human_open_questions.md"),
    readContextFiles({ project, readTextFile, context: contextForResolution }),
  ]);
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
      id: session.id,
      title: session.title,
      history: session.messages.slice(-maxPromptHistoryMessages).map(formatHistoryMessage),
    },
    latestMessageContext: context ?? null,
    resolvedMessageContext: contextForResolution,
    resolvedContextFiles: resolvedContext.contextFiles,
    omittedContextFiles: resolvedContext.omittedContextFiles,
  };

  return [
    "You are the right-panel Agent for a local kiss_ai project.",
    "",
    "Rules:",
    "- Answer the user's latest message using only this session, the supplied project context, and resolved file context.",
    "- Treat active files as context explicitly selected by the UI.",
    "- Some historical context files may be missing. Continue with remaining context; mention missing files only when relevant to the answer.",
    "- You may discuss suggested changes, but this capability slice is read-only. Do not claim to have edited files.",
    "- Do not write files, run modifying commands, create artifacts, update logs, or update project state.",
    "- For AI-managed files and outputs, proposed changes would become saved human annotations detected through Git diff, not silent source-of-truth rewrites.",
    "- If the user asks for edits, explain what you would propose and note that proposal/apply capabilities are not active yet.",
    "- Do not expose hidden chain-of-thought. Provide concise reasoning summaries when useful.",
    "- If context is insufficient, say what is missing and suggest the next best step.",
    "",
    "Agent context payload:",
    JSON.stringify(payload, null, 2),
  ].join("\n");
}

export function createAgentCapabilityService({
  displayProjectName,
  httpError,
  listCursorModels,
  pickRebuildModelId,
  readProjectHarness,
  readTextFile,
  resolveCursorApiKey,
  runCursorAgentText,
}) {
  const capabilities = [
    {
      id: "context.answer",
      label: "Answer with context",
      description: "Answer questions using the active file context, selected file refs, project requirements, and session history.",
      risk: "read",
      available: true,
    },
    {
      id: "file.propose_changes",
      label: "Propose file changes",
      description: "Prepare proposal-only changes for one or more files, classified as edits or annotations by file type.",
      risk: "propose",
      available: false,
    },
    {
      id: "file.apply_approved_changes",
      label: "Apply approved file changes",
      description: "Apply approved proposals after stale-file validation.",
      risk: "write",
      available: false,
    },
    {
      id: "artifact.build",
      label: "Build shareable artifacts",
      description: "Create shareable artifacts such as HTML, PDF, reports, or exports.",
      risk: "run",
      available: false,
    },
  ];

  async function listAgentCapabilities(_project) {
    return { capabilities };
  }

  function createMessage(role, content, modelId = null, extras = {}) {
    const timestamp = new Date().toISOString();
    return {
      id: `agent_${role}_${randomUUID()}`,
      role,
      content,
      createdAt: timestamp,
      updatedAt: timestamp,
      modelId,
      status: "complete",
      ...extras,
    };
  }

  function createEmptySession(project) {
    const timestamp = new Date().toISOString();
    return {
      id: "agent-panel-default",
      projectSlug: project.slug,
      title: defaultAgentSessionTitle,
      createdAt: timestamp,
      updatedAt: timestamp,
      messages: [
        createMessage(
          "assistant",
          "This right-panel agent chat is an independent project-scoped session. It can answer using active file context; proposal, write, and artifact capabilities are modeled for future approval-gated workflows.",
        ),
      ],
      toolCalls: [],
    };
  }

  async function generateAgentSessionTitle({ project, content, modelId, apiKey }) {
    const prompt = [
      "Create a concise title for this agent chat conversation.",
      "",
      "Rules:",
      "- Return only the title.",
      "- Use 3-8 words.",
      "- Do not use quotes, markdown, trailing punctuation, or labels.",
      "- Base the title only on the user's first prompt.",
      "",
      "User first prompt:",
      trimForPrompt(content, 4 * 1024),
    ].join("\n");

    const rawTitle = await runCursorAgentText({ project, apiKey, modelId, prompt });
    return normalizeGeneratedTitle(rawTitle);
  }

  function agentSessionPath(project) {
    return path.join(project.path, "conversations", "agent-panel-session.json");
  }

  async function readAgentSession(project) {
    try {
      const raw = await fs.readFile(agentSessionPath(project), "utf8");
      return JSON.parse(raw);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      return createEmptySession(project);
    }
  }

  async function writeAgentSession(project, session) {
    const filePath = agentSessionPath(project);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tempPath, `${JSON.stringify(session, null, 2)}\n`, "utf8");
    await fs.rename(tempPath, filePath);
    return session;
  }

  async function resetAgentSession(project) {
    return await writeAgentSession(project, createEmptySession(project));
  }

  async function sendAgentSessionMessage(project, body) {
    const content = String(body?.content ?? "").trim();
    const modelId = String(body?.modelId ?? "").trim() || null;
    const context = normalizeMessageContext(body?.context);

    if (!content) {
      return await readAgentSession(project);
    }
    if (!modelId) {
      throw httpError("Agent chat requires a model.");
    }
    if (Buffer.byteLength(content, "utf8") > maxUserMessageBytes) {
      throw httpError("Agent chat message is too large.", 413, "agent_message_too_large");
    }

    const session = await readAgentSession(project);
    const updatedAt = new Date().toISOString();
    const firstUserMessage = session.messages.find((message) => message.role === "user");
    let sessionWithUser = {
      ...session,
      updatedAt,
      messages: [
        ...session.messages,
        createMessage("user", content, modelId, context ? { context } : {}),
      ],
    };

    try {
      const cursorApiKey = await resolveCursorApiKey();
      if (!cursorApiKey.available) {
        throw httpError("No Cursor API key found. Agent chat is unavailable from the UI.", 503, "cursor_api_key_unavailable");
      }

      const models = await listCursorModels(cursorApiKey.apiKey);
      if (!models.length) {
        throw httpError("No Cursor models are available for agent chat.", 503, "cursor_models_unavailable");
      }

      const resolvedModelId = pickRebuildModelId(models, modelId);
      if (!firstUserMessage && session.title === defaultAgentSessionTitle) {
        try {
          sessionWithUser = {
            ...sessionWithUser,
            title: await generateAgentSessionTitle({
              project,
              content,
              modelId: resolvedModelId,
              apiKey: cursorApiKey.apiKey,
            }),
          };
        } catch {
          sessionWithUser = {
            ...sessionWithUser,
            title: defaultAgentSessionTitle,
          };
        }
      }

      const prompt = await createAgentPrompt({
        project,
        session: sessionWithUser,
        context,
        readProjectHarness,
        readTextFile,
        displayProjectName,
      });
      const assistantText = await runCursorAgentText({
        project,
        apiKey: cursorApiKey.apiKey,
        modelId: resolvedModelId,
        prompt,
      });
      const next = {
        ...sessionWithUser,
        updatedAt: new Date().toISOString(),
        messages: [
          ...sessionWithUser.messages,
          createMessage("assistant", assistantText.trim() || "No assistant response was returned.", resolvedModelId),
        ],
      };

      return await writeAgentSession(project, next);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Agent chat failed.";
      const next = {
        ...sessionWithUser,
        updatedAt: new Date().toISOString(),
        messages: [
          ...sessionWithUser.messages,
          createMessage("assistant", errorMessage, modelId, { status: "error" }),
        ],
      };

      return await writeAgentSession(project, next);
    }
  }

  return { listAgentCapabilities, readAgentSession, resetAgentSession, sendAgentSessionMessage };
}
