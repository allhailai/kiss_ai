import { afterEach, describe, expect, it, vi } from "vitest";
import { chatApi } from "./chatApi";

describe("chatApi", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    // @ts-expect-error test-only EventSource cleanup
    delete globalThis.EventSource;
  });

  it("sends the canonical chat context contract", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          createdAt: "2026-05-11T00:00:00.000Z",
          defaultModelId: "gpt-test",
          fileContext: { ai_editable_files: [], context_files: [] },
          id: "conv_1",
          messages: [],
          projectSlug: "demo",
          summary: "",
          title: "New conversation",
          updatedAt: "2026-05-11T00:00:00.000Z",
          version: 1,
        }),
        { headers: { "Content-Type": "application/json" }, status: 200 },
      ),
    );

    await chatApi.sendChatMessage("demo", "conv_1", {
      modelId: "gpt-test",
      content: "Use this file.",
      context: {
        currentFile: { path: "human_goal_requirements.md", draftState: "saved" },
        ai_editable_files: [{ path: "outputs_ai/report.md", draftState: "unknown" }],
        context_files: [{ path: "inputs_human/source.md" }],
      },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/demo/conversations/conv_1/messages",
      expect.objectContaining({
        body: JSON.stringify({
          modelId: "gpt-test",
          content: "Use this file.",
          context: {
            currentFile: { path: "human_goal_requirements.md", draftState: "saved" },
            ai_editable_files: [{ path: "outputs_ai/report.md", draftState: "unknown" }],
            context_files: [{ path: "inputs_human/source.md" }],
          },
        }),
        method: "POST",
      }),
    );
  });

  it("updates conversation-level file context", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          createdAt: "2026-05-11T00:00:00.000Z",
          defaultModelId: "gpt-test",
          fileContext: {
            ai_editable_files: [{ path: "outputs_ai/report.md" }],
            context_files: [{ path: "inputs_human/source.md" }],
          },
          id: "conv_1",
          messages: [],
          projectSlug: "demo",
          summary: "",
          title: "New conversation",
          updatedAt: "2026-05-11T00:00:00.000Z",
          version: 1,
        }),
        { headers: { "Content-Type": "application/json" }, status: 200 },
      ),
    );

    await chatApi.updateConversation("demo", "conv_1", {
      fileContext: {
        ai_editable_files: [{ path: "outputs_ai/report.md" }],
        context_files: [{ path: "inputs_human/source.md" }],
      },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/demo/conversations/conv_1",
      expect.objectContaining({
        body: JSON.stringify({
          fileContext: {
            ai_editable_files: [{ path: "outputs_ai/report.md" }],
            context_files: [{ path: "inputs_human/source.md" }],
          },
        }),
        method: "PATCH",
      }),
    );
  });

  it("opens a conversation event source at the encoded project endpoint", () => {
    const eventSourceMock = vi.fn();
    // @ts-expect-error test-only EventSource mock
    globalThis.EventSource = eventSourceMock;

    chatApi.openConversationEventSource("demo project", "conv/1");

    expect(eventSourceMock).toHaveBeenCalledWith("/api/projects/demo%20project/conversations/conv%2F1/events");
  });
});
