# Skill: Compile Wiki

Compile configured source paths, including `inputs_ai/**` and any wiki source paths named in `human_output_requirements.md`, into topic and concept articles under the configured wiki path. Default to `outputs_ai/wiki/`; use a different wiki root only when project requirements explicitly define one.

This adapts the useful knowledge-mode ideas from `llm-wiki-compiler` without depending on the plugin.

## Inputs

- Wiki requirements extracted from `human_output_requirements.md`.
- Source files under configured wiki source paths, including `inputs_ai/**` and human-owned Markdown files under `inputs_human/**` when named by the requirements.
- Binary human sources represented through verified inventory and generated extraction files.
- Auxiliary human review context named by the project, such as `human_open_questions.md`.
- Existing `outputs_ai/wiki/schema.md`, if present.
- Existing `outputs_ai/wiki/.compile-state.json`, if present.
- Existing schema and compile-state files under a project-configured wiki path, if the requirements explicitly define one.

## Phase 1: Scan Sources

1. Parse the wiki source paths, article section rules, topic hints, citation rules, and coverage rules from `human_output_requirements.md`.
2. Build the source set as the union of:
   - every path listed under wiki source paths in `human_output_requirements.md`;
   - all generated source Markdown under `inputs_ai/**`;
   - human-owned Markdown under `inputs_human/**` when `inputs_human/` is named as a wiki source path;
   - binary human sources represented by `inputs_ai/**` extraction/inventory files.
3. List markdown source files from that source set.
4. Exclude generated wiki and directed output paths unless they are explicitly being used as prior context.
5. Separate required source inventory from auxiliary context unless the requirements explicitly combine them.
6. Read prior compile state.
7. Compare file paths, mtimes, content hashes, and source metadata when available.
8. Identify new, changed, deleted, stale, and unchanged sources.
9. On first run, treat all discovered files as new.

## Phase 2: Build Source-To-Page Map

1. Read title, frontmatter, headings, tables, and salient factual excerpts for each source. Do not stop at the first excerpt when later sections contain source details needed by the wiki requirements.
2. Use topic hints from `human_output_requirements.md`.
3. Prefer existing slugs from `schema.md`.
4. Apply any project-defined naming rules, such as required filename prefixes, suffixes, or slug conventions.
5. Allow one source to belong to multiple topics.
6. Group unclassified files when a recurring theme appears.
7. For each intended page, create a source ledger containing:
   - assigned source files;
   - salient facts, tables, workflow steps, examples, caveats, and open questions to incorporate;
   - required article sections from `human_output_requirements.md`;
   - source gaps and low-confidence mappings.
8. Use lowercase kebab-case slugs unless requirements specify a prefix or other naming convention.
9. Mark low-confidence classification decisions for review.

## Phase 3: Compile Topic Articles Page By Page

For every topic with changed source coverage, stale source coverage, uncertain source mapping, or when requirements request a full-topic refresh:

1. Read all source files assigned to the topic, not only changed files.
2. Use article sections from `human_output_requirements.md`.
3. Write to `{configured-wiki-path}/topics/{topic-slug}.md`.
4. Start every wiki page with a `Summary` section that gives a thorough but concise overview of the page, including the most important source-supported details and review caveats.
5. Fill every required section with specific factual synthesis from the full source bundle.
6. Do not use link-only sections such as "see extracted source" as a substitute for incorporating concrete source content. Links are for traceability, not for replacing synthesis.
7. If a required section lacks source support, include the section with `N/A - no source support yet` or an explicit open question rather than omitting it.
8. Render section headings with lower visual weight than body content, and render coverage as a small annotation:
   - Use HTML for generated second-level wiki section headings: `<h2 style="color: var(--text-muted); font-weight: 500;">What Works <small style="color: var(--text-faint); font-weight: 400;">[coverage: high -- N sources]</small></h2>`
   - For headings without coverage, use: `<h2 style="color: var(--text-muted); font-weight: 500;">Sources</h2>`
   - Do not render coverage as full-size heading text.
   - Do not write a separate paragraph containing only `[coverage: ...]`.
