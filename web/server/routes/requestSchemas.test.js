import { describe, expect, it } from "vitest";
import { MAX_USER_MESSAGE_BYTES } from "../contracts/chatLimits.js";
import { httpError } from "../services/httpErrors.js";
import { parseRequestBody, sendChatMessageBodySchema, writeFileBodySchema } from "./requestSchemas.js";

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
          editableFiles: [{ path: "outputs_ai/wiki/page.md", draftContent: "Draft", draftState: "unsaved" }],
          sourceFiles: [{ path: "inputs_human/source.md" }],
        },
      },
      httpError,
    );

    expect(parsed.context).toMatchObject({
      currentFile: { path: "human_goal_requirements.md" },
      editableFiles: [{ path: "outputs_ai/wiki/page.md", draftState: "unsaved" }],
      sourceFiles: [{ path: "inputs_human/source.md" }],
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
});
