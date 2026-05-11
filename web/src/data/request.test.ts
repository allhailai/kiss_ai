import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClientError, request } from "./request";

describe("request", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("preserves structured API error details", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ code: "file_changed", error: "This file changed after it was loaded." }), {
        headers: { "Content-Type": "application/json" },
        status: 409,
      }),
    );

    await expect(request("/api/projects/demo/file")).rejects.toMatchObject({
      code: "file_changed",
      message: "This file changed after it was loaded.",
      status: 409,
    } satisfies Partial<ApiClientError>);
  });

  it("falls back to status text when an error response is not JSON", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("Nope", { status: 500 }));

    await expect(request("/api/projects/demo/file")).rejects.toMatchObject({
      message: "Request failed: 500",
      status: 500,
    } satisfies Partial<ApiClientError>);
  });
});
