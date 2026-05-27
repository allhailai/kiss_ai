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

// ── PDF extraction ──────────────────────────────────────────────────
let _PDFParse;

async function loadPdfDeps() {
  if (_PDFParse) return;
  const mod = await import("pdf-parse");
  _PDFParse = mod.PDFParse;
}

function cleanPdfText(raw) {
  // Collapse runs of blank lines to double-newline (paragraph breaks)
  let text = raw.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n");

  // Detect all-caps lines as headings (at least 4 chars, mostly uppercase)
  const lines = text.split("\n");
  const cleaned = lines.map((line) => {
    const trimmed = line.trim();
    if (
      trimmed.length >= 4 &&
      trimmed === trimmed.toUpperCase() &&
      /[A-Z]/.test(trimmed) &&
      !/^\d+$/.test(trimmed)
    ) {
      // Title-case it and make it a heading
      const titleCased = trimmed
        .toLowerCase()
        .replace(/\b[a-z]/g, (c) => c.toUpperCase());
      return `\n## ${titleCased}\n`;
    }
    return line;
  });

  return cleaned.join("\n").trim();
}

async function extractPdf(url, response) {
  await loadPdfDeps();

  const buffer = Buffer.from(await response.arrayBuffer());
  const parser = new _PDFParse({ data: new Uint8Array(buffer) });

  try {
    const result = await parser.getText();
    const content = cleanPdfText(result.text);
    const wordCount = content.split(/\s+/).filter(Boolean).length;

    return {
      url,
      title: "",
      byline: "",
      excerpt: "",
      content,
      wordCount,
    };
  } finally {
    await parser.destroy();
  }
}

// ── Browser fallback for WAF-blocked pages ──────────────────────────
const CHROME_PATHS = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium-browser",
  "/usr/bin/chromium",
];

let _puppeteer;

async function loadBrowserDeps() {
  if (_puppeteer) return;
  const mod = await import("puppeteer-core");
  _puppeteer = mod.default ?? mod;
}

async function findChrome() {
  const { existsSync } = await import("node:fs");
  for (const p of CHROME_PATHS) {
    if (existsSync(p)) return p;
  }
  return null;
}

async function fetchWithBrowser(url, timeoutMs = 30_000) {
  await loadBrowserDeps();
  await loadDeps(); // Need Readability + Turndown

  const chromePath = await findChrome();
  if (!chromePath) {
    return { error: "Browser fallback unavailable: Chrome not found at known paths", url };
  }

  let browser;
  try {
    browser = await _puppeteer.launch({
      executablePath: chromePath,
      headless: "shell",
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });

    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    );

    await page.goto(url, { waitUntil: "networkidle2", timeout: timeoutMs });

    // Check if we still got blocked after JS execution
    const title = await page.title();
    if (title.toLowerCase().includes("access denied") || title.toLowerCase().includes("blocked")) {
      return { error: "Browser fallback: page still blocked after JS execution", url };
    }

    const html = await page.content();

    // Use the same Readability + Turndown pipeline as the normal path
    const { document } = _parseHTML(html);
    const reader = new _Readability(document);
    const article = reader.parse();

    if (!article || !article.content) {
      // Fall back to full page body text if Readability can't isolate an article
      const bodyText = await page.evaluate(() => document.body?.innerText || "");
      const wordCount = bodyText.split(/\s+/).filter(Boolean).length;

      if (wordCount < 50) {
        return { error: "Browser fallback: page loaded but no extractable content", url };
      }

      return {
        url,
        title: title || "",
        byline: "",
        excerpt: "",
        content: bodyText,
        wordCount,
      };
    }

    const turndown = new _TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });
    const markdown = turndown.turndown(article.content);
    const wordCount = markdown.split(/\s+/).filter(Boolean).length;

    return {
      url,
      title: article.title || title || "",
      byline: article.byline || "",
      excerpt: article.excerpt || "",
      content: markdown,
      wordCount,
    };
  } catch (err) {
    return { error: `Browser fallback error: ${err.message || "unknown"}`, url };
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
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
      // On 403 (WAF block), retry with headless browser
      if (response.status === 403) {
        return fetchWithBrowser(url, timeoutMs * 2);
      }
      return { error: `HTTP ${response.status} ${response.statusText}`, url };
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/pdf")) {
      return extractPdf(url, response);
    }
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
  ].join("\n");
}

// ── Execute a full research plan ────────────────────────────────────
const CONCURRENCY_LIMIT = 8;

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
    if (freshness === "perishable") {
      // Re-fetch if not fetched today; skip if already fetched today
      const today = new Date().toISOString().slice(0, 10);
      return fetchDate !== today;
    }

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

