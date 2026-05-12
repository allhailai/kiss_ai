import { describe, expect, it } from "vitest";
import { createChatAgentService, extractApplyResult, extractConceptualDiffs, extractFileEditProposals } from "./chatAgent.js";
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
} = {}) {
  let currentConversation = structuredClone(conversation);
  const project = { slug: "demo", name: "Demo", path: "/tmp/demo" };
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
    notifyConversation: () => undefined,
    pickRebuildModelId: () => "model-a",
    projectAgentLock,
    readConversation: async () => currentConversation,
    readProjectHarness: async () => ({ project_name: "Demo", project_slug: "demo", setup: { status: "ready" } }),
    readTextFile,
    resolveCursorApiKey: async () => ({ available: true, apiKey: "cursor-key", source: "test" }),
    runCursorAgent,
    writeConversation: async (_project, nextConversation) => {
      currentConversation = structuredClone(nextConversation);
      return currentConversation;
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

describe("edit proposal lifecycle", () => {
  it("returns exact empty-guidance message when no messages or real scoped diffs exist", async () => {
    const { project, service } = createChatAgentHarness({
      gitFileDiffText: async () => ({ diff: "", diffError: "git diff unavailable" }),
      runCursorAgent: async () => {
        throw new Error("agent should not run without guidance");
      },
    });

    const next = await service.generateEditProposal(project, "conv_1", {
      modelId: "model-a",
      fileContext: {
        ai_editable_files: [{ path: "human_goal_requirements.md" }],
        context_files: [],
      },
    });

    expect(next.messages.at(-1)?.content).toBe(
      [
        "What changes do you want to make to the editable files?",
        "I need guidance.",
        "No edits were found in the file nor messages provided for guidance.",
      ].join("\n"),
    );
  });

  it("stores a failed proposal when proposal output is malformed", async () => {
    const { project, service } = createChatAgentHarness({
      conversation: createConversationFixture({ messages: [{ id: "msg_1", role: "user", content: "Please revise this.", createdAt: "2026-05-11T00:00:00.000Z", status: "complete" }] }),
      runCursorAgent: async ({ onEvent }) => {
        await onEvent({ type: "assistant_delta", text: "not json" });
        return { status: "finished" };
      },
    });

    const next = await service.generateEditProposal(project, "conv_1", {
      modelId: "model-a",
      fileContext: {
        ai_editable_files: [{ path: "human_goal_requirements.md" }],
        context_files: [],
      },
    });

    expect(next.editProposals.at(-1)).toMatchObject({
      status: "failed",
      conceptualDiffs: [],
      notice: "No proposed changes were generated.",
    });
  });

  it("adds proposal guidance as a user message before running the proposal prompt", async () => {
    let capturedPrompt = "";
    const { project, service } = createChatAgentHarness({
      runCursorAgent: async ({ onEvent, prompt }) => {
        capturedPrompt = prompt;
        await onEvent({
          type: "assistant_delta",
          text: `<edit_proposal_json>${JSON.stringify({ conceptualDiffs: [{ filePath: "human_goal_requirements.md", title: "Clarify goal", summary: "Clarify the goal." }] })}</edit_proposal_json>`,
        });
        return { status: "finished" };
      },
    });

    const next = await service.generateEditProposal(project, "conv_1", {
      modelId: "model-a",
      content: "Make the goal more specific.",
      fileContext: {
        ai_editable_files: [{ path: "human_goal_requirements.md" }],
        context_files: [],
      },
    });

    expect(next.messages).toEqual([
      expect.objectContaining({
        role: "user",
        content: "Make the goal more specific.",
        context: {
          ai_editable_files: [{ path: "human_goal_requirements.md" }],
          context_files: [],
        },
      }),
    ]);
    expect(capturedPrompt).toContain("Make the goal more specific.");
    expect(next.editProposals.at(-1)).toMatchObject({
      sourceMessageId: next.messages[0].id,
      status: "proposed",
    });
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
              { id: "diff_allowed", filePath: "human_goal_requirements.md", title: "Allowed", summary: "Allowed summary.", status: "accepted" },
              { id: "diff_blocked", filePath: "change_logs/change_logs.md", title: "Blocked", summary: "Blocked summary.", status: "accepted" },
              { id: "diff_rejected", filePath: "human_goal_requirements.md", title: "Rejected", summary: "Rejected summary.", status: "rejected" },
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

  it("blocks overlapping project agent runs with the shared project lock", async () => {
    const agentStarted = createDeferred();
    const finishAgent = createDeferred();
    const { project, service } = createChatAgentHarness({
      conversation: createConversationFixture({ messages: [{ id: "msg_1", role: "user", content: "Please revise this.", createdAt: "2026-05-11T00:00:00.000Z", status: "complete" }] }),
      runCursorAgent: async ({ onEvent }) => {
        agentStarted.resolve();
        await finishAgent.promise;
        await onEvent({
          type: "assistant_delta",
          text: `<edit_proposal_json>${JSON.stringify({ conceptualDiffs: [{ filePath: "human_goal_requirements.md", title: "Allowed", summary: "Allowed summary." }] })}</edit_proposal_json>`,
        });
        return { status: "finished" };
      },
    });

    const firstRun = service.generateEditProposal(project, "conv_1", {
      modelId: "model-a",
      fileContext: {
        ai_editable_files: [{ path: "human_goal_requirements.md" }],
        context_files: [],
      },
    });
    await agentStarted.promise;

    await expect(
      service.generateEditProposal(project, "conv_1", {
        modelId: "model-a",
        fileContext: {
          ai_editable_files: [{ path: "human_goal_requirements.md" }],
          context_files: [],
        },
      }),
    ).rejects.toMatchObject({ code: "project_agent_already_running", statusCode: 409 });

    finishAgent.resolve();
    await firstRun;
  });
});
