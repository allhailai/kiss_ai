# do_build

Run the kiss_ai knowledge build for a research project.

This is the knowledge pipeline command. It reads the project brief, gathers or refreshes sources, processes annotations, builds the wiki, acts on gaps autonomously, and snapshots the project in Git. It does NOT build directed outputs (reports/artifacts) — those are built separately via the Reports and Artifacts pages.

## Preconditions

- Run from the project root.
- The canonical framework is outside the project root at sibling path `../_kiss_ai/framework/` unless the user provides an explicit `KISS_AI_FRAMEWORK_ROOT`.
- Do not recreate or depend on a project-local `framework/` folder.
- The project root is its own Git root.
- These files exist:
  - `project.md`
  - `human_design_identity.md`
  - `change_logs/builds.md`
- These folders exist:
  - `inputs_human/`
  - `sources/`
  - `outputs_ai/`
  - `change_logs/`
  - `.build/`

## Non-Interactive Runtime Contract

Web-triggered builds must not ask for mid-run human confirmation. When a decision would normally require user input, choose the conservative default, continue when technically possible, and log the decision in the build entry (`change_logs/builds.md`).

## File Ownership Model

Two categories of files exist in every project:

**User-owned (never overwritten by a build):**
- `project.md`
- `human_design_identity.md`
- `inputs_human/**`
- `outputs_ai/reports/**` (user-editable reports — rebuilt only on user request)

**AI-managed (the knowledge build creates and updates these):**
- `sources/**`
- `outputs_ai/wiki/**`
- `.build/questions.json`
- `.build/manifest.json`
- `change_logs/**`

Users interact with AI-managed files through `<!-- COMMENT: ... -->` annotation markers, never through direct editing. The build scans for these markers, applies the feedback, and removes them. Legacy `<!-- FEEDBACK: ... -->` markers are treated identically.

## Annotation Markers

One marker type exists in AI-managed markdown files:

**`<!-- COMMENT: ... -->`** — User-to-AI feedback. Added by the user via the web UI [+] affordance. The build must process every COMMENT marker: apply the requested change, then remove the marker. If the feedback implies a lasting rule (e.g., "always sort this table by X"), also add the rule to the `## Output Guidance` section of `project.md`. Legacy `<!-- FEEDBACK: ... -->` markers must be handled identically.

## Instructions

### Phase 1: Read Context

1. Read `project.md` in full. This is the single source of truth for project goals, topics, context, constraints, and output guidance.
2. Read `human_design_identity.md` for project identity and design tokens.
3. Read `.build/manifest.json` if it exists. If it does not exist, this is a first build.
4. Read `.build/questions.json` if it exists. Check for questions with `status: "answered"` that have not yet been applied. Collect these for processing in Phase 9. Treat open questions as context for the current build. If this file does not exist, there are no prior questions.
5. Read `outputs_ai/wiki/_index.md` if it exists. This is a lightweight table of contents for the wiki — it lists every wiki page with its BLUF summary, source references, and last-updated date. Use it to understand the current state of the wiki without reading every page. If this file does not exist, this is a first build.
6. Read `.build/scratchpad.md` if it exists. This is your working memory from the previous build — it contains key data points, cross-references, contradictions found, and open threads. Use it as context for the current build.
7. Read `.build/topics.json` if it exists. This is the living topic taxonomy. Each topic has a `state` (seed/shallow/deep/saturated/split_candidate/deprecated), a `disposition` (null/parked/settled), sources, dependencies, and justification. Use it to understand the project's knowledge structure and determine which wiki pages need updating.
   - **Do not modify topics the user has `parked` or `settled`** — these are user-owned disposition decisions. Still update their `metrics` and `sources` if new evidence was found, but do not expand scope or change state.
   - **Do not re-add topics the user has `deprecated`** — these are intentional removals.
   - **If you discover new topics** from sources or evidence that don't exist in `topics.json`, add them with `state: "seed"`, `confidence: "low"`, and `origin: "agent_discovered"` so the user can review them.
   - If `.build/topics.json` does not exist but `.build/topic_graph.json` does, ignore the legacy file — the build pipeline handles migration automatically.