// ── Source Digest Generation ────────────────────────────────────────
// Heuristic compaction: extract key sentences from full source articles
// to create ~200-word digests for progressive discovery.
//
// Domain-agnostic: works for any research topic by detecting universal
// data patterns (numbers, dates, percentages, measurements) rather than
// enumerating domain-specific units or jargon.

const DATA_SENTENCE_PATTERN = new RegExp(
  [
    // Any number followed by a short unit-like word (catches kg, mg, GW, bbl, years, etc.)
    "\\d+(?:[.,]\\d+)*\\s*[A-Za-z]{1,6}\\b",
    // Percentages
    "\\d+(?:[.,]\\d+)*\\s*%",
    // Currency (common symbols)
    "(?:\\$|€|£|¥)\\s*\\d+",
    // Ranges with hyphens or "to" (e.g., "12-15 years", "3.2 to 4.8")
    "\\d+(?:\\.\\d+)?\\s*(?:–|-|to)\\s*\\d+",
    // Dates (four-digit years, with optional month/day)
    "(?:20\\d{2}|19\\d{2})(?:[/-]\\d{2}){0,2}",
    // Large-number words
    "(?:billion|million|trillion|thousand)",
    // Ratio patterns (e.g., "3/4", "1.5:1", "2 out of 3")
    "\\d+(?:\\.\\d+)?\\s*(?:/|:|out of)\\s*\\d+",
    // Numbered references (e.g., "Section 4", "Chapter 12", "Phase III", "Table 3")
    "(?:Section|Chapter|Phase|Table|Figure|Appendix|Part)\\s+\\w+",
  ].join("|"),
  "i",
);

// Universal analytical/research language — not domain-specific
const STRONG_SIGNAL_WORDS = /(?:increase|decrease|decline|growth|rose|fell|dropped|surged|peaked|forecast|projected|estimated|reported|announced|found|concluded|showed|demonstrated|compared|averaged|ranked|exceeded|totaled|according to|resulted in|associated with|correlated|significant|approximately|whereas|however|in contrast|notably|specifically|respectively)/i;

function isDataSentence(sentence) {
  return DATA_SENTENCE_PATTERN.test(sentence) || STRONG_SIGNAL_WORDS.test(sentence);
}

function extractKeySentences(content, maxSentences = 15) {
  // Split content into sentences (rough heuristic)
  const sentences = content
    .replace(/\n#+\s/g, ". ")  // treat headings as sentence breaks
    .replace(/\n[-*]\s/g, ". ") // treat list items as sentence breaks
    .replace(/\|\s/g, ". ")     // treat table cells as sentence breaks
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20 && s.length < 500);

  // Score and rank sentences
  const scored = sentences.map((sentence) => {
    let score = 0;
    if (DATA_SENTENCE_PATTERN.test(sentence)) score += 3;
    if (STRONG_SIGNAL_WORDS.test(sentence)) score += 2;
    // Bonus for sentences with specific numbers
    const numberCount = (sentence.match(/\d+/g) || []).length;
    score += Math.min(numberCount, 3);
    return { sentence, score };
  });

  // Take highest-scoring sentences, preserving original order
  const withScore = scored.filter((s) => s.score > 0);
  const top = withScore
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSentences);

  // Re-sort by original position to maintain narrative flow
  const originalOrder = top.sort(
    (a, b) => sentences.indexOf(a.sentence) - sentences.indexOf(b.sentence),
  );

  // Compute coverage: what fraction of the source had extractable data?
  const scoredRatio = sentences.length > 0 ? withScore.length / sentences.length : 0;
  let coverage;
  if (top.length >= 8 || scoredRatio >= 0.3) {
    coverage = "high";
  } else if (top.length >= 3) {
    coverage = "medium";
  } else {
    coverage = "low";
  }

  return {
    sentences: originalOrder.map((s) => s.sentence),
    stats: {
      totalSentences: sentences.length,
      scoredSentences: withScore.length,
      extractedSentences: top.length,
      coverage,
    },
  };
}

function formatDigest({ slug, title, url, type, relevance, keySentences, coverage, wordCount, fetchDate }) {
  const coverageNote =
    coverage === "low"
      ? "**low** — heuristic extracted few data points. Read the full source for qualitative content."
      : coverage === "medium"
        ? "**medium** — some data points extracted. Full source may contain additional qualitative insights."
        : "**high** — good data point extraction from this source.";

  const lines = [
    `# ${title || "Untitled"}`,
    "",
    `- Source file: \`sources/web_research/${slug}.md\``,
    `- URL: ${url}`,
    `- Type: ${type}`,
    `- Date fetched: ${fetchDate}`,
    `- Full article: ${wordCount} words`,
    `- Digest coverage: ${coverageNote}`,
    "",
    "## Key Claims & Data Points",
    "",
  ];

  if (keySentences.length > 0) {
    for (const sentence of keySentences) {
      lines.push(`- ${sentence}`);
    }
  } else {
    lines.push("- No quantitative data points extracted. Read the full source for qualitative content.");
  }

  lines.push("", "## Relevance", "", relevance || "General project coverage.", "");

  return lines.join("\n");
}

