import { afterEach, describe, expect, it, vi } from "vitest";
import { filesApi } from "./filesApi";

describe("filesApi", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends expectedContentHash when saving a file", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          annotation: false,
          content: "Updated\n",
          contentHash: "next-hash",
          editable: true,
          kind: "human",
          path: "human_goal_requirements.md",
        }),
        { headers: { "Content-Type": "application/json" }, status: 200 },
      ),
    );

    await filesApi.saveFile("demo", "human_goal_requirements.md", "Updated\n", "loaded-hash");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/demo/file",
      expect.objectContaining({
        body: JSON.stringify({
          path: "human_goal_requirements.md",
          content: "Updated\n",
          expectedContentHash: "loaded-hash",
        }),
        method: "PUT",
      }),
    );
  });
});
