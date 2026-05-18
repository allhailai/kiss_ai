import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

// ── Schema ──────────────────────────────────────────────────────────
const UrlEntry = z.object({
  url: z.string().url(),
  type: z.string().default("unknown"),
  relevance: z.string().default(""),
  freshness: z.enum(["stable", "default", "perishable"]).default("default"),
});

const QueryEntry = z.object({
  topic: z.string(),
  query: z.string().default(""),
  urls: z.array(UrlEntry).default([]),
});

const ResearchPlan = z.object({
  queries: z.array(QueryEntry),
});

// ── Lazy-loaded heavy deps ──────────────────────────────────────────
let _Readability;
let _TurndownService;
let _parseHTML;

async function loadDeps() {
  if (_Readability) return;

  const readabilityMod = await import("@mozilla/readability");
  _Readability = readabilityMod.Readability;

  const turndownMod = await import("turndown");
  _TurndownService = turndownMod.default ?? turndownMod;

  const linkedomMod = await import("linkedom");
  _parseHTML = linkedomMod.parseHTML;
}

// ── Core: fetch a single URL and extract article content ────────────
const DEFAULT_TIMEOUT_MS = 15_000;
const USER_AGENT = "kiss-ai-research/1.0 (Node.js; research build pipeline)";

export async function fetchAndExtract(url, timeoutMs = DEFAULT_TIMEOUT_MS) {
  await loadDeps();

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
    });

    clearTimeout(timer);

    if (!response.ok) {
      return { error: `HTTP ${response.status} ${response.statusText}`, url };
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      return { error: `Non-HTML content type: ${contentType}`, url };
    }

    const html = await response.text();

    // Parse with linkedom
    const { document } = _parseHTML(html);

    // Extract article with Readability
    const reader = new _Readability(document);
    const article = reader.parse();

    if (!article || !article.content) {
      return { error: "Readability could not extract article content", url };
    }

    // Convert HTML article content to markdown
    const turndown = new _TurndownService({
      headingStyle: "atx",
      codeBlockStyle: "fenced",
    });
    const markdown = turndown.turndown(article.content);
    const wordCount = markdown.split(/\s+/).filter(Boolean).length;

    return {
      url,
      title: article.title || "",
      byline: article.byline || "",
      excerpt: article.excerpt || "",
      content: markdown,
      wordCount,
    };
  } catch (err) {
    if (err.name === "AbortError") {
      return { error: `Fetch timed out after ${timeoutMs}ms`, url };
    }
    return { error: err.message || "Unknown fetch error", url };
  }
}

// ── Parse research plan JSON ────────────────────────────────────────
export async function parseResearchPlan(projectPath) {
  const planPath = path.join(projectPath, "sources", "research_plan.json");
  const raw = await fs.readFile(planPath, "utf-8");
  const parsed = JSON.parse(raw);
  return ResearchPlan.parse(parsed);
}

// ── Slug helper ─────────────────────────────────────────────────────
export function urlToSlug(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "").replace(/\./g, "_");
    const pathPart = u.pathname
      .replace(/\/$/, "")
      .replace(/^\//, "")
      .replace(/[^a-zA-Z0-9]/g, "_")
      .slice(0, 60);
    return `${host}__${pathPart || "index"}`.toLowerCase();
  } catch {
    return `source_${Date.now()}`;
  }
}

// ── Write a single source note ──────────────────────────────────────
function formatSourceNote({ url, title, type, relevance, content, byline, excerpt, wordCount, fetchDate }) {
  return [
    `# ${title || "Untitled"}`,
    "",
    `- URL: ${url}`,
    `- Type: ${type}`,
    `- Date fetched: ${fetchDate}`,
    `- Word count: ${wordCount}`,
    byline ? `- Author: ${byline}` : null,
    "",
    "## Extracted Content",
    "",
    content,
    "",
    "## Relevance",
    "",
    relevance || "General project coverage.",
    "",
  ]
    .filter((line) => line !== null)
    .join("\n");
}

function formatFailedNote({ url, type, relevance, error, fetchDate }) {
  return [
    `# Fetch Failed`,
    "",
    `- URL: ${url}`,
    `- Type: ${type}`,
    `- Date fetched: ${fetchDate}`,
    `- Status: **Unfetched**`,
    `- Error: ${error}`,
    "",
    "## Relevance",
    "",
    relevance || "General project coverage.",
    "",
    "<!-- AI_SUGGESTION: This source could not be fetched. Try refreshing on the next build, or find an alternative source for this topic. -->",
    "",
  ].join("\n");
}

// ── Execute a full research plan ────────────────────────────────────
const CONCURRENCY_LIMIT = 3;

// ── Freshness check ─────────────────────────────────────────────────
const DEFAULT_STALE_DAYS = 7;

function parseFetchDate(content) {
  const match = content.match(/^- Date fetched:\s*(\d{4}-\d{2}-\d{2})/m);
  return match ? match[1] : null;
}

function daysSince(dateStr) {
  const fetched = new Date(dateStr).getTime();
  const now = Date.now();
  return Math.floor((now - fetched) / (1000 * 60 * 60 * 24));
}

async function shouldFetch(filePath, freshness) {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    const fetchDate = parseFetchDate(content);
    if (!fetchDate) return true; // Can't determine age, re-fetch

    if (freshness === "stable") return false; // Never re-fetch
    if (freshness === "perishable") return true; // Always re-fetch

    // Default: re-fetch if older than DEFAULT_STALE_DAYS
    return daysSince(fetchDate) >= DEFAULT_STALE_DAYS;
  } catch {
    return true; // File doesn't exist, fetch it
  }
}