export async function generateSourceDigests(projectPath, onProgress) {
  const webResearchDir = path.join(projectPath, "sources", "web_research");
  const digestsDir = path.join(projectPath, "sources", "digests");
  await fs.mkdir(digestsDir, { recursive: true });

  let entries;
  try {
    entries = await fs.readdir(webResearchDir);
  } catch {
    return { generated: 0, skipped: 0, total: 0 };
  }

  const mdFiles = entries.filter((f) => f.endsWith(".md"));
  const results = { generated: 0, skipped: 0, total: mdFiles.length };

  for (const filename of mdFiles) {
    const sourcePath = path.join(webResearchDir, filename);
    const digestPath = path.join(digestsDir, filename);

    // Skip if digest already exists and is newer than source
    try {
      const [sourceStat, digestStat] = await Promise.all([
        fs.stat(sourcePath),
        fs.stat(digestPath),
      ]);

      if (digestStat.mtimeMs >= sourceStat.mtimeMs) {
        results.skipped++;

        if (onProgress) {
          onProgress({
            completed: results.generated + results.skipped,
            total: results.total,
            lastFile: filename,
            lastStatus: "cached",
          });
        }
        continue;
      }
    } catch {
      // Digest doesn't exist yet — generate it
    }

    try {
      const content = await fs.readFile(sourcePath, "utf-8");

      // Skip failed-fetch notes
      if (content.startsWith("# Fetch Failed")) {
        // Write a minimal digest noting the failure
        const urlMatch = content.match(/^- URL:\s*(.+)$/m);
        const typeMatch = content.match(/^- Type:\s*(.+)$/m);
        await fs.writeFile(
          digestPath,
          [
            "# Fetch Failed",
            "",
            `- Source file: \`sources/web_research/${filename}\``,
            urlMatch ? `- URL: ${urlMatch[1]}` : "",
            typeMatch ? `- Type: ${typeMatch[1]}` : "",
            "- Status: **Unfetched** — no content available for digest",
            "",
          ]
            .filter(Boolean)
            .join("\n"),
          "utf-8",
        );
        results.generated++;
        continue;
      }

      // Parse metadata from the source note
      const titleMatch = content.match(/^# (.+)$/m);
      const urlMatch = content.match(/^- URL:\s*(.+)$/m);
      const typeMatch = content.match(/^- Type:\s*(.+)$/m);
      const dateMatch = content.match(/^- Date fetched:\s*(.+)$/m);
      const wcMatch = content.match(/^- Word count:\s*(\d+)/m);
      const relevanceMatch = content.match(/## Relevance\n\n(.+)/);

      // Extract the article content section
      const contentStart = content.indexOf("## Extracted Content");
      const contentEnd = content.indexOf("## Relevance");
      const articleContent =
        contentStart >= 0 && contentEnd >= 0
          ? content.slice(contentStart + "## Extracted Content".length, contentEnd).trim()
          : content;

      const { sentences: keySentences, stats } = extractKeySentences(articleContent);
      const slug = filename.replace(/\.md$/, "");

      const digest = formatDigest({
        slug,
        title: titleMatch?.[1] || "Untitled",
        url: urlMatch?.[1] || "",
        type: typeMatch?.[1] || "unknown",
        relevance: relevanceMatch?.[1] || "",
        keySentences,
        coverage: stats.coverage,
        wordCount: wcMatch ? Number(wcMatch[1]) : 0,
        fetchDate: dateMatch?.[1] || "",
      });

      // Only write if content actually changed (preserves mtime for triage)
      let existingDigest = null;
      try {
        existingDigest = await fs.readFile(digestPath, "utf-8");
      } catch { /* file doesn't exist yet */ }

      if (existingDigest === digest) {
        results.skipped++;
      } else {
        await fs.writeFile(digestPath, digest, "utf-8");
        results.generated++;
      }
    } catch {
      results.skipped++;
    }

    if (onProgress) {
      onProgress({
        completed: results.generated + results.skipped,
        total: results.total,
        lastFile: filename,
        lastStatus: "generated",
      });
    }
  }

  return results;
}

