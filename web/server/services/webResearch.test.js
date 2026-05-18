import { describe, it, expect, vi, beforeEach } from "vitest";
import path from "node:path";
import fs from "node:fs/promises";

// Mock fetch globally for controlled testing
const originalFetch = globalThis.fetch;

describe("webResearch", () => {
  describe("parseResearchPlan", () => {
    it("parses a valid research plan JSON", async () => {
      const { parseResearchPlan } = await import("./webResearch.js");

      // Create a temporary directory with a valid plan
      const tmpDir = path.resolve("test-project-parse");
      await fs.mkdir(path.join(tmpDir, "sources"), { recursive: true });
      await fs.writeFile(
        path.join(tmpDir, "sources", "research_plan.json"),
        JSON.stringify({
          queries: [
            {
              topic: "Test Topic",
              query: "test query",
              urls: [{ url: "https://example.com/article", type: "news", relevance: "Test relevance" }],
            },
          ],
        }),
      );

      try {
        const plan = await parseResearchPlan(tmpDir);
        expect(plan.queries).toHaveLength(1);
        expect(plan.queries[0].topic).toBe("Test Topic");
        expect(plan.queries[0].urls[0].url).toBe("https://example.com/article");
      } finally {
        await fs.rm(tmpDir, { recursive: true, force: true });
      }
    });

    it("rejects malformed JSON", async () => {
      const { parseResearchPlan } = await import("./webResearch.js");

      const tmpDir = path.resolve("test-project-malformed");
      await fs.mkdir(path.join(tmpDir, "sources"), { recursive: true });
      await fs.writeFile(path.join(tmpDir, "sources", "research_plan.json"), "not json");

      try {
        await expect(parseResearchPlan(tmpDir)).rejects.toThrow();
      } finally {
        await fs.rm(tmpDir, { recursive: true, force: true });
      }
    });

    it("rejects plan with missing queries array", async () => {
      const { parseResearchPlan } = await import("./webResearch.js");

      const tmpDir = path.resolve("test-project-no-queries");
      await fs.mkdir(path.join(tmpDir, "sources"), { recursive: true });
      await fs.writeFile(path.join(tmpDir, "sources", "research_plan.json"), JSON.stringify({ topics: [] }));

      try {
        await expect(parseResearchPlan(tmpDir)).rejects.toThrow();
      } finally {
        await fs.rm(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe("fetchAndExtract", () => {
    beforeEach(() => {
      globalThis.fetch = originalFetch;
    });

    it("returns an error for non-200 responses", async () => {
      const { fetchAndExtract } = await import("./webResearch.js");

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        statusText: "Forbidden",
        headers: new Headers(),
      });

      const result = await fetchAndExtract("https://example.com/blocked");
      expect(result.error).toContain("403");
      expect(result.url).toBe("https://example.com/blocked");
    });

    it("returns an error for non-HTML content types", async () => {
      const { fetchAndExtract } = await import("./webResearch.js");

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Headers({ "content-type": "application/pdf" }),
      });

      const result = await fetchAndExtract("https://example.com/file.pdf");
      expect(result.error).toContain("Non-HTML");
    });

    it("extracts content from valid HTML", async () => {
      const { fetchAndExtract } = await import("./webResearch.js");

      const testHtml = `
        <html>
          <head><title>Test Article</title></head>
          <body>
            <article>
              <h1>Test Article Title</h1>
              <p>This is the main content of the article. It contains important research data about uranium production forecasts. The data shows significant trends in 2024 and 2025. Production volumes are expected to reach 25,000 tonnes by end of year.</p>
              <p>Additional paragraph with more substantive content to ensure Readability considers this an article. The analysis covers multiple aspects of the supply chain including mining operations, processing facilities, and transportation logistics.</p>
            </article>
          </body>
        </html>
      `;

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Headers({ "content-type": "text/html; charset=utf-8" }),
        text: () => Promise.resolve(testHtml),
      });

      const result = await fetchAndExtract("https://example.com/article");
      expect(result.error).toBeUndefined();
      expect(result.content).toBeTruthy();
      expect(result.wordCount).toBeGreaterThan(10);
      expect(result.url).toBe("https://example.com/article");
    });

    it("handles fetch timeout", async () => {
      const { fetchAndExtract } = await import("./webResearch.js");

      globalThis.fetch = vi.fn().mockImplementation(
        () =>
          new Promise((_, reject) => {
            const error = new Error("aborted");
            error.name = "AbortError";
            setTimeout(() => reject(error), 50);
          }),
      );

      const result = await fetchAndExtract("https://example.com/slow", 100);
      expect(result.error).toBeTruthy();
    });
  });
});
