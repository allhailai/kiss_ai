# Research Plan Generation

## Purpose

This command is used by the kiss_ai build pipeline to generate a structured research plan. The agent searches the web and produces a JSON file listing URLs to fetch — but does **not** fetch the URLs itself. The build pipeline will handle fetching separately.

## Scope

This agent run should complete in 1–3 minutes. The output is a single JSON file. Do not write wiki pages, directed outputs, or source notes.

## Instructions

1. Read `project.md` to understand:
   - The project's thesis, topics, and key questions.
   - The directed outputs list (what evidence is needed to build them).
   - Any constraints or output guidance.

2. Read `inputs_human/**` if any non-placeholder files exist. Note what topics they cover and what gaps remain.

3. Read `sources/source_log.md` if it exists. Note which sources are already gathered and current.

4. **Search the web** for evidence that supports, refutes, or expands on the project's topics. For each topic area:
   - Search for primary sources: government data, corporate filings, annual reports, technical papers.
   - Search for secondary sources: trade press, industry analysis, expert commentary.
   - Search for contrarian sources: evidence that challenges the project thesis.
   - Aim for 2–4 URLs per major topic. Quality over quantity.

5. Write `sources/research_plan.json` with this structure:

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
          "relevance": "Why this source matters for the project"
        }
      ]
    }
  ]
}
```

## Rules

- **Do not fetch URLs.** Only list them. The build pipeline will fetch them.
- **Do not write source notes**, wiki pages, or directed outputs.
- **Do not modify any files** except `sources/research_plan.json`.
- Include only URLs that are likely to contain substantive content (articles, reports, data pages). Skip search result aggregator pages, login walls, or video-only pages.
- If a topic has no findable web sources, include it in the plan with an empty `urls` array — this documents the gap.
- The JSON must be valid and parseable. Do not wrap it in markdown code fences.

## Completion

Report:
- Number of topics covered.
- Total URLs listed.
- Any topics with no sources found (gaps).
