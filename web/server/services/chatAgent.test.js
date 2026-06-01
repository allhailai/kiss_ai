import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MAX_STORED_MESSAGE_BYTES } from "../contracts/chatLimits.js";
import { createChatAgentService, extractApplyResult, extractConceptualDiffs, extractFileEditProposals } from "./chatAgent.js";
import { emptyConceptualDiffMemory, normalizeConceptualDiffMemoryFile, updateConceptualDiffRejectionMemory } from "./conceptualDiffMemory.js";
import { httpError } from "./httpErrors.js";
import { createProjectAgentLock } from "./projectAgentLock.js";

const conversation = {
  messages: [
    {
      context: {
        ai_editable_files: [
          {
            path: "human_goal_requirements.md",
            contentHash: "hash-before",
            draftState: "saved",
          },
        ],
      },
    },
  ],
};

const unsavedDraftConversation = {
  messages: [
    {
      context: {
        ai_editable_files: [
          {
            path: "human_goal_requirements.md",
            contentHash: "hash-before",
            draftContent: "unsaved draft\n",
            draftState: "unsaved",
          },
        ],
      },
    },
  ],
};

const conversationRootFileContext = {
  fileContext: {
    ai_editable_files: [
      {
        path: "outputs_ai/report.md",
        contentHash: "root-hash-before",
        draftState: "saved",
      },
    ],
    context_files: [],
  },
  messages: [],
};

