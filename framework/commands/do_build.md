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
4. Read `questions.md` if it exists, for context on unresolved decisions.

### Phase 2: Scan Annotations

5. Scan all markdown files under `sources/**` and `outputs_ai/**` for `<!-- FEEDBACK: ... -->` markers. Collect them with their file path and position.
6. Scan all markdown files under `sources/**` and `outputs_ai/**` for `<!-- AI_SUGGESTION: ... -->` markers. Check whether each has been accepted or dismissed by the user. Collect accepted suggestions for execution.
7. Remove dismissed `AI_SUGGESTION` markers from files.

### Phase 3: Determine Build Scope

8. Determine the build scope:
   - **First build** (no `.build/manifest.json` or `manifest.last_build` is null): full build. Generate everything.
   - **`project.md` changed** since the last build (compare file modification time or git diff against the manifest's recorded hash): re-evaluate scope. New topics or directed outputs require generation. Removed items can be left in place (don't delete user-visible files automatically — leave an `AI_SUGGESTION` to the user instead).
   - **FEEDBACK markers exist**: apply feedback to the specific files. This is a targeted update — only the annotated files and any downstream dependents need updating.
   - **Accepted AI_SUGGESTION markers**: execute the accepted suggestions.
   - **New or changed files in `inputs_human/`**: process new inputs, update affected source files and downstream outputs.
   - **Nothing changed**: refresh current-data sections of outputs. Re-fetch stale or perishable sources per `sources/source_log.md`. Generate new dated reports if the project requests them.

### Phase 4: Process Human Inputs

9. Build a verified inventory of `inputs_human/` using filesystem enumeration. Include all file types: markdown, PDF, DOCX, PPTX, XLSX, CSV, images, and any other documents.
10. For each non-placeholder file:
    - **Read the full content** of the file. For markdown and text files, read the entire file. For PDFs, extract all readable text. For spreadsheets and CSVs, extract the data.
    - Write a structured extraction to `sources/extracted/<filename_without_extension>.md` containing:
      - The original filename and path.
      - All substantive content from the file — data, arguments, claims, tables, figures described.
      - A brief summary of what the file contributes to the project.
    - If a file format cannot be read, leave an `AI_SUGGESTION` marker in the most relevant output file noting the gap and what format support is needed.
11. Do not ask the user to populate `inputs_human/` if it is empty. An empty `inputs_human/` is normal — the build proceeds with web research alone.

### Phase 5: Gather and Refresh Sources

This is the research phase. **The purpose is to find, read, and extract real evidence from the web — not to summarize search result snippets.** The quality of the entire build depends on this phase. Superficial source gathering produces superficial outputs.

12. Read `sources/source_log.md` if it exists. Determine which sources need refreshing based on:
    - Freshness status: `Perishable` sources are always re-fetched. `Current` sources with recent check dates are reused. `Stale` sources are refreshed.
    - New topics in `project.md` that have no source coverage.
    - FEEDBACK markers requesting source changes.

13. **Search the web** for evidence that supports, refutes, or expands on the topics and key questions in `project.md`. For each topic area, search for:
    - Primary sources: government data, corporate filings, annual reports, technical papers.
    - Secondary sources: trade press, industry analysis, expert commentary.
    - Contrarian sources: evidence that challenges the project thesis or assumptions.

14. **For each relevant result, fetch and read the full page content.** Do not stop at search snippets. Open the URL. Read the article, report, or data page. Extract the substantive information.

15. Write source files to `sources/web_research/`. Each source file must contain:
    - **Source metadata**: name, URL, type (government, corporate, trade press, academic), date published, date fetched.
    - **Extracted content**: the actual data, statistics, quotes, analysis, and findings from the source — not a one-line paraphrase of a search snippet. A good source note should be 200–1000+ words of extracted information depending on the source's depth.
    - **Key data points**: specific numbers, dates, named entities, and claims that are usable as evidence in outputs.
    - **Relevance**: which project topics and outputs this source supports.
    - **Confidence assessment**: how reliable this source is (primary vs. secondary, verified vs. estimated).

    **A source note that contains only a URL and a sentence of paraphrased search-snippet text is not a gathered source. It is a bookmark. Do not write bookmarks — write research extractions.**

16. Organize source files sensibly — flat or lightly grouped by topic. Do not impose a deep prescribed hierarchy.

17. Update `sources/source_log.md` with:
    - Each source: name, type, URL or path, last checked date, freshness status, which outputs it supports, and notes.
    - Gaps: missing coverage areas where sources could not be found or fetched.
    - Stale sources needing refresh on next build.
    - Unfetched URLs: if a page could not be loaded, record it as `Unfetched` with the reason. Do not cite unfetched URLs as evidence in outputs.

### Phase 6: Apply Annotations

18. Process each collected FEEDBACK marker:
    - Read the feedback text and the surrounding content context.
    - Apply the requested change to the file.
    - Remove the `<!-- FEEDBACK: ... -->` marker.
    - If the feedback implies a lasting structural or formatting rule, add it to `project.md` under `## Output Guidance`. If that section does not exist, create it.
