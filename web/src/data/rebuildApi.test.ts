import { afterEach, describe, expect, it, vi } from "vitest";
import { rebuildApi } from "./rebuildApi";

describe("rebuildApi", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    // @ts-expect-error test-only EventSource cleanup
    delete globalThis.EventSource;
  });

  it("starts rebuilds with the selected model id", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          activeAssistantMessageId: null,
          agentId: null,
          attentionContext: null,
          events: [],
          finishedAt: null,
          log: [],
          message: "Starting local Cursor agent rebuild.",
          modelId: "gpt-test",
          runId: null,
          runKind: "rebuild",
          running: true,
          runtime: "cursor",
          startedAt: "2026-05-11T00:00:00.000Z",
          status: "running",
        }),
        { headers: { "Content-Type": "application/json" }, status: 200 },
      ),
    );

    await rebuildApi.startRebuild("demo", "gpt-test");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/demo/rebuild/start",
      expect.objectContaining({
        body: JSON.stringify({ modelId: "gpt-test" }),
        method: "POST",
      }),
    );
  });

  it("opens rebuild event sources at the project endpoint", () => {
    const eventSourceMock = vi.fn();
    // @ts-expect-error test-only EventSource mock
    globalThis.EventSource = eventSourceMock;

    rebuildApi.openRebuildEventSource("demo project");

    expect(eventSourceMock).toHaveBeenCalledWith("/api/projects/demo%20project/rebuild/events");
  });
});