### Phase 2: Scan Annotations

8. Scan all markdown files under `sources/**` and `outputs_ai/wiki/**` for `<!-- COMMENT: ... -->` and `<!-- FEEDBACK: ... -->` markers. Collect them with their file path and position.

### Phase 3: Follow Build Scope Directive

11. The build pipeline provides a `BUILD SCOPE` directive in the prompt. Follow it exactly:
   - If the prompt says **"BUILD SCOPE: project.md changed"** with a diff and affected wiki pages list, update only the listed affected wiki pages. Do not regenerate unchanged wiki pages.
   - If the prompt says **"COMMENT markers found in: ..."**, apply feedback to those files and their downstream dependents only.
   - If the prompt says **"BUILD SCOPE: project.md has NOT changed"**, only process COMMENT markers and refresh dated wiki pages. Do not regenerate wiki pages that have no pending markers.
   - If **no BUILD SCOPE directive is present**, this is a first build — generate everything.
   - **Do not override the provided scope.** Do not choose a broader scope than instructed. The pipeline has already determined what changed.

### Phase 4: Process Human Inputs

12. Build a verified inventory of `inputs_human/` using filesystem enumeration. Include all file types: markdown, PDF, DOCX, PPTX, XLSX, CSV, images, and any other documents.
13. For each non-placeholder file:
    - Check if `sources/extracted/<filename_without_extension>.md` already exists and is current. If the human input file has not changed since the last extraction, skip it.
    - If the file is new or changed, **read the full content**. For markdown and text files, read the entire file. For PDFs, extract all readable text. For spreadsheets and CSVs, extract the data.
    - Write a structured extraction to `sources/extracted/<filename_without_extension>.md` containing:
      - The original filename and path.
      - All substantive content from the file — data, arguments, claims, tables, figures described.
      - A brief summary of what the file contributes to the project.
    - If a file format cannot be read, add a coverage_gap entry to the most relevant topic in `.build/topics.json` noting the gap and what format support is needed.
14. Do not ask the user to populate `inputs_human/` if it is empty. An empty `inputs_human/` is normal — the build proceeds with web research alone.

### Phase 5: Review Pre-Fetched Sources

Source files have been fetched and written to `sources/web_research/` by the build pipeline before this agent run. Source digests have been generated in `sources/digests/`. **Do not search the web.** Use only the pre-fetched sources.

15. Read `sources/source_log.md` to see what was fetched and what gaps exist.

16. Read all files in `sources/digests/`. These are compact summaries of each source containing key claims, data points, and relevance assessments. Use these to understand the evidence landscape without loading full article text. Each digest is ~200 words vs. the full source which may be 3,000+ words. Each digest includes a `Digest coverage` indicator:
    - **high** — the heuristic extracted good data points. You can rely on the digest for topic planning.
    - **medium** — partial extraction. The digest captures some data but the full source likely contains additional qualitative insights.
    - **low** — the heuristic could not extract meaningful data points (the source is likely qualitative, narrative, or in an unusual format). **Always read the full source** for low-coverage digests during Phase 7.

17. **Do not read full source files in `sources/web_research/` at this stage.** You will read specific full sources later in Phase 7, only when you are actively writing or updating a page that needs detailed evidence from that source. **Exception:** plan to read all low-coverage sources during synthesis — the digest alone is insufficient.

18. If `sources/source_log.md` shows gaps (Unfetched sources or missing topic coverage), add structured `coverage_gaps` entries to the relevant topics in `.build/topics.json` with `search_hints` and `target_urls` so the pipeline can fetch them on the next build.

#### Source Confidence Tiers

When evaluating sources and resolving conflicting data, use this confidence ranking (highest to lowest):

