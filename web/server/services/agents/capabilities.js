import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export function createAgentCapabilityService() {
  const capabilities = [
    {
      id: "project.read_status",
      label: "Read project status",
      description: "Inspect project readiness, recent runs, and outstanding human-attention items.",
      risk: "read",
      available: true,
    },
    {
      id: "files.read_context",
      label: "Read project context files",
      description: "Read allowlisted requirement, input, annotation, and output files for context.",
      risk: "read",
      available: true,
    },
    {
      id: "chat.answer_project_question",
      label: "Answer project questions",
      description: "Use project-local context and conversation history to answer questions.",
      risk: "read",
      available: true,
    },
  ];

  async function listAgentCapabilities(_project) {
    return { capabilities };
  }

  function capabilitySummary() {
    return [
      "Registered read-only capabilities:",
      "",
      ...capabilities.map((capability) => `- ${capability.label}: ${capability.description}`),
      "",
      "Tool execution will be added behind explicit approval gates.",
    ].join("\n");
  }

  function createMessage(role, content, modelId = null) {
    const timestamp = new Date().toISOString();
    return {
      id: `agent_${role}_${randomUUID()}`,
      role,
      content,
      createdAt: timestamp,
      updatedAt: timestamp,
      modelId,
      status: "complete",
    };
  }

  function createEmptySession(project) {
    const timestamp = new Date().toISOString();
    return {
      id: "agent-panel-default",
      projectSlug: project.slug,
      title: "Agent Chat",
      createdAt: timestamp,
      updatedAt: timestamp,
      messages: [
        createMessage(
          "assistant",
          "This right-panel agent chat is an independent project-scoped session. It can read registered capabilities; tool execution comes next.",
        ),
      ],
      toolCalls: [],
    };
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

  async function sendAgentSessionMessage(project, body) {
    const content = String(body?.content ?? "").trim();
    const modelId = String(body?.modelId ?? "").trim() || null;

    if (!content) {
      return await readAgentSession(project);
    }

    const session = await readAgentSession(project);
    const updatedAt = new Date().toISOString();
    const next = {
      ...session,
      updatedAt,
      messages: [
        ...session.messages,
        createMessage("user", content, modelId),
        createMessage("assistant", capabilitySummary(), modelId),
      ],
    };

    return await writeAgentSession(project, next);
  }

  return { listAgentCapabilities, readAgentSession, sendAgentSessionMessage };
}
