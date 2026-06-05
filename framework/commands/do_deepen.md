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
- `TOPIC_DETAILS`: User-provided context about the topic — what angle to focus on, what the user cares about, or additional constraints. This is a human-only field; do not modify it. Use it to guide your research and synthesis priorities.
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
7. Read `framework/topic_depth_definitions.md` for the full depth criteria definitions.

### Phase 1b: Depth Gap Assessment

**The goal of every deepen pass is to advance the topic toward `deep` status (or toward `saturated` if already deep).** Before searching, assess which depth criteria are currently unmet:

8. Evaluate the topic against each depth criterion:
   - **Source diversity:** Count the distinct source types in `TOPIC_SOURCES`. Are there ≥2 types? If not, note which types are missing (e.g., "no government or academic sources").
   - **Evidence specificity:** Scan the wiki page for concrete, cited data points. Are there ≥3? If not, note what kinds of data points are needed.
   - **Coverage gaps:** Count open gaps in `TOPIC_COVERAGE_GAPS`. Are there ≤1 remaining?
   - **Cross-referencing:** Does the wiki page reference findings from dependency topics? If not, note which dependency topics should be connected.
   - **Contrarian evidence:** Does the wiki page acknowledge any counterarguments or limitations? If not, flag this.

9. Write a brief internal assessment (do not output it to a file) listing:
   - Which criteria are already met ✓
   - Which criteria are unmet ✗ and what specific actions would address them
   - This assessment drives all subsequent research and synthesis decisions

### Phase 2: Search for Deeper Evidence

10. **Search the web** for additional evidence on this specific topic. **Prioritize searches that address unmet depth criteria from Phase 1b:**
   - If **source diversity** is unmet: specifically search for source types that are missing (e.g., search government databases, academic repositories, or corporate filings).
   - If **evidence specificity** is unmet: search for sources with hard data — statistics, quantified claims, regulatory citations, named datasets.
   - If **contrarian evidence** is unmet: explicitly search for criticism, limitations, opposing viewpoints, or alternative interpretations of the topic.
   - **Coverage gaps are the #1 priority.** For each gap in `TOPIC_COVERAGE_GAPS`, use its `search_hints` as search queries and include its `target_urls` in the research plan. If a gap has `attempts >= 2`, try alternative search strategies (different keywords, adjacent topics, broader/narrower scope). Every gap should have at least one search dedicated to resolving it.
   - If **cross-referencing** is unmet: read dependency topic wiki pages and identify connection points to weave in during synthesis.
   - Aim for 6–8 new URLs. Quality over quantity. Prioritize primary and academic sources. Cast a wider net to compensate for sources that may fail to fetch.
11. Write `sources/research_plan.json` with ONLY the new URLs for this topic. Do not include URLs that are already in `sources/web_research/`. Use the same schema as `do_build_research.md`:

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

12. Read newly fetched sources from `sources/web_research/` and their digests from `sources/digests/`.
13. Update (or create) the topic's wiki page:
    - Integrate new evidence with existing content.
    - Cite all new sources with links.
    - Surface new data points, statistics, and findings.
    - Address coverage gaps where new evidence fills them.
    - Follow BLUF structure: lead with key findings.
    - Do not remove existing well-sourced content. Add to it.
14. Read `project.md` for the directed outputs list. Identify outputs that depend on this topic.
15. Update directed outputs that depend on this topic:
    - Refresh sections that reference this topic with the new evidence.
    - Do not regenerate the entire output. Only update sections relevant to this topic.
16. Update `.build/topics.json` for this topic:
    - Increment `discovery.deepening_count`
    - Set `discovery.last_deepened` to the current ISO timestamp
    - Update `metrics.source_count` with the new source count
    - Update `metrics.word_count` with the wiki page's updated word count
    - Update `metrics.last_updated` to now
    - Clear any `coverage_gaps` that were addressed by the new evidence
    - Add any new coverage gaps discovered during synthesis
    - Auto-advance state using the multi-dimensional depth criteria below:
      - `shallow` → `deep` — ALL of the following must hold:
        1. **Source diversity:** 3+ sources spanning ≥2 distinct source types (e.g., government + trade press, academic + corporate filings). Count types from: primary_data, government, academic, corporate, trade_press, news, commentary.
        2. **Evidence specificity:** Wiki page contains ≥3 concrete, cited data points — named statistics, quantified claims, dated events, regulatory citations, or direct quotes from primary sources. Generic paraphrasing does not count.
        3. **Coverage gap progress:** Majority of original coverage gaps addressed (≤1 remaining gap).
        4. **Cross-referencing:** Wiki page explicitly connects findings to at least 1 dependency topic (shows how this topic relates to the broader project thesis). If the topic has no dependencies, this criterion is waived.
        5. **Contrarian evidence:** The page acknowledges at least 1 counterargument, limitation, or alternative interpretation of the findings.
      - `deep` → `saturated` — ALL of the following must hold:
        1. **Zero open coverage gaps.**
        2. **Source diversity:** 5+ sources spanning ≥3 distinct source types.
        3. **Evidence completeness:** All major claims have primary-source or government/academic backing (not just secondary reporting).
        4. **Cross-referencing:** Connected to 2+ other topics — the wiki page references findings from multiple related topics.
        5. **Contrarian completeness:** Key counterarguments and limitations are documented with source citations.
        6. **Downstream coverage:** All directed outputs that depend on this topic have been updated with its findings.
    - Update `metrics.source_types` with the list of distinct source types used (e.g., `["government", "academic", "trade_press"]`).
    - Update `metrics.data_point_count` with the number of concrete, cited data points in the wiki page.
    - Update `metrics.has_contrarian_evidence` to `true` if the wiki page documents counterarguments or limitations.
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
17. Update `outputs_ai/wiki/_index.md` with the updated BLUF for this topic's wiki page. Preserve the `[[wiki link]]` format for page names and source references (see `do_build.md` Step 25 for the canonical schema).
18. Update `sources/source_log.md` with the new sources.

### Phase 4: Snapshot

19. Update `.build/scratchpad.md` with any new cross-references, contradictions, or open threads discovered during deepening.
20. Git snapshot:
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
