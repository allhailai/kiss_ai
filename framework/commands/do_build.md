# do_build

Run the full kiss_ai research project build.

This is the single build command. It reads the project brief, gathers or refreshes sources, processes annotations, generates or updates outputs, leaves AI suggestions, and snapshots the project in Git.

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

Web-triggered builds must not ask for mid-run human confirmation. When a decision would normally require user input, choose the conservative default, continue when technically possible, and leave an `<!-- AI_SUGGESTION: ... -->` marker in the relevant output file explaining what happened and what the user should review.

## File Ownership Model

Two categories of files exist in every project:

**User-owned (never overwritten by a build):**
- `project.md`
- `human_design_identity.md`
- `inputs_human/**`

**AI-managed (the build creates and updates these):**
- `sources/**`
- `outputs_ai/**`
- `questions.md`
- `.build/manifest.json`
- `change_logs/**`

Users interact with AI-managed files through `<!-- FEEDBACK: ... -->` annotation markers, never through direct editing. The build scans for these markers, applies the feedback, and removes them.

## Annotation Markers

Two marker types exist in AI-managed markdown files:

**`<!-- FEEDBACK: ... -->`** — User-to-AI feedback. Added by the user via the web UI [+] affordance. The build must process every FEEDBACK marker: apply the requested change, then remove the marker. If the feedback implies a lasting rule (e.g., "always sort this table by X"), also add the rule to the `## Output Guidance` section of `project.md`.

**`<!-- AI_SUGGESTION: ... -->`** — AI-to-user suggestion. Added by the build at the end of a run. These are informational. On the next build:
- Markers the user accepted (flagged via the web UI) are executed and removed.
- Markers the user dismissed are removed.
- Markers with no user action are left in place (carried forward).

## Instructions

### Phase 1: Read Context

1. Read `project.md` in full. This is the single source of truth for project goals, topics, context, constraints, directed output requirements, and output guidance.
2. Read `human_design_identity.md` for project identity and design tokens.
3. Read `.build/manifest.json` if it exists. If it does not exist, this is a first build.
4. Read `questions.md` if it exists. Scan each item under `## Open Questions` for a user-provided answer — the user answers inline by appending text such as `Answer:` to the question line. Collect all answered questions for processing in Phase 10. Treat unanswered open questions as context for the current build.
5. Read `outputs_ai/wiki/_index.md` if it exists. This is a lightweight table of contents for the wiki — it lists every wiki page with its BLUF summary, source references, and last-updated date. Use it to understand the current state of the wiki without reading every page. If this file does not exist, this is a first build.
6. Read `.build/scratchpad.md` if it exists. This is your working memory from the previous build — it contains key data points, cross-references, contradictions found, and open threads. Use it as context for the current build.
7. Read `.build/topic_graph.json` if it exists. This maps which topics depend on or reference other topics, and which sources support each topic. Use it to understand the project's knowledge structure and to determine which downstream outputs need updating when a source or topic changes.

### Phase 2: Scan Annotations

8. Scan all markdown files under `sources/**` and `outputs_ai/**` for `<!-- FEEDBACK: ... -->` markers. Collect them with their file path and position.
9. Scan all markdown files under `sources/**` and `outputs_ai/**` for `<!-- AI_SUGGESTION: ... -->` markers. The user flags suggestions via the UI: accepted markers contain `[ACCEPTED]` (e.g., `<!-- AI_SUGGESTION: [ACCEPTED] add a row ... -->`), dismissed markers contain `[DISMISSED]`. Unflagged markers are carried forward. Collect accepted suggestions for execution.
10. Remove `[DISMISSED]` AI_SUGGESTION markers from files (delete the entire HTML comment line).

### Phase 3: Follow Build Scope Directive

11. The build pipeline provides a `BUILD SCOPE` directive in the prompt. Follow it exactly:
   - If the prompt says **"BUILD SCOPE: project.md changed"** with a diff and affected outputs list, update only the listed affected outputs. Do not regenerate unchanged wiki pages or outputs.
   - If the prompt says **"FEEDBACK markers found in: ..."**, apply feedback to those files and their downstream dependents only.
   - If the prompt says **"BUILD SCOPE: project.md has NOT changed"**, only process FEEDBACK markers, accepted AI_SUGGESTION markers, and refresh dated reports. Do not regenerate wiki pages or directed outputs that have no pending markers.
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
    - If a file format cannot be read, leave an `AI_SUGGESTION` marker in the most relevant output file noting the gap and what format support is needed.
14. Do not ask the user to populate `inputs_human/` if it is empty. An empty `inputs_human/` is normal — the build proceeds with web research alone.

### Phase 5: Review Pre-Fetched Sources

Source files have been fetched and written to `sources/web_research/` by the build pipeline before this agent run. Source digests have been generated in `sources/digests/`. **Do not search the web.** Use only the pre-fetched sources.

15. Read `sources/source_log.md` to see what was fetched and what gaps exist.

