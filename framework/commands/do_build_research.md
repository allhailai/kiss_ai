# Research Plan Generation

## Purpose

This command is used by the kiss_ai build pipeline to generate a structured research plan. The agent searches the web and produces a JSON file listing URLs to fetch — but does **not** fetch the URLs itself. The build pipeline will handle fetching separately.

## Scope

This agent run should complete in 1–3 minutes. The output is a single JSON file. Do not write wiki pages, directed outputs, or source notes.

## Instructions

### Phase 1: Read Context

1. Read `project.md` to understand:
   - The project's thesis, topics, and key questions.
   - The directed outputs list (what evidence is needed to build them).
   - Any constraints or output guidance.

2. Read `inputs_human/**` if any non-placeholder files exist. Note what topics they cover and what gaps remain.

3. Read `sources/source_log.md` if it exists. Note which sources are already gathered and current.

4. **Read `sources/research_plan.json`** if it exists. This is the plan from the previous build. Your job is to **update** it, not replace it from scratch:
   - Keep existing URLs that are still relevant to the project.
   - Add new URLs for new or changed topics.
   - Remove URLs that are no longer relevant (e.g., if a topic was removed from project.md).
   - If no previous plan exists, generate from scratch.

5. **Read `.build/topics.json`** if it exists. This is the V2 topic taxonomy managed by the build system. Pay special attention to:
   - Topics with `"sources": []` (empty array) — these are new topics that need initial research. Generate 2–4 queries for each.
   - Topics with `"discovery": { "origin": "user_chat" }` — these were added by the user via the chat agent and may not appear in `project.md`. They are equally important.
   - The prompt may include an `UNSOURCED TOPICS` section listing these explicitly — if so, ensure every listed topic appears in your research plan output.

### Phase 2: Search

6. **Search the web** for evidence that supports, refutes, or expands on the project's topics. For each topic area:
   - Search for primary sources: government data, corporate filings, annual reports, technical papers.
   - Search for secondary sources: trade press, industry analysis, expert commentary.
   - Search for contrarian sources: evidence that challenges the project thesis.
   - Aim for 2–4 URLs per major topic. Quality over quantity.

### Phase 3: Write Plan

7. Write `sources/research_plan.json` with this structure:

```json
{
  "queries": [
    {
      "topic": "Human-readable topic name",
      "query": "The search query you used",
      "urls": [
        {
          "url": "https://full-url-to-fetch",
          "type": "corporate|government|trade_press|academic|news",
          "relevance": "Why this source matters for the project",
          "freshness": "stable|default|perishable"
        }
      ]
    }
  ]
}
```

#### Freshness values

- **`stable`**: Source content will not change. Corporate annual reports, academic papers, static government data, historical datasets. The pipeline will never re-fetch these.
- **`default`**: Source content may change over weeks. Trade press articles, industry analysis, consultancy reports. The pipeline will re-fetch these after 7 days.
- **`perishable`**: Source content changes frequently. News sites, price trackers, real-time dashboards, daily market commentary. The pipeline will re-fetch these on every build.

When in doubt, use `default`.

## Rules

- **Do not fetch URLs.** Only list them. The build pipeline will fetch them.
- **Do not write source notes**, wiki pages, or directed outputs.
- **Do not modify any files** except `sources/research_plan.json`.
- Include only URLs that are likely to contain substantive content (articles, reports, data pages). Skip search result aggregator pages, login walls, or video-only pages.
- If a topic has no findable web sources, include it in the plan with an empty `urls` array — this documents the gap.
- The JSON must be valid and parseable. Do not wrap it in markdown code fences.

### Deepen Directives

If the prompt includes a `DEEPEN DIRECTIVE` section, certain topics need deeper research coverage. For each deepened topic:

- Generate 4–6 URLs instead of the standard 2–4
- Prioritize primary data sources: government datasets, academic papers, corporate filings, raw data portals
- Target any listed `coverage_gaps` with specific search queries
- Search for contrarian or alternative-angle sources that challenge the current wiki narrative
- Prefer institutional sources (academic, government, industry associations) over general news
- Include at least one source from a different geographic or methodological perspective if available

Mark all deepen URLs with their topic context in the `query.topic` field so the pipeline can trace which sources came from deepening.

### Unsourced Topics

If the prompt includes an `UNSOURCED TOPICS` section, these are new topics (typically created by the user via chat) that have zero sources and no existing research plan entries. For each unsourced topic:

- Generate 2–4 search queries covering the topic from different angles
- Include diverse source types: at least one primary source and one secondary source
- Use the topic's `label` and `details` (if provided) to guide your searches
- The `query.topic` field must match the topic label exactly so the pipeline can map sources back

These topics are just as important as topics from `project.md` — do not skip them.

## Completion

Report:
- Number of topics covered.
- Total URLs listed.
- Number of topics deepened (if DEEPEN DIRECTIVE was present).
- Number of unsourced topics bootstrapped (if UNSOURCED TOPICS was present).
- Any topics with no sources found (gaps).