9. Include source links using the configured link style. Source references must be navigable links, not code-formatted paths:
   - For source files outside the wiki folder, prefer relative Markdown links from the generated file to the target, for example `[inputs_ai/example.md](../../../inputs_ai/example.md)`.
   - URL-encode spaces and punctuation in Markdown link targets when needed.
   - Use code formatting only when describing a path literally, not when the path is meant to be clicked.
10. Surface unresolved questions rather than hiding gaps.

## Phase 4: Coverage Review

After topic articles are written:

1. Re-read each page's source ledger and the generated page.
2. Check whether every salient fact, workflow step, table row, example, material caveat, and open question from the source ledger is incorporated or explicitly waived.
3. Check that every required section is present, cited, and non-empty unless marked `N/A - no source support yet`.
4. Check that every page has a meaningful `Summary` section.
5. Flag shallow pages, missing required sections, link-only sections, missing source citations, stale source coverage, and unincorporated source facts.
6. If critical gaps remain, mark the compile status as `needs_review` rather than `success` and list the pages and sections that need review.

## Phase 5: Compile Concept Articles

After topic articles are written:

1. Read topic articles.
2. Identify patterns spanning at least three topics.
3. Prefer existing concept slugs from `schema.md`.
4. Create concept articles only when the pattern adds useful synthesis.
5. Write to `{configured-wiki-path}/concepts/{concept-slug}.md`.

Concept articles should answer why a cross-topic pattern matters, not just summarize facts.

Concept and strategy pages should be deep enough to stand alone. When requirements name a concept, explain definitions, examples, mechanism, measurement implications, dependencies, review caveats, and source limits in the page body.

## Phase 6: Update Schema

If `schema.md` does not exist:

1. Generate it from the discovered topic and concept list.
2. Include naming conventions and article structure.
3. Add an evolution log entry.

If it exists:

1. Preserve human-approved topic and concept names.
2. Add new topics/concepts with an evolution log entry.
3. Do not remove topics/concepts without approval.
4. **Merge schema annotations:** Read recent entries in `change_logs/annotation_change_logs.md` that reference the configured wiki `schema.md` path. Where a human logged an approved or pending schema change, **incorporate that intent into the updated `schema.md`** (rows, descriptions, naming conventions, evolution log lines) instead of overwriting the file from compile output alone. If intent conflicts with new sources or `human_output_requirements.md`, surface the conflict in the compile summary and in `human_open_questions.md` rather than silently dropping the human edit.

## Phase 7: Update Index

Always regenerate `{configured-wiki-path}/INDEX.md` with:

- project/wiki name
- compile date
- total topics
- total concepts
- total sources
- topic table
- concept table
- recent changes

Index rows must use clickable links for topic and concept files, not code-formatted paths. In Markdown tables, prefer relative Markdown links plus a separate title column, for example `| [topics/example.md](topics/example.md) | Example |`.

When the configured link style is Obsidian links, do not place aliased wiki links with raw pipes inside Markdown table cells. A raw link such as `[[topics/example|Example]]` inside a table is parsed as a table delimiter by many Markdown renderers and Obsidian previews. Prefer one of these safe patterns:

- In tables, use an unaliased link plus a separate title column: `| [[topics/example]] | Example |`.
- Outside tables, aliased links are fine: `[[topics/example|Example]]`.
- If an alias is unavoidable inside a table cell, escape the alias separator as `[[topics/example\|Example]]`.

## Phase 8: Update State and Log

Update:

- `{configured-wiki-path}/.compile-state.json`
- `{configured-wiki-path}/log.md`
- `.harness-state.json`, including affected, unchanged, stale, and uncertain pages; low-confidence pages; source-to-page ledger status; and any preservation decisions for unchanged pages

## Completion Summary

Return:

- topics created
- topics updated
- concepts created/updated
- source count
- required sections satisfied / waived per topic
- source ledger coverage warnings
- low-coverage sections
- open questions
- files written