16. Read all files in `sources/digests/`. These are compact summaries of each source containing key claims, data points, and relevance assessments. Use these to understand the evidence landscape without loading full article text. Each digest is ~200 words vs. the full source which may be 3,000+ words. Each digest includes a `Digest coverage` indicator:
    - **high** — the heuristic extracted good data points. You can rely on the digest for topic planning.
    - **medium** — partial extraction. The digest captures some data but the full source likely contains additional qualitative insights.
    - **low** — the heuristic could not extract meaningful data points (the source is likely qualitative, narrative, or in an unusual format). **Always read the full source** for low-coverage digests during Phase 7 and 8.

17. **Do not read full source files in `sources/web_research/` at this stage.** You will read specific full sources later in Phase 7 and 8, only when you are actively writing or updating a page that needs detailed evidence from that source. **Exception:** plan to read all low-coverage sources during synthesis — the digest alone is insufficient.

18. If `sources/source_log.md` shows gaps (Unfetched sources or missing topic coverage), leave an `AI_SUGGESTION` marker in the most relevant output file noting the gap and what sources to try on the next build.

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

### Phase 6: Apply Annotations

19. Process each collected FEEDBACK marker:
    - Read the feedback text and the surrounding content context.
    - Apply the requested change to the file.
    - Remove the `<!-- FEEDBACK: ... -->` marker.
    - If the feedback implies a lasting structural or formatting rule, add it to `project.md` under `## Output Guidance`. If that section does not exist, create it.
20. Execute each accepted AI_SUGGESTION:
    - Perform the suggested action (add a wiki page, split a file, refresh data, etc.).
    - Remove the `<!-- AI_SUGGESTION: ... -->` marker.

### Phase 7: Build Wiki

**Wiki pages must be built from gathered sources, not from `project.md` content.** The project brief defines *what* to research. The sources contain *what was found*. The wiki synthesizes the findings.

21. Determine the wiki structure based on `project.md` topics, the digests from Phase 5, and existing wiki pages (use `_index.md` if this is not a first build).
22. For each wiki topic that needs writing or updating:
    - **Read the full source files** from `sources/web_research/` that are relevant to *this specific topic only*. Use the digests and source log to identify which sources to load. Do not read sources that are irrelevant to the page you are currently writing.
    - On first build: generate the full page by synthesizing evidence from those sources. Every factual claim must cite a source file or URL. If no source supports a claim, do not include it — instead note `N/A — no source support yet`.
    - On subsequent builds: update current-data sections with fresh evidence. Leave stable analytical content (definitions, historical context, mechanisms) unless `project.md` has changed those topics or FEEDBACK markers request changes.
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
| topic_name.md | One-sentence summary of the key finding | source1.md, source2.md | YYYY-MM-DD |
```

This index is read by future builds (Phase 1, Step 5) to understand the wiki state without reading every page. Keep the BLUF column to one sentence.

### Phase 8: Build Directed Outputs

26. Read the directed outputs list from `project.md`. Each directed output should specify what it is and what it's for. The AI determines the appropriate structure, sections, and depth.
27. For each directed output:
    - Identify which wiki pages and source digests are relevant to this output. **Read full source files** from `sources/web_research/` only for sources that are directly needed for this specific output and were not already loaded during Phase 7.
    - On first build: generate the full output by synthesizing evidence from sources and wiki pages. Do not generate data that is not supported by gathered sources — instead flag gaps.
    - On subsequent builds: refresh current-data sections. Leave stable analytical content unless affected by a FEEDBACK marker or `project.md` change.
28. For dated reports (e.g., `outputs_ai/reports/YYYY_MM_DD_*.md`): always generate fresh for the current date. Do not overwrite prior dated reports.
29. All directed outputs should:
    - **Big Idea Up Front (BLUF):** Open with an executive summary or key-finding statement that gives the reader the most important conclusion immediately. Within each section, lead with the section-level takeaway before presenting supporting data. Within tables or dashboards, surface the most critical rows or rankings prominently. The reader should be able to stop reading at any level and still hold the most important information for that level.
    - Cite sources for every factual claim. If a claim has no source, mark it as unsourced.
    - Distinguish facts from forecasts, scenarios, and interpretations.
    - Surface low-confidence areas and evidence gaps explicitly.
    - Never present data fabricated from `project.md` descriptions as if it were researched. If `project.md` says "sulphuric acid consumption is 1.5–2.0 t/t Cu" and no gathered source confirms this, the output must flag it as "per project brief, unverified" — not present it as a research finding.
    - Follow any rules in `project.md` > Output Guidance.
    - Follow any constraints in `project.md` > Constraints.

### Phase 9: Validate

30. Run basic health checks:
    - All directed outputs listed in `project.md` exist.
    - Wiki pages exist and have content.
    - Wiki `_index.md` exists and matches the wiki pages.
    - Source log is current.
    - No unprocessed FEEDBACK markers remain (all must be applied or flagged).
31. **Source depth check**: verify that source digests in `sources/digests/` contain substantive key claims (not just metadata). Flag any thin digests with an `AI_SUGGESTION` marker recommending re-fetch on the next build.
32. **Evidence coverage check**: for each directed output, verify that key claims cite gathered sources. Flag unsourced claims with `AI_SUGGESTION` markers.
33. **Contradiction detection**: scan wiki pages and directed outputs for claims where two or more sources disagree on a data point, date, figure, or conclusion. For each contradiction found:
    - Note both claims and their sources in the relevant wiki page or output.
    - Indicate which source has higher confidence (per the Source Confidence Tiers).
    - If the contradiction is material to the project thesis, leave an `AI_SUGGESTION` marker recommending the user investigate.
34. If issues are found, leave `AI_SUGGESTION` markers in the relevant files rather than blocking the build.

### Phase 10: Leave AI Suggestions

35. After generating/updating outputs, scan the project for improvement opportunities. Leave `<!-- AI_SUGGESTION: ... -->` markers inline in relevant files. Limit to approximately 3-5 suggestions per build to avoid fatigue.

Suggest when:
- A wiki topic referenced in sources has no wiki page.
- An output file is very long and could be split for readability.
- A source is stale or thin (single secondary source for a key claim).
- User context in `project.md` is missing information that would improve outputs.
- A topic connection between outputs is missing.
- A new topic or directed output would serve the project goal.
- Two sources contradict each other on a material claim (from Step 33).

Each suggestion should be:
- Specific — points to a concrete file, section, or claim.
- Actionable — clear what happens if the user accepts.
- Self-contained — understandable without reading other files.

36. Process answered questions collected in Step 4:
    - For each answered question, determine where the answer should be applied: update `project.md` (e.g., add to `## Output Guidance` or `## Constraints`), adjust output content, or both.
    - Apply the answer: make the concrete changes to the relevant files so the answer is reflected in the project going forward.
    - Move the question from `## Open Questions` to `## Resolved Questions`, preserving both the original question text and the user's answer.