1. **Primary data** — official statistics, raw datasets, registries, direct measurements
2. **Government/institutional reports** — regulatory agency publications, statutory text, intergovernmental organization data
3. **Academic/peer-reviewed** — peer-reviewed research, systematic reviews, working papers from recognized institutions
4. **Official organizational disclosures** — annual reports, filings, formal program documentation, published guidelines
5. **Specialized/trade press** — industry-specific publications, professional association reports, consultancy analysis
6. **General news** — major wire services, established newspapers, reputable journalism
7. **Commentary/unvetted** — opinion pieces, blog posts, social media, unverified claims

When two sources conflict, favor the higher-ranked source and note the disagreement explicitly.

### Phase 6: Apply Feedback

19. Process each collected COMMENT/FEEDBACK marker:
    - Read the feedback text and the surrounding content context.
    - Apply the requested change to the file.
    - Remove the `<!-- COMMENT: ... -->` or `<!-- FEEDBACK: ... -->` marker.
    - If the feedback implies a lasting structural or formatting rule, add it to `project.md` under `## Output Guidance`. If that section does not exist, create it.

### Phase 7: Build Wiki

**Wiki pages must be built from gathered sources, not from `project.md` content.** The project brief defines *what* to research. The sources contain *what was found*. The wiki synthesizes the findings.

21. Determine the wiki structure based on `project.md` topics, the digests from Phase 5, and existing wiki pages (use `_index.md` if this is not a first build).
22. For each wiki topic that needs writing or updating:
    - **Read the full source files** from `sources/web_research/` that are relevant to *this specific topic only*. Use the digests and source log to identify which sources to load. Do not read sources that are irrelevant to the page you are currently writing.
    - On first build: generate the full page by synthesizing evidence from those sources. Every factual claim must cite a source file or URL. If no source supports a claim, do not include it — instead note `N/A — no source support yet`.
    - On subsequent builds: update current-data sections with fresh evidence. Leave stable analytical content (definitions, historical context, mechanisms) unless `project.md` has changed those topics or COMMENT markers request changes.
    - **Contradiction detection:** While synthesizing, scan for claims where two or more sources disagree on a data point, date, figure, or conclusion. For each contradiction found:
      - Note both claims and their sources in the wiki page.
      - Indicate which source has higher confidence (per the Source Confidence Tiers).
      - If the contradiction is material to the project thesis, create a **question** in `.build/questions.json` asking the user which interpretation should guide the project.
23. The wiki structure is dynamic. The AI may add, split, merge, or rename pages when doing so improves readability and organization. When restructuring, mention the change in the build log entry.
24. Wiki pages should:
    - **Big Idea Up Front (BLUF):** Begin with an executive summary that states the most important finding or conclusion from the gathered evidence. The reader should understand the key takeaway without reading further. Then within each section and subsection, lead with the section-level conclusion or key finding before expanding into supporting evidence and detail. The goal: a reader can stop at any depth and still have the most important information for that level.
    - Cite sources with links to source files or URLs for every factual claim.
    - Include specific data: numbers, dates, named entities, direct quotes where available.
    - Surface open questions near the end.
    - Mark sections with weak or no source support as `N/A — no source support yet`.
    - Be deep enough to stand alone — readers should understand the topic without opening other files.
    - **Never restate `project.md` content as if it were research findings.** `project.md` is the user's hypothesis and requirements. Wiki pages report what the evidence says.
25. After writing all wiki pages, generate or update `outputs_ai/wiki/_index.md` with this structure:

```markdown
# Wiki Index

| Page | BLUF | Sources | Last Updated |
|------|------|---------|-------------|
| [[outputs_ai/wiki/topic_name]] | One-sentence summary of the key finding | [[sources/web_research/source1.md]], [[sources/web_research/source2.md]] | YYYY-MM-DD |
```

Use `[[wiki links]]` for page names and source references so they are navigable in the web UI. For source references, use the full relative path (e.g. `[[sources/web_research/mining_com__slug.md]]`) so the link resolution system can match them to actual files. This index is read by future builds (Phase 1, Step 5) to understand the wiki state without reading every page. Keep the BLUF column to one sentence.