19. Execute each accepted AI_SUGGESTION:
    - Perform the suggested action (add a wiki page, split a file, refresh data, etc.).
    - Remove the `<!-- AI_SUGGESTION: ... -->` marker.

### Phase 7: Build Wiki

**Wiki pages must be built from gathered sources, not from `project.md` content.** The project brief defines *what* to research. The sources contain *what was found*. The wiki synthesizes the findings.

20. Determine the wiki structure based on `project.md` topics, available sources, and existing wiki pages (if this is not a first build).
21. For each wiki topic:
    - On first build: generate the full page by synthesizing evidence from `sources/` files. Every factual claim must cite a source file or URL. If no source supports a claim, do not include it — instead note `N/A — no source support yet`.
    - On subsequent builds: update current-data sections with fresh evidence. Leave stable analytical content (definitions, historical context, mechanisms) unless `project.md` has changed those topics or FEEDBACK markers request changes.
22. The wiki structure is dynamic. The AI may add, split, merge, or rename pages when doing so improves readability and organization. When restructuring, mention the change in the build log entry.
23. Wiki pages should:
    - Begin with a Summary section.
    - Cite sources with links to source files or URLs for every factual claim.
    - Include specific data: numbers, dates, named entities, direct quotes where available.
    - Surface open questions near the end.
    - Mark sections with weak or no source support as `N/A — no source support yet`.
    - Be deep enough to stand alone — readers should understand the topic without opening other files.
    - **Never restate `project.md` content as if it were research findings.** `project.md` is the user's hypothesis and requirements. Wiki pages report what the evidence says.

### Phase 8: Build Directed Outputs

24. Read the directed outputs list from `project.md`. Each directed output should specify what it is and what it's for. The AI determines the appropriate structure, sections, and depth.
25. For each directed output:
    - On first build: generate the full output by synthesizing evidence from sources and wiki pages. Do not generate data that is not supported by gathered sources — instead flag gaps.
    - On subsequent builds: refresh current-data sections. Leave stable analytical content unless affected by a FEEDBACK marker or `project.md` change.
26. For dated reports (e.g., `outputs_ai/reports/YYYY_MM_DD_*.md`): always generate fresh for the current date. Do not overwrite prior dated reports.
27. All directed outputs should:
    - Cite sources for every factual claim. If a claim has no source, mark it as unsourced.
    - Distinguish facts from forecasts, scenarios, and interpretations.
    - Surface low-confidence areas and evidence gaps explicitly.
    - Never present data fabricated from `project.md` descriptions as if it were researched. If `project.md` says "sulphuric acid consumption is 1.5–2.0 t/t Cu" and no gathered source confirms this, the output must flag it as "per project brief, unverified" — not present it as a research finding.
    - Follow any rules in `project.md` > Output Guidance.
    - Follow any constraints in `project.md` > Constraints.

### Phase 9: Validate

28. Run basic health checks:
    - All directed outputs listed in `project.md` exist.
    - Wiki pages exist and have content.
    - Source log is current.
    - No unprocessed FEEDBACK markers remain (all must be applied or flagged).
29. **Source depth check**: verify that source files in `sources/web_research/` contain substantive extracted content (not just URLs and one-line summaries). Flag any thin source notes with an `AI_SUGGESTION` marker recommending re-fetch on the next build.
30. **Evidence coverage check**: for each directed output, verify that key claims cite gathered sources. Flag unsourced claims with `AI_SUGGESTION` markers.
31. If issues are found, leave `AI_SUGGESTION` markers in the relevant files rather than blocking the build.

### Phase 10: Leave AI Suggestions

32. After generating/updating outputs, scan the project for improvement opportunities. Leave `<!-- AI_SUGGESTION: ... -->` markers inline in relevant files. Limit to approximately 3-5 suggestions per build to avoid fatigue.

Suggest when:
- A wiki topic referenced in sources has no wiki page.
- An output file is very long and could be split for readability.
- A source is stale or thin (single secondary source for a key claim).
- User context in `project.md` is missing information that would improve outputs.
- A topic connection between outputs is missing.
- A new topic or directed output would serve the project goal.

Each suggestion should be:
- Specific — points to a concrete file, section, or claim.
- Actionable — clear what happens if the user accepts.
- Self-contained — understandable without reading other files.

33. Update `questions.md` with any new items that require user judgment or information the AI cannot infer. Do not duplicate items already in `questions.md`.

### Phase 11: Record and Snapshot

34. Create or update `.build/manifest.json` with:
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
35. Prepend a build entry to `change_logs/builds.md` with the build timestamp, scope, what was generated/updated, and any caveats.
36. **Git snapshot:** If the build completed without a fatal execution stop:
    - Run from the project root.
    - `git add -A .`
    - `git commit -m "kiss_ai build: <project_name> (YYYY-MM-DD)"`
    - If git commit fails, note the failure in the build log but do not block.

### First Build Baseline

37. On the very first build (no prior manifest), before generating AI content:
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