37. Add any new items to `## Open Questions` in `questions.md` that require user judgment or information the AI cannot infer. Do not duplicate items already present.

### Phase 11: Record and Snapshot

38. Update `.build/scratchpad.md` with working memory from this build:
    - Key data points discovered or updated during synthesis.
    - Cross-references found between topics.
    - Contradictions identified (from Step 33).
    - Open threads or areas needing deeper research.
    - This file is not user-facing. It is the agent's persistent working memory between builds. Keep it concise (~500 words max). Overwrite the previous scratchpad — do not append.

39. Create or update `.build/topic_graph.json` with the project's knowledge structure:

```json
{
  "topics": [
    {
      "id": "topic_slug",
      "label": "Human-readable topic name",
      "wiki_page": "outputs_ai/wiki/topic_slug.md",
      "sources": ["sources/web_research/source1.md", "sources/digests/source1.md"],
      "depends_on": ["other_topic_slug"],
      "outputs": ["outputs_ai/reports/report_name.md"]
    }
  ]
}
```

This graph maps which topics depend on other topics, which sources support each topic, and which directed outputs consume each topic. On subsequent builds, update incrementally — add new topics, remove deleted ones, update source references. The build pipeline will use this graph in the future to propagate scope changes.

40. Create or update `.build/manifest.json` with:
    ```json
    {
      "version": 1,
      "project_name": "...",
      "last_build": "ISO timestamp",
      "project_md_hash": "sha256 of project.md at build time",
      "scope": "full | targeted | refresh",
      "wiki_pages": ["list of wiki page filenames"],
      "directed_outputs": ["list of directed output filenames"],
      "sources_gathered": 0,
      "sources_refreshed": 0,
      "feedback_applied": 0,
      "suggestions_added": 0,
      "suggestions_accepted": 0,
      "suggestions_dismissed": 0,
      "inputs_human_inventory": ["list of files in inputs_human/"],
      "build_notes": "brief summary of what was done"
    }
    ```
41. Prepend a build entry to `change_logs/builds.md` with the build timestamp, scope, what was generated/updated, and any caveats.
42. **Git snapshot:** If the build completed without a fatal execution stop:
    - Run from the project root.
    - `git add -A .`
    - `git commit -m "kiss_ai build: <project_name> (YYYY-MM-DD)"`
    - If git commit fails, note the failure in the build log but do not block.

### First Build Baseline

43. On the very first build (no prior manifest), before generating AI content:
    - Initialize Git in the project root if not already a repo.
    - Create a human-authored baseline commit with only user-owned files:
      - `project.md`
      - `human_design_identity.md`
      - `inputs_human/**`
      - `questions.md` (if exists)
      - `README.md`
      - Placeholder files (`.gitkeep`) under `sources/`, `outputs_ai/`
    - Commit: `kiss_ai initial baseline: <project_name> (YYYY-MM-DD)`
    - Then proceed with the full build.

## Completion Message

Report:

- Build scope (full, targeted, or refresh).
- Sources gathered and refreshed.
- Wiki pages created or updated.
- Directed outputs created or updated.
- FEEDBACK markers applied.
- AI_SUGGESTION markers added (count and brief list).
- Questions added to `questions.md`.
- Git snapshot commit hash (or why it was skipped).
- Any caveats, issues, or items needing user attention.