### Phase 8: Act on Gaps and Process Questions

26. After building the wiki, identify improvement opportunities and **act on them directly**:
    - Missing wiki page for an evidenced topic → create it now.
    - Wiki page too long → split it now.
    - Thin source digest → add a structured `coverage_gap` to the relevant topic with a re-fetch target.
    - Missing source for a key claim → add a structured `coverage_gap` with `search_hints`.
    - Source contradiction (immaterial) → favor higher-ranked source, note inline.
    - Source contradiction (material to project thesis) → create a **question**.
    - A new topic would serve the project goal → add it as a seed topic.

    Act directly or delegate to the pipeline via `coverage_gaps` in `.build/topics.json`.

27. **Question gate:** Before creating any question in `.build/questions.json`, apply the public/private test:
    - If the answer could come from a publicly available source (statutes, regulations, published documents, government databases), do NOT create a question. Add a structured `coverage_gap` to the relevant topic and let the pipeline fetch it on the next build.
    - If the answer requires private information only the human has (business relationships, contract terms, strategic judgment, proprietary data), create a question.
    - If a `coverage_gap` has persisted for 2+ builds without resolution (check the `attempts` field), THEN escalate to a question explaining what the AI already tried.

28. **Auto-answer open questions from evidence:** Before processing human-answered questions, review every question in `.build/questions.json` with `status: "open"`. For each one:
    - Check whether the sources gathered in this build (or resolved `coverage_gaps`) now contain the answer.
    - If the answer is clearly supported by gathered evidence, auto-answer it:
      - Set `status: "answered"`.
      - Set `answer` to a concise answer citing the source(s).
      - Set `answeredBy: "ai_auto"` and `answeredAt` to the current ISO timestamp.
    - If the answer is partially available but not conclusive, leave the question open — do not guess.
    - This step ensures questions don't linger when the pipeline has already fetched the information needed to resolve them.

29. Process answered questions collected in Step 4 **and any auto-answered in Step 28** (from `.build/questions.json`):
    - For each question with `status: "answered"`, determine where the answer should be applied: update `project.md` (e.g., add to `## Output Guidance` or `## Constraints`), adjust wiki content, or both.
    - Apply the answer: make the concrete changes to the relevant files so the answer is reflected in the project going forward.
    - Update the question's status to `"applied"` in `.build/questions.json`.
30. If the build prompt includes raw `BUILD_QUESTION` markers for consolidation, consolidate them into `.build/questions.json` (merging duplicates, preserving highest priority, preserving existing answered/applied questions). Before writing each question, apply the question gate (Step 27) — convert publicly-researchable questions to coverage_gaps instead.

### Phase 9: Record and Snapshot

31. Update `.build/scratchpad.md` with working memory from this build:
    - Key data points discovered or updated during synthesis.
    - Cross-references found between topics.
    - Contradictions identified.
    - Open threads or areas needing deeper research.
    - This file is not user-facing. It is the agent's persistent working memory between builds. Keep it concise (~500 words max). Overwrite the previous scratchpad — do not append.

32. Create or update `.build/topics.json` with the project's knowledge structure using the v2 schema:

