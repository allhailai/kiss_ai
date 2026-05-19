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

    it("attempts browser fallback on 403 responses", async () => {
      const { fetchAndExtract } = await import("./webResearch.js");

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        statusText: "Forbidden",
        headers: new Headers(),
      });

      const result = await fetchAndExtract("https://example.com/blocked");
      // Browser fallback is triggered on 403 — if Chrome is available it will
      // attempt to load the page; if not, a fallback error is returned.
      // Either way, it should NOT return the raw "HTTP 403 Forbidden" error.
      expect(result.url).toBe("https://example.com/blocked");
      if (result.error) {
        expect(result.error).not.toBe("HTTP 403 Forbidden");
      }
    });

    it("returns an error for non-403 HTTP failures", async () => {
      const { fetchAndExtract } = await import("./webResearch.js");

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        headers: new Headers(),
      });

      const result = await fetchAndExtract("https://example.com/error");
      expect(result.error).toContain("500");
      expect(result.url).toBe("https://example.com/error");
    });

    it("extracts text from PDF responses", async () => {
      const { fetchAndExtract } = await import("./webResearch.js");

      // Build a minimal valid PDF in memory
      const pdfContent = [
        "%PDF-1.4",
        "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj",
        "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj",
        "3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj",
        "4 0 obj<</Length 44>>stream",
        "BT /F1 12 Tf 100 700 Td (Hello PDF World) Tj ET",
        "endstream endobj",
        "5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj",
        "xref",
        "0 6",
        "0000000000 65535 f ",
        "0000000009 00000 n ",
        "0000000058 00000 n ",
        "0000000115 00000 n ",
        "0000000266 00000 n ",
        "0000000360 00000 n ",
        "trailer<</Size 6/Root 1 0 R>>",
        "startxref",
        "434",
        "%%EOF",
      ].join("\n");
      const pdfBuffer = Buffer.from(pdfContent);

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Headers({ "content-type": "application/pdf" }),
        arrayBuffer: () => Promise.resolve(pdfBuffer.buffer.slice(pdfBuffer.byteOffset, pdfBuffer.byteOffset + pdfBuffer.byteLength)),
      });

      const result = await fetchAndExtract("https://example.com/file.pdf");
      expect(result.error).toBeUndefined();
      expect(result.url).toBe("https://example.com/file.pdf");
      expect(result.content).toBeTruthy();
    });

    it("returns an error for non-HTML non-PDF content types", async () => {
      const { fetchAndExtract } = await import("./webResearch.js");

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Headers({ "content-type": "image/png" }),
      });

      const result = await fetchAndExtract("https://example.com/photo.png");
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

  describe("urlToSlug", () => {
    it("converts a URL to a filesystem-safe slug", async () => {
      const { urlToSlug } = await import("./webResearch.js");
      const slug = urlToSlug("https://www.example.com/path/to/article");
      expect(slug).toBe("example_com__path_to_article");
    });

    it("strips www prefix", async () => {
      const { urlToSlug } = await import("./webResearch.js");
      expect(urlToSlug("https://www.test.org/page")).toBe("test_org__page");
    });
  });

  describe("incremental fetch (executeResearchPlan)", () => {
    it("skips URLs with existing source files fetched today", async () => {
      const { executeResearchPlan, urlToSlug } = await import("./webResearch.js");

      const tmpDir = path.resolve("test-project-incremental");
      const webResearchDir = path.join(tmpDir, "sources", "web_research");
      await fs.mkdir(webResearchDir, { recursive: true });

      // Write a pre-existing source file with today's date
      const today = new Date().toISOString().slice(0, 10);
      const slug = urlToSlug("https://example.com/cached-article");
      await fs.writeFile(
        path.join(webResearchDir, `${slug}.md`),
        `# Cached Article\n\n- URL: https://example.com/cached-article\n- Type: news\n- Date fetched: ${today}\n- Word count: 500\n\n## Extracted Content\n\nCached content here.\n`,
      );

      const plan = {
        queries: [
          {
            topic: "Test",
            query: "test",
            urls: [{ url: "https://example.com/cached-article", type: "news", relevance: "test", freshness: "default" }],
          },
        ],
      };

      try {
        const results = await executeResearchPlan(tmpDir, plan);
        expect(results.skipped).toBe(1);
        expect(results.fetched).toBe(0);
        expect(results.failed).toBe(0);
      } finally {
        await fs.rm(tmpDir, { recursive: true, force: true });
      }
    });

    it("always re-fetches perishable sources", async () => {
      const { executeResearchPlan, urlToSlug } = await import("./webResearch.js");

      const tmpDir = path.resolve("test-project-perishable");
      const webResearchDir = path.join(tmpDir, "sources", "web_research");
      await fs.mkdir(webResearchDir, { recursive: true });

      const today = new Date().toISOString().slice(0, 10);
      const slug = urlToSlug("https://example.com/news-feed");
      await fs.writeFile(
        path.join(webResearchDir, `${slug}.md`),
        `# News Feed\n\n- URL: https://example.com/news-feed\n- Type: news\n- Date fetched: ${today}\n- Word count: 200\n\n## Extracted Content\n\nOld news.\n`,
      );

      // Mock fetch for the re-fetch
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        statusText: "Service Unavailable",
        headers: new Headers(),
      });

      const plan = {
        queries: [
          {
            topic: "Test",
            query: "test",
            urls: [{ url: "https://example.com/news-feed", type: "news", relevance: "test", freshness: "perishable" }],
          },
        ],
      };

      try {
        const results = await executeResearchPlan(tmpDir, plan);
        // Should attempt to fetch (even though it fails), not skip
        expect(results.skipped).toBe(0);
        expect(results.failed).toBe(1);
      } finally {
        globalThis.fetch = originalFetch;
        await fs.rm(tmpDir, { recursive: true, force: true });
      }
    });

    it("always skips stable sources", async () => {
      const { executeResearchPlan, urlToSlug } = await import("./webResearch.js");

      const tmpDir = path.resolve("test-project-stable");
      const webResearchDir = path.join(tmpDir, "sources", "web_research");
      await fs.mkdir(webResearchDir, { recursive: true });

      // Write a source file with a very old date — stable should still skip
      const slug = urlToSlug("https://example.com/annual-report-2024");
      await fs.writeFile(
        path.join(webResearchDir, `${slug}.md`),
        `# Annual Report\n\n- URL: https://example.com/annual-report-2024\n- Type: corporate\n- Date fetched: 2024-01-15\n- Word count: 3000\n\n## Extracted Content\n\nReport content.\n`,
      );

      const plan = {
        queries: [
          {
            topic: "Test",
            query: "test",
            urls: [{ url: "https://example.com/annual-report-2024", type: "corporate", relevance: "test", freshness: "stable" }],
          },
        ],
      };

      try {
        const results = await executeResearchPlan(tmpDir, plan);
        expect(results.skipped).toBe(1);
        expect(results.fetched).toBe(0);
      } finally {
        await fs.rm(tmpDir, { recursive: true, force: true });
      }
    });
  });
});
