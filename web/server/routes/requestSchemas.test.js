import { describe, expect, it } from "vitest";
import { MAX_USER_MESSAGE_BYTES } from "../contracts/chatLimits.js";
import { httpError } from "../services/httpErrors.js";
import {
  applyEditProposalBodySchema,

  buildLogQuerySchema,
  conversationParamsSchema,
  editProposalParamsSchema,
  filePathQuerySchema,

  parseRequestBody,

  parseRequestParams,
  parseRequestQuery,

  searchFilesQuerySchema,
  sendChatMessageBodySchema,
  treeSectionParamsSchema,
  updateConversationBodySchema,
  updateEditProposalBodySchema,
  updateProjectUiStateBodySchema,
  writeFileBodySchema,
} from "./requestSchemas.js";

describe("request schemas", () => {
  it("validates chat message limits by UTF-8 byte length", () => {
    const oversized = "💬".repeat(Math.floor(MAX_USER_MESSAGE_BYTES / Buffer.byteLength("💬", "utf8")) + 1);

    expect(() =>
      parseRequestBody(
        sendChatMessageBodySchema,
        {
          modelId: "gpt-test",
          content: oversized,
        },
        httpError,
      ),
    ).toThrow("Chat message is too large.");
  });

  it("accepts the canonical chat context contract", () => {
    const parsed = parseRequestBody(
      sendChatMessageBodySchema,
      {
        modelId: "gpt-test",
        content: "Use the selected files.",
        context: {
          currentFile: { path: "human_goal_requirements.md", draftState: "saved" },
          ai_editable_files: [{ path: "outputs_ai/wiki/page.md", draftContent: "Draft", draftState: "unsaved" }],
          context_files: [{ path: "inputs_human/source.md" }],
        },
      },
      httpError,
    );

    expect(parsed.context).toMatchObject({
      currentFile: { path: "human_goal_requirements.md" },
      ai_editable_files: [{ path: "outputs_ai/wiki/page.md", draftState: "unsaved" }],
      context_files: [{ path: "inputs_human/source.md" }],
    });
  });

  it("accepts conversation-level file context updates", () => {
    const parsed = parseRequestBody(
      updateConversationBodySchema,
      {
        fileContext: {
          ai_editable_files: [{ path: "outputs_ai/wiki/page.md", draftState: "saved" }],
          context_files: [{ path: "inputs_human/source.md" }],
        },
      },
      httpError,
    );

    expect(parsed.fileContext).toMatchObject({
      ai_editable_files: [{ path: "outputs_ai/wiki/page.md", draftState: "saved" }],
      context_files: [{ path: "inputs_human/source.md" }],
    });
  });

  it("rejects oversized conversation-level file context updates", () => {
    expect(() =>
      parseRequestBody(
        updateConversationBodySchema,
        {
          fileContext: {
            ai_editable_files: Array.from({ length: 11 }, (_, index) => ({ path: `outputs_ai/${index}.md` })),
          },
        },
        httpError,
      ),
    ).toThrow("Invalid request body.");
  });

  it("validates edit proposal requests", () => {
    expect(
      parseRequestBody(
        updateEditProposalBodySchema,
        {
          conceptualDiffs: [{ id: "diff_1", status: "rejected" }],
        },
        httpError,
      ),
    ).toEqual({ conceptualDiffs: [{ id: "diff_1", status: "rejected" }] });
    expect(parseRequestBody(applyEditProposalBodySchema, { modelId: "gpt-test" }, httpError)).toEqual({ modelId: "gpt-test" });
    expect(parseRequestParams(editProposalParamsSchema, { conversationId: "conv_1", proposalId: "proposal_1" }, httpError)).toEqual({
      conversationId: "conv_1",
      proposalId: "proposal_1",
    });
  });

  it("requires write requests to include a loaded content hash", () => {
    expect(() =>
      parseRequestBody(
        writeFileBodySchema,
        {
          path: "human_goal_requirements.md",
          content: "Updated\n",
        },
        httpError,
      ),
    ).toThrow("expectedContentHash");
  });



  it("validates file write content before service-level file handling", () => {
    expect(() =>
      parseRequestBody(
        writeFileBodySchema,
        {
          path: "human_goal_requirements.md",
          content: "x".repeat(2 * 1024 * 1024 + 1),
          expectedContentHash: "hash",
        },
        httpError,
      ),
    ).toThrow("File content is too large.");
  });

  it("validates common route params and query strings", () => {
    expect(parseRequestParams(treeSectionParamsSchema, { section: "outputs" }, httpError)).toEqual({ section: "outputs" });
    expect(parseRequestParams(conversationParamsSchema, { conversationId: "conv_123" }, httpError)).toEqual({ conversationId: "conv_123" });
    expect(parseRequestQuery(filePathQuerySchema, { path: "outputs_ai/report.md" }, httpError)).toEqual({ path: "outputs_ai/report.md" });
    expect(parseRequestQuery(searchFilesQuerySchema, { q: ["report", "ignored"] }, httpError)).toEqual({ q: "report", filter: "" });
    expect(parseRequestQuery(buildLogQuerySchema, { tab: "build-summary", summary: "change_logs/summaries/a.md" }, httpError)).toMatchObject({
      tab: "build-summary",
      summary: "change_logs/summaries/a.md",
    });
  });

  it("rejects invalid route params and missing file path queries", () => {
    expect(() => parseRequestParams(treeSectionParamsSchema, { section: "unknown" }, httpError)).toThrow("Invalid request params.");
    expect(() => parseRequestParams(conversationParamsSchema, { conversationId: "bad/id" }, httpError)).toThrow("Invalid conversation id.");
    expect(() => parseRequestQuery(filePathQuerySchema, {}, httpError)).toThrow("Invalid request query.");
  });

  it("accepts route hashes produced by the client route builder", () => {
    const hashes = [
      "#/p/demo_project/dashboard",
      "#/p/demo-project/outputs/outputs_ai%2Fwiki%2FMarket%20notes.md",
      "#/p/demo_project/requirements/human_goal_requirements.md?panel=build-project",
    ];

    for (const hash of hashes) {
      expect(parseRequestBody(updateProjectUiStateBodySchema, { lastRoute: { hash } }, httpError)).toEqual({ lastRoute: { hash } });
    }
  });
});