export async function executeResearchPlan(projectPath, plan, onProgress) {
  const webResearchDir = path.join(projectPath, "sources", "web_research");
  await fs.mkdir(webResearchDir, { recursive: true });

  const fetchDate = new Date().toISOString().slice(0, 10);
  const allUrls = [];

  // Flatten all URLs with their topic context
  for (const query of plan.queries) {
    for (const entry of query.urls) {
      allUrls.push({
        ...entry,
        topic: query.topic,
        query: query.query,
      });
    }
  }

  // Deduplicate by URL
  const seen = new Set();
  const uniqueUrls = allUrls.filter((entry) => {
    if (seen.has(entry.url)) return false;
    seen.add(entry.url);
    return true;
  });

  const results = { fetched: 0, failed: 0, skipped: 0, total: uniqueUrls.length };
  const sourceLogEntries = [];

  // Process in batches with concurrency limit
  for (let i = 0; i < uniqueUrls.length; i += CONCURRENCY_LIMIT) {
    const batch = uniqueUrls.slice(i, i + CONCURRENCY_LIMIT);

    const batchResults = await Promise.allSettled(
      batch.map(async (entry) => {
        const slug = urlToSlug(entry.url);
        const filePath = path.join(webResearchDir, `${slug}.md`);
        const needsFetch = await shouldFetch(filePath, entry.freshness ?? "default");

        if (!needsFetch) {
          return { entry, result: null, skipped: true };
        }

        const result = await fetchAndExtract(entry.url);
        return { entry, result, skipped: false };
      }),
    );

    for (const settled of batchResults) {
      if (settled.status === "rejected") {
        results.failed++;
        continue;
      }

      const { entry, result, skipped } = settled.value;

      if (skipped) {
        results.skipped++;
        // Read existing file for source log
        const slug = urlToSlug(entry.url);
        const filePath = path.join(webResearchDir, `${slug}.md`);
        try {
          const content = await fs.readFile(filePath, "utf-8");
          const titleMatch = content.match(/^# (.+)$/m);
          const wcMatch = content.match(/^- Word count:\s*(\d+)/m);
          sourceLogEntries.push({
            name: titleMatch?.[1] || slug,
            url: entry.url,
            type: entry.type,
            status: "Current (cached)",
            wordCount: wcMatch ? Number(wcMatch[1]) : undefined,
            topic: entry.topic,
          });
        } catch {
          // File read failed despite skip — shouldn't happen but handle gracefully
        }

        if (onProgress) {
          onProgress({
            completed: results.fetched + results.failed + results.skipped,
            total: results.total,
            lastUrl: entry.url,
            lastStatus: "skipped",
          });
        }
        continue;
      }

      const slug = urlToSlug(entry.url);
      const filePath = path.join(webResearchDir, `${slug}.md`);

      if (result.error) {
        // Write a failed-fetch note so the gap is documented
        const note = formatFailedNote({
          url: entry.url,
          type: entry.type,
          relevance: entry.relevance,
          error: result.error,
          fetchDate,
        });
        await fs.writeFile(filePath, note, "utf-8");
        results.failed++;
        sourceLogEntries.push({
          name: slug,
          url: entry.url,
          type: entry.type,
          status: "Unfetched",
          error: result.error,
          topic: entry.topic,
        });
      } else {
        const note = formatSourceNote({
          url: entry.url,
          title: result.title,
          type: entry.type,
          relevance: entry.relevance,
          content: result.content,
          byline: result.byline,
          excerpt: result.excerpt,
          wordCount: result.wordCount,
          fetchDate,
        });
        await fs.writeFile(filePath, note, "utf-8");
        results.fetched++;
        sourceLogEntries.push({
          name: result.title || slug,
          url: entry.url,
          type: entry.type,
          status: "Current",
          wordCount: result.wordCount,
          topic: entry.topic,
        });
      }

      if (onProgress) {
        onProgress({
          completed: results.fetched + results.failed,
          total: results.total,
          lastUrl: entry.url,
          lastStatus: result.error ? "failed" : "ok",
        });
      }
    }
  }

  // Write source log
  await writeSourceLog(projectPath, sourceLogEntries, fetchDate);

  return results;
}

// ── Source log ───────────────────────────────────────────────────────
async function writeSourceLog(projectPath, entries, fetchDate) {
  const logPath = path.join(projectPath, "sources", "source_log.md");

  const lines = [
    "# Source Log",
    "",
    `Last updated: ${fetchDate}`,
    "",
    "| Name | Type | Status | Word Count | Topic | URL |",
    "|------|------|--------|-----------|-------|-----|",
  ];

  for (const entry of entries) {
    lines.push(
      `| ${entry.name} | ${entry.type} | ${entry.status} | ${entry.wordCount ?? "—"} | ${entry.topic} | ${entry.url} |`,
    );
  }

  const gaps = entries.filter((e) => e.status === "Unfetched");
  if (gaps.length > 0) {
    lines.push("", "## Gaps", "");
    for (const gap of gaps) {
      lines.push(`- **${gap.topic}**: ${gap.url} — ${gap.error}`);
    }
  }

  lines.push("");
  await fs.writeFile(logPath, lines.join("\n"), "utf-8");
}