function createDeferred() {
  let resolve = (_value) => undefined;
  let reject = (_error) => undefined;
  const promise = new Promise((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, reject, resolve };
}

function createConversationFixture(overrides = {}) {
  return {
    version: 1,
    id: "conv_1",
    projectSlug: "demo",
    title: "Demo",
    summary: "",
    createdAt: "2026-05-11T00:00:00.000Z",
    updatedAt: "2026-05-11T00:00:00.000Z",
    defaultModelId: "model-a",
    fileContext: {
      ai_editable_files: [{ path: "human_goal_requirements.md", label: "Goal", kind: "human" }],
      context_files: [],
    },
    editProposals: [],
    messages: [],
    ...overrides,
  };
}

function createChatAgentHarness({
  conversation = createConversationFixture(),
  gitFileDiffText = async () => ({ diff: "", diffError: "" }),
  projectPath = "/tmp/demo",
  readTextFile = async (_projectRoot, relativePath) => ({
    path: relativePath,
    kind: relativePath.startsWith("change_logs/") ? "log" : "human",
    editable: !relativePath.startsWith("change_logs/"),
    annotation: false,
    content: `Content for ${relativePath}\n`,
    contentHash: `hash-${relativePath}`,
  }),
  runCursorAgent = async ({ onEvent, prompt }) => {
    void prompt;
    await onEvent({
      type: "assistant_delta",
      text: [
        "<edit_proposal_json>",
        JSON.stringify({
          conceptualDiffs: [{ filePath: "human_goal_requirements.md", title: "Clarify goal", summary: "Clarify the goal." }],
        }),
        "</edit_proposal_json>",
      ].join("\n"),
    });
    return { status: "finished" };
  },
  notifyConversation = () => undefined,
} = {}) {
  let currentConversation = structuredClone(conversation);
  const project = { slug: "demo", name: "Demo", path: projectPath };
  const projectAgentLock = createProjectAgentLock({ httpError });
  const service = createChatAgentService({
    appendMessage: async (_project, _conversationId, message) => {
      currentConversation = {
        ...currentConversation,
        messages: [...currentConversation.messages, message],
        updatedAt: message.createdAt,
      };
      return currentConversation;
    },
    displayProjectName: (name) => name,
    editUserMessage: async () => currentConversation,
    gitFileDiffText,
    httpError,
    listCursorModels: async () => [{ id: "model-a" }],
    notifyConversation,
    pickRebuildModelId: () => "model-a",
    projectAgentLock,
    readConversation: async () => currentConversation,
    readProjectJson: async (_projectRoot, relativePath, fallback) => {
      try {
        return JSON.parse(await fs.readFile(path.join(projectPath, relativePath), "utf8"));
      } catch (error) {
        if (error?.code === "ENOENT") return fallback;
        throw error;
      }
    },
    readProjectHarness: async () => ({ project_name: "Demo", project_slug: "demo", setup: { status: "ready" } }),
    readTextFile,
    resolveCursorApiKey: async () => ({ available: true, apiKey: "cursor-key", source: "test" }),
    runCursorAgent,
    writeConversation: async (_project, nextConversation) => {
      currentConversation = structuredClone(nextConversation);
      return currentConversation;
    },
    writeProjectJson: async (_projectRoot, relativePath, value) => {
      await fs.writeFile(path.join(projectPath, relativePath), `${JSON.stringify(value, null, 2)}\n`, "utf8");
      return value;
    },
  });

  return {
    getConversation: () => currentConversation,
    project,
    projectAgentLock,
    service,
  };
}

describe("extractFileEditProposals", () => {
  it("extracts authorized file edit proposals", () => {
    const text = [
      "<file_edit>",
      "<path>human_goal_requirements.md</path>",
      "<summary>Update goal.</summary>",
      "<proposedContent>New goal",
      "details</proposedContent>",
      "</file_edit>",
    ].join("\n");

    expect(extractFileEditProposals(text, conversation, new Set(["human_goal_requirements.md"]))).toEqual([
      {
        path: "human_goal_requirements.md",
        summary: "Update goal.",
        proposedContent: "New goal\ndetails",
        contentHashBefore: "hash-before",
        draftStateBefore: "saved",
        status: "proposed",
      },
    ]);
  });

  it("preserves proposed replacement content exactly", () => {
    const text = [
      "<file_edit>",
      "<path>human_goal_requirements.md</path>",
      "<summary>Update goal.</summary>",
      "<proposedContent>  Leading space",
      "Trailing newline",
      "</proposedContent>",
      "</file_edit>",
    ].join("\n");

    expect(extractFileEditProposals(text, conversation, new Set(["human_goal_requirements.md"]))[0]).toMatchObject({
      proposedContent: "  Leading space\nTrailing newline\n",
    });
  });

  it("records a draft baseline hash for edits based on unsaved drafts", () => {
    const text = [
      "<file_edit>",
      "<path>human_goal_requirements.md</path>",
      "<summary>Update goal.</summary>",
      "<proposedContent>New goal</proposedContent>",
      "</file_edit>",
    ].join("\n");

    expect(extractFileEditProposals(text, unsavedDraftConversation, new Set(["human_goal_requirements.md"]))).toEqual([
      expect.objectContaining({
        draftContentHashBefore: "875c617c41c20743135952b42908802b8ca4679103faac5dfaf13b11ff3b9a22",
        draftStateBefore: "unsaved",
      }),
    ]);
  });

  it("extracts proposals authorized by conversation-level file context", () => {
    const text = [
      "<file_edit>",
      "<path>outputs_ai/report.md</path>",
      "<summary>Update report.</summary>",
      "<proposedContent>New report</proposedContent>",
      "</file_edit>",
    ].join("\n");

    expect(extractFileEditProposals(text, conversationRootFileContext, new Set(["outputs_ai/report.md"]))).toEqual([
      {
        path: "outputs_ai/report.md",
        summary: "Update report.",
        proposedContent: "New report",
        contentHashBefore: "root-hash-before",
        draftStateBefore: "saved",
        status: "proposed",
      },
    ]);
  });

  it("drops proposals for paths not authorized by server-side validation", () => {
    const text = [
      "<file_edit>",
      "<path>human_goal_requirements.md</path>",
      "<summary>Update goal.</summary>",
      "<proposedContent>New goal</proposedContent>",
      "</file_edit>",
    ].join("\n");

    expect(extractFileEditProposals(text, conversation, new Set())).toEqual([]);
  });

  it("drops malformed proposals", () => {
    const text = "<file_edit><path>human_goal_requirements.md</path><summary>Missing content.</summary></file_edit>";

    expect(extractFileEditProposals(text, conversation, new Set(["human_goal_requirements.md"]))).toEqual([]);
  });
});

describe("extractConceptualDiffs", () => {
  it("extracts authorized conceptual diffs from tagged JSON", () => {
    const text = [
      "<edit_proposal_json>",
      JSON.stringify({
        conceptualDiffs: [
          {
            filePath: "outputs_ai/report.md",
            title: "Clarify evidence caveat",
            summary: "Add a terse caveat about source confidence.",
          },
          {
            filePath: "outputs_ai/other.md",
            title: "Not allowed",
            summary: "This should be dropped.",
          },
        ],
      }),
      "</edit_proposal_json>",
    ].join("\n");

    expect(extractConceptualDiffs(text, new Set(["outputs_ai/report.md"]))).toEqual([
      expect.objectContaining({
        filePath: "outputs_ai/report.md",
        title: "Clarify evidence caveat",
        summary: "Add a terse caveat about source confidence.",
        status: "accepted",
      }),
    ]);
  });

  it("extracts and sanitizes rich conceptual diff details", () => {
    const text = [
      "<edit_proposal_json>",
      JSON.stringify({
        conceptualDiffs: [
          {
            filePath: "human_goal_requirements.md",
            title: "Align document",
            summary: "Make a document-wide pass to align annotations.",
            target: {
              scope: "document",
              sections: ["Goal", "Scope", "Non-goals", "Extra 1", "Extra 2", "Extra 3", "Extra 4", "Extra 5", "Extra 6"],
              anchors: ["Current objective"],
            },
            intent: {
              objective: "Reflect annotation guidance across the document.",
              rationale: "The saved annotation applies globally.",
              mustPreserve: ["Existing voice"],
              avoid: ["Adding unrelated requirements"],
            },
            evidence: {
              userGuidance: ["Interpret Git diff as user guidance."],
              gitDiffSignals: ["Annotation asks for global alignment."],
              contextSignals: ["Context reinforces current scope."],
            },
            applyNotes: {
              expectedChangeShape: "Broad editorial pass without inventing scope.",
              nonGoals: ["Do not add implementation details."],
              riskLevel: "high",
            },
          },
        ],
      }),
      "</edit_proposal_json>",
    ].join("\n");

    expect(extractConceptualDiffs(text, new Set(["human_goal_requirements.md"]))).toEqual([
      expect.objectContaining({
        filePath: "human_goal_requirements.md",
        target: {
          scope: "document",
          sections: ["Goal", "Scope", "Non-goals", "Extra 1", "Extra 2", "Extra 3", "Extra 4", "Extra 5"],
          anchors: ["Current objective"],
        },
        intent: {
          objective: "Reflect annotation guidance across the document.",
          rationale: "The saved annotation applies globally.",
          mustPreserve: ["Existing voice"],
          avoid: ["Adding unrelated requirements"],
        },
        evidence: {
          userGuidance: ["Interpret Git diff as user guidance."],
          gitDiffSignals: ["Annotation asks for global alignment."],
          contextSignals: ["Context reinforces current scope."],
        },
        applyNotes: {
          expectedChangeShape: "Broad editorial pass without inventing scope.",
          nonGoals: ["Do not add implementation details."],
          riskLevel: "high",
        },
      }),
    ]);
  });
});

describe("extractApplyResult", () => {
  it("filters failed conceptual diff ids to approved ids", () => {
    const result = extractApplyResult(
      `<apply_result_json>${JSON.stringify({ failedConceptualDiffIds: ["diff_allowed", "diff_unknown"], notice: "Done" })}</apply_result_json>`,
      ["diff_allowed"],
    );

    expect(result).toEqual({
      failedConceptualDiffIds: ["diff_allowed"],
      notice: "Done",
      valid: true,
    });
  });

  it("marks malformed apply output invalid", () => {
    expect(extractApplyResult("not json", ["diff_allowed"])).toMatchObject({
      failedConceptualDiffIds: [],
      valid: false,
    });
  });
});

describe("chat message lifecycle", () => {
  it("stores a controlled error when assistant streaming exceeds the stored message limit", async () => {
    const completed = createDeferred();
    const { project, service } = createChatAgentHarness({
      notifyConversation: (_projectSlug, _conversationId, event) => {
        if (event.type === "message_complete") completed.resolve(event.conversation);
      },
      runCursorAgent: async ({ onEvent }) => {
        await onEvent({ type: "assistant_delta", text: "x".repeat(MAX_STORED_MESSAGE_BYTES + 1) });
        return { status: "finished" };
      },
    });

    await service.sendChatMessage(project, "conv_1", {
      modelId: "model-a",
      content: "Please review the project.",
    });

    const finalConversation = await completed.promise;
    expect(finalConversation.messages.at(-1)).toMatchObject({
      content: "Assistant response is too large.",
      role: "assistant",
      status: "error",
    });
  });
});

describe("edit proposal lifecycle", () => {








  it("persists rejected AI File Assist conceptual diffs to shared memory", async () => {
    const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "kiss-ai-chat-memory-"));
    const { project, service } = createChatAgentHarness({
      projectPath,
      conversation: createConversationFixture({
        editProposals: [
          {
            id: "proposal_1",
            status: "proposed",
            createdAt: "2026-05-11T00:00:00.000Z",
            updatedAt: "2026-05-11T00:00:00.000Z",
            conceptualDiffs: [
              {
                id: "diff_rejected",
                filePath: "human_goal_requirements.md",
                title: "Rejected",
                summary: "Rejected summary.",
                status: "accepted",
                intent: { objective: "Rejected objective." },
              },
            ],
          },
        ],
      }),
    });

    await service.updateEditProposal(project, "conv_1", "proposal_1", {
      conceptualDiffs: [{ id: "diff_rejected", status: "rejected" }],
    });

    const memory = normalizeConceptualDiffMemoryFile(JSON.parse(await fs.readFile(path.join(projectPath, ".conceptual-diff-memory.json"), "utf8")));
    expect(memory.records).toEqual([
      expect.objectContaining({
        flow: "ai_file_assist",
        filePath: "human_goal_requirements.md",
        title: "Rejected",
        status: "active",
      }),
    ]);
  });

  it("applies only allowed accepted diffs and keeps rejected diffs as constraints", async () => {
    let capturedPrompt = "";
    const { project, service } = createChatAgentHarness({
      conversation: createConversationFixture({
        messages: [{ id: "msg_1", role: "user", content: "Please revise this.", createdAt: "2026-05-11T00:00:00.000Z", status: "complete" }],
        editProposals: [
          {
            id: "proposal_1",
            status: "proposed",
            createdAt: "2026-05-11T00:00:00.000Z",
            updatedAt: "2026-05-11T00:00:00.000Z",
            conceptualDiffs: [
              {
                id: "diff_allowed",
                filePath: "human_goal_requirements.md",
                title: "Allowed",
                summary: "Allowed summary.",
                status: "accepted",
                target: { scope: "document", sections: ["Goal"] },
                intent: {
                  objective: "Align the whole file with accepted guidance.",
                  mustPreserve: ["Existing voice"],
                  avoid: ["Unrelated scope expansion"],
                },
                applyNotes: { expectedChangeShape: "Broad editorial pass.", nonGoals: ["Do not add implementation details."], riskLevel: "high" },
              },
              { id: "diff_blocked", filePath: "change_logs/change_logs.md", title: "Blocked", summary: "Blocked summary.", status: "accepted" },
              {
                id: "diff_rejected",
                filePath: "human_goal_requirements.md",
                title: "Rejected",
                summary: "Rejected summary.",
                status: "rejected",
                intent: { objective: "Do not make this rejected change.", avoid: ["Rejected direction"] },
              },
            ],
          },
        ],
      }),
      runCursorAgent: async ({ onEvent, prompt }) => {
        capturedPrompt = prompt;
        await onEvent({
          type: "assistant_delta",
          text: `<apply_result_json>${JSON.stringify({ failedConceptualDiffIds: ["diff_allowed", "diff_unknown"], notice: "Applied partially." })}</apply_result_json>`,
        });
        return { status: "finished" };
      },
    });

    const next = await service.applyEditProposal(project, "conv_1", "proposal_1", { modelId: "model-a" });

    expect(capturedPrompt).toContain('"id": "diff_allowed"');
    expect(capturedPrompt).not.toContain('"id": "diff_blocked"');
    expect(capturedPrompt).toContain('"rejected_conceptual_diffs"');
    expect(capturedPrompt).toContain('"id": "diff_rejected"');
    expect(capturedPrompt).toContain('"scope": "document"');
    expect(capturedPrompt).toContain('"mustPreserve"');
    expect(capturedPrompt).toContain('"nonGoals"');
    expect(capturedPrompt).toContain("positive apply contract");
    expect(next.editProposals[0]).toMatchObject({
      status: "partial",
      notice: "Applied partially.",
      appliedAt: expect.any(String),
    });
  });

  it("marks apply failed when the agent returns malformed apply output", async () => {
    const { project, service } = createChatAgentHarness({
      conversation: createConversationFixture({
        messages: [{ id: "msg_1", role: "user", content: "Please revise this.", createdAt: "2026-05-11T00:00:00.000Z", status: "complete" }],
        editProposals: [
          {
            id: "proposal_1",
            status: "proposed",
            createdAt: "2026-05-11T00:00:00.000Z",
            updatedAt: "2026-05-11T00:00:00.000Z",
            conceptualDiffs: [{ id: "diff_allowed", filePath: "human_goal_requirements.md", title: "Allowed", summary: "Allowed summary.", status: "accepted" }],
          },
        ],
      }),
      runCursorAgent: async ({ onEvent }) => {
        await onEvent({ type: "assistant_delta", text: "not json" });
        return { status: "finished" };
      },
    });

    const next = await service.applyEditProposal(project, "conv_1", "proposal_1", { modelId: "model-a" });

    expect(next.editProposals[0]).toMatchObject({
      status: "failed",
      notice: "The apply run did not return a valid result summary. Review the files before trying again.",
    });
    expect(next.editProposals[0].appliedAt).toBeUndefined();
  });


});