```json
{
  "version": 2,
  "last_updated": "ISO timestamp",
  "topics": [
    {
      "id": "topic_slug",
      "label": "Human-readable topic name",
      "state": "seed|shallow|deep|saturated|split_candidate|deprecated",
      "confidence": "high|low",
      "depth": 0,
      "parent": null,
      "children": [],
      "cluster": null,
      "wiki_page": "outputs_ai/wiki/topic_slug.md",
      "sources": [{"path": "sources/web_research/source1.md", "relevance": 0.9, "added_at": "ISO"}],
      "depends_on": ["other_topic_slug"],
      "outputs": ["outputs_ai/reports/report_name.md"],
      "justification": {
        "goal_support": "Why this topic supports the project goals",
        "graph_support": "How this connects to other topics",
        "questions_addressed": []
      },
      "discovery": {
        "origin": "agent_discovered|user_suggestion|legacy_migration",
        "discovered_at": "ISO",
        "discovered_from": "research_plan|evidence|user",
        "reason": "Why this topic was added",
        "last_deepened": null,
        "deepening_count": 0
      },
      "deprecation": null,
      "metrics": {
        "source_count": 3,
        "cross_references": 2,
        "word_count": 4500,
        "last_updated": "ISO"
      },
      "coverage_gaps": [
        {
          "description": "Human-readable description of what is missing",
          "search_hints": ["search query 1", "search query 2"],
          "target_urls": ["https://specific-url-to-fetch"],
          "reason": "Why this gap matters for the project",
          "attempts": 0,
          "first_noted": "ISO timestamp"
        }
      ],
      "disposition": null,
      "disposition_at": null,
      "disposition_note": null
    }
  ],
  "clusters": []
}
```

Behavioral rules for updating topics:
- **Existing non-deprecated, non-seed topics:** Update `sources`, `outputs`, `metrics`, `coverage_gaps`. Auto-advance `state` from `shallow` → `deep` if evidence is now substantial (3+ sources with specific data points, wiki page has 1000+ words of sourced content). Advance `deep` → `saturated` if all coverage gaps are addressed and the topic has 5+ sources.
- **Newly discovered topics:** Add as `state: "seed"`, `confidence: "low"`, `origin: "agent_discovered"`, with `justification.goal_support` explaining why this topic is relevant to the project.
- **Deprecated topics:** Preserve as-is. Do not re-add, reactivate, or modify.
- **Parked/settled topics:** Preserve `disposition`, `disposition_at`, `disposition_note`. Update `metrics` and `sources` if new evidence was found, but do not change `state` or expand scope.
- **Do not delete `.build/topic_graph.json`** — the build pipeline handles legacy cleanup automatically.

33. Create or update `.build/manifest.json` with:
    ```json
    {
      "version": 1,
      "project_name": "...",
      "last_build": "ISO timestamp",
      "project_md_hash": "sha256 of project.md at build time",
      "scope": "full | targeted | refresh",
      "wiki_pages": ["list of wiki page filenames"],
      "sources_gathered": 0,
      "sources_refreshed": 0,
      "feedback_applied": 0,
      "coverage_gaps_written": 0,
      "autonomous_actions": 0,
      "inputs_human_inventory": ["list of files in inputs_human/"],
      "build_notes": "brief summary of what was done"
    }
    ```
34. Prepend a build entry to `change_logs/builds.md` with the build timestamp, scope, what was generated/updated, and any caveats.
35. **Git snapshot:** If the build completed without a fatal execution stop:
    - Run from the project root.
    - `git add -A .`
    - `git commit -m "kiss_ai build: <project_name> (YYYY-MM-DD)"`
    - If git commit fails, note the failure in the build log but do not block.

### First Build Baseline

36. On the very first build (no prior manifest), before generating AI content:
    - Initialize Git in the project root if not already a repo.
    - Create a human-authored baseline commit with only user-owned files:
      - `project.md`
      - `human_design_identity.md`
      - `inputs_human/**`
      - `.build/questions.json` (if exists)
      - `README.md`
      - Placeholder files (`.gitkeep`) under `sources/`, `outputs_ai/`
    - Commit: `kiss_ai initial baseline: <project_name> (YYYY-MM-DD)`
    - Then proceed with the full build.

## Completion Message

Report:

- Build scope (full, targeted, or refresh).
- Sources gathered and refreshed.
- Wiki pages created or updated.
- COMMENT markers applied.
- Coverage gaps written to `.build/topics.json` (count and brief list).
- Autonomous actions taken (file splits, wiki pages added, etc.).
- Questions consolidated and written to `.build/questions.json`.
- Git snapshot commit hash (or why it was skipped).
- Any caveats, issues, or items needing user attention.
