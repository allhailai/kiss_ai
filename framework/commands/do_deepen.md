# do_deepen

Run a focused deepening pass on a single topic.

## Purpose

The user has selected a topic they want deeper research on. This command runs a targeted research and synthesis pass on that one topic only. It is lighter than a full build — it touches only the topic's wiki page, its downstream directed outputs, and the topic's entry in `.build/topics.json`.

## Scope

This agent run should complete in 3–5 minutes. It searches the web for additional evidence on the target topic, writes a research plan, and then (after the pipeline fetches URLs) synthesizes the new evidence into the topic's wiki page and related outputs.

## Inputs (provided in prompt)

The build pipeline provides these values:

- `TOPIC_ID`: The topic slug to deepen (e.g., `federal-marketing-rules`)
- `TOPIC_LABEL`: Human-readable name (e.g., `Federal Marketing Rules`)
- `TOPIC_WIKI_PAGE`: Path to existing wiki page (e.g., `outputs_ai/wiki/federal-marketing-rules.md`), or `null` if no page exists yet
- `TOPIC_SOURCES`: JSON array of current source paths for this topic
- `TOPIC_COVERAGE_GAPS`: JSON array of known gaps to address
- `TOPIC_DEPENDS_ON`: JSON array of topic IDs this topic depends on
- `TOPIC_DEEPENING_COUNT`: How many times this topic has been deepened before

## Instructions

### Phase 1: Read Context

1. Read `project.md` for overall project context — goals, thesis, constraints.
2. Read the topic's wiki page (at `TOPIC_WIKI_PAGE`) if it exists. Understand the current depth of coverage.
3. Read source digests for this topic's current sources (listed in `TOPIC_SOURCES`). Understand what evidence already exists.
4. Read `sources/source_log.md` if it exists. Note which sources are already gathered.
5. Read `.build/scratchpad.md` if it exists. Check for notes related to this topic.
6. Read wiki pages for dependency topics (listed in `TOPIC_DEPENDS_ON`) to understand upstream context.

### Phase 2: Search for Deeper Evidence

7. **Search the web** for additional evidence on this specific topic, focusing on:
   - Coverage gaps listed in `TOPIC_COVERAGE_GAPS`
   - Primary data sources: government data, registries, official statistics, corporate filings
   - Contrarian evidence: sources that challenge or nuance existing findings
   - Sub-topic detail: if the topic is broad, search for specific aspects that the current wiki page doesn't cover deeply
   - Aim for 3–6 new URLs. Quality over quantity. Prioritize primary and academic sources.
8. Write `sources/research_plan.json` with ONLY the new URLs for this topic. Do not include URLs that are already in `sources/web_research/`. Use the same schema as `do_build_research.md`:

```json
{
  "queries": [
    {
      "topic": "TOPIC_LABEL — deeper research",
      "query": "The search query used",
      "urls": [
        {
          "url": "https://full-url-to-fetch",
          "type": "corporate|government|trade_press|academic|news",
          "relevance": "Why this source matters for deepening the topic",
          "freshness": "stable|default|perishable"
        }
      ]
    }
  ]
}
```

**Stop here.** The build pipeline will fetch the URLs and generate digests. The agent will be called again for Phase 3.

### Phase 3: Synthesize Deeper Evidence

> **Note:** This phase runs after the pipeline has fetched URLs and generated source digests.

9. Read newly fetched sources from `sources/web_research/` and their digests from `sources/digests/`.
10. Update (or create) the topic's wiki page:
    - Integrate new evidence with existing content.
    - Cite all new sources with links.
    - Surface new data points, statistics, and findings.
    - Address coverage gaps where new evidence fills them.
    - Follow BLUF structure: lead with key findings.
    - Do not remove existing well-sourced content. Add to it.
11. Read `project.md` for the directed outputs list. Identify outputs that depend on this topic.
12. Update directed outputs that depend on this topic:
    - Refresh sections that reference this topic with the new evidence.
    - Do not regenerate the entire output. Only update sections relevant to this topic.
13. Update `.build/topics.json` for this topic:
    - Increment `discovery.deepening_count`
    - Set `discovery.last_deepened` to the current ISO timestamp
    - Update `metrics.source_count` with the new source count
    - Update `metrics.word_count` with the wiki page's updated word count
    - Update `metrics.last_updated` to now
    - Clear any `coverage_gaps` that were addressed by the new evidence
    - Add any new coverage gaps discovered during synthesis
    - Auto-advance state if evidence is now substantial:
      - `shallow` → `deep`: 3+ sources with specific data points, wiki page 1000+ words of sourced content
      - `deep` → `saturated`: all coverage gaps addressed, 5+ sources, wiki page 2000+ words
    - If the new evidence reveals sub-topics worthy of their own pages, add them to `topics.json` as `state: "seed"`, `origin: "agent_discovered"`, `discovered_from: "deepen_pass"`, with this topic as `parent`
    - **Append a `deepen_log` entry** to the topic's `deepen_log` array with this schema:
      ```json
      {
        "deepened_at": "<current ISO timestamp>",
        "sources_added": <number of new sources synthesized>,
        "sources_total": <total sources in topic corpus after deepening>,
        "unfetched": ["<source description>"],
        "word_count_before": <wiki page word count before this deepen>,
        "word_count_after": <wiki page word count after this deepen>,
        "state_before": "<topic state before deepening>",
        "state_after": "<topic state after deepening>",
        "enriched_files": ["<path to each directed output updated>"],
        "enriched_file_details": ["<filename — brief description of what changed>"],
        "seed_topics_added": <number of new seed topics discovered>,
        "coverage_gaps_remaining": ["<description of each remaining gap>"]
      }
      ```
      Record `word_count_before` and `state_before` at the start of Phase 3 before making changes.
14. Update `outputs_ai/wiki/_index.md` with the updated BLUF for this topic's wiki page. Preserve the `[[wiki link]]` format for page names and source references (see `do_build.md` Step 25 for the canonical schema).
15. Update `sources/source_log.md` with the new sources.

### Phase 4: Snapshot

16. Update `.build/scratchpad.md` with any new cross-references, contradictions, or open threads discovered during deepening.
17. Git snapshot:
    - `git add -A .`
    - `git commit -m "kiss_ai deepen: TOPIC_LABEL (YYYY-MM-DD)"`

## Rules

- **Only modify files related to this topic.** Do not regenerate unrelated wiki pages or directed outputs.
- **Respect user disposition.** If the topic is parked or settled (the pipeline should not call deepen on these, but guard anyway), do not proceed. Exit with a message explaining why.
- **Do not delete or overwrite existing well-sourced content** in the wiki page. Deepen means adding depth, not rewriting.
- **Do not search for topics other than the specified one.** If you discover related topics during research, add them as seeds to `topics.json` but do not research them now.
- The JSON in `topics.json` must be valid and parseable.

## Completion Message

Report:
- Topic deepened: `TOPIC_LABEL` (id: `TOPIC_ID`)
- New sources found: count
- Wiki page updated: yes/no, new word count
- Directed outputs updated: list of files touched
- State change: `shallow → deep` (if applicable)
- New seed topics discovered: count and labels (if any)
- Coverage gaps remaining: list (if any)
