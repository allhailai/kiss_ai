# do_get_inputs

Create or refresh AI-managed source inputs according to `human_input_requirements.md`.

## Inputs

- `human_goal_requirements.md`
- `human_input_requirements.md`
- `human_open_questions.md`
- `inputs_human/**`
- existing `inputs_ai/**`
- `.harness-state.json`

## First-build vs subsequent builds

- **First substantive input acquisition:** treat as first build when `.harness-state.json` shows no prior successful input refresh, or when `human_input_requirements.md` adds required source categories or expected `inputs_ai/` paths not yet recorded as populated or explicitly gapped in the category coverage ledger. On first acquisition, **full coverage** is mandatory: every required category must be populated with source-backed files or documented with a qualifying gap file. Silent empty scaffold directories are not allowed.
- **Subsequent refreshes:** incremental updates are allowed when the category coverage ledger shows no required category in `empty_without_gap` state and dependency maps indicate unchanged categories do not affect rebuilt outputs. When uncertain, refresh more sources rather than fewer—especially for high-impact decision outputs.
- **Human uploads are optional unless required:** an empty or `.gitkeep`-only `inputs_human/` directory is expected and neutral when `human_input_requirements.md` does not explicitly require human-provided files. Do not create open questions, source gaps, or human-attention items solely because the human has not uploaded documents. If humans later add files, inventory and process them normally.

## Instructions

1. Read `human_input_requirements.md` in full.
2. Build a verified inventory of `inputs_human/` before drawing conclusions about available human-provided sources:
   - Use direct filesystem enumeration from the project root, such as `ls -la inputs_human` plus a recursive listing or a small script using standard filesystem APIs.
   - Do not rely on a single glob/search-tool result as the source of truth. If a glob, semantic search, or IDE index says `inputs_human/` is empty or only contains placeholder files, cross-check with direct filesystem enumeration before reporting that to the user.
   - Include hidden files, binary documents, and filenames with spaces or parentheses. Treat `.pptx`, `.pdf`, `.docx`, images, spreadsheets, and other non-Markdown files as real source inputs unless the project explicitly excludes them.
   - For every discovered file, decide whether it is readable directly, needs extraction/conversion, is a placeholder such as `.gitkeep`, or is intentionally out of scope.
   - If any non-placeholder file cannot be read or converted, add an open question and treat it as a fatal input blocker unless the project requirements explicitly allow excluding or deferring that file.
   - If no non-placeholder files are present and the requirements do not require human uploads, record the inventory as empty/optional and continue without asking the human to add files.
3. Determine the expected source inventory using `human_input_requirements.md`, `.harness-state.json`, and the verified `inputs_human/` inventory.
4. Ensure the required `inputs_ai/` folders exist. Use only the folders explicitly defined by the project requirements.
5. Read any source manifest or update runbook required by the project.
6. **First-build acquisition gate** (run when this run is a first substantive input acquisition per **First-build vs subsequent builds** above; also run when newly required categories appear):
   - Derive the **required source set** from `human_input_requirements.md`: every bullet under **Required Source Categories**, every path in the **Expected structure** / AI-managed tree, and every project-defined ledger or manifest file the requirements name as required.
   - Create or refresh **`inputs_ai/source_category_coverage.md`** as the **category coverage ledger**. For each required category or expected leaf directory, record: path, status (`populated` | `gapped` | `blocked` | `optional_per_requirements`), primary source file(s) or gap file path, `last_checked`, and whether downstream outputs may proceed for that category.
   - For each **required** leaf directory under `inputs_ai/` implied by requirements: ensure **either** at least one substantive, non-placeholder source file **or** an explicit gap file in that directory (e.g. `source_gap.md`, or `README.md` if requirements specify it) containing: URLs or titles attempted, why content is missing, downstream impact, and **`blocks_outputs: true|false`**.
   - **Do not** leave required leaf directories empty without a qualifying gap file on first acquisition.
   - When credible sources exist (official data, primary publications, project-approved URLs), **fetch or synthesize** into `inputs_ai/` per project schema. **Placeholder-only stubs do not satisfy** required coverage on first acquisition.
   - If a required category cannot be populated after reasonable attempts, write the gap file with `blocks_outputs: true` when material conclusions would be unsupported; continue downstream only when the gap is explicitly documented and generated outputs can carry the limitation as a caveat. Record counts in `.harness-state.json.last_input_refresh`: include `empty_required_without_gap` (must be **0** to proceed), `populated_categories`, `gapped_categories`, `blocked_categories`.
7. For initial population:
   - satisfy the first-build acquisition gate when applicable
   - create the required AI-managed source files in `inputs_ai/`
   - use the schema and quality standards from `human_input_requirements.md`
   - record source URLs and check dates when available
   - start generated Markdown source files with reader-facing source content such as a title, summary, claim note, gap status, or extraction note; do **not** put YAML/frontmatter-style technical metadata at the top unless `human_input_requirements.md` explicitly requires top-of-file frontmatter for a downstream tool
   - preserve useful source metadata, provenance, confidence, timing, and traceability details when they help review or future rebuilds, but put them at the bottom in a section such as `## Source metadata` or `## Technical source notes`; omit agent-only metadata that is already captured in `.harness-state.json`, ledgers, manifests, citations, or change logs
8. For refresh runs (when not solely establishing first acquisition):
   - compare existing source files against the required source inventory and **source_category_coverage.md**
   - check due dates, source URLs, file paths, source metadata, content hashes, modified times when available, and user-requested refresh scope
   - update files whose source material changed, whose metadata needs a check-date update, or whose categories are stale, missing, or newly required by updated requirements
   - when updating Markdown source files, keep any useful technical metadata at the bottom rather than reintroducing top-of-file YAML/frontmatter
   - prefer broader refresh when dependency maps are uncertain or when missing/stale categories could affect outputs (see **First-build vs subsequent builds**)
9. Collect source-side scaling signals for the rebuild-level scaling assessment:
   - number and size of human-owned files, including binary files;
   - number of generated source files;
   - number of source categories and distinct source schemas;
   - missing, changed, stale, unchanged, excluded, and unreadable sources;
   - source categories likely to affect different wiki pages or final outputs.
10. For projects already using `large_project_scaling`, or projects whose source-side signals meet or may meet the criteria in `framework/playbooks/large_project_scaling.md`, create or refresh any project-defined source inventory or source-category ledger required by `human_input_requirements.md`. It should identify missing, changed, stale, unchanged, excluded, and unreadable sources. If the needed ledger is not defined by project requirements, do not invent it here; carry that as a scaling-assessment blocker or deferred requirement decision.
11. Flag material changes when a source change affects:
   - allowed or disallowed actions
   - constraints or exceptions
   - source categories
   - target scope
   - downstream output conclusions
12. Identify likely downstream impact where possible: affected source categories, affected wiki pages, affected intermediate ledgers, affected final outputs, and outputs that may now be stale.
13. Add or update open questions in `human_open_questions.md` only when required source material is incomplete, unreadable, contradictory, or genuinely ambiguous. Do not ask whether the owner should populate `inputs_human/` merely because it is empty; humans will add files there when they have files to share.
14. Prepend requirement or source-process changes to `change_logs/change_logs.md`.
15. Update `.harness-state.json` with input refresh status, including the verified `inputs_human/` inventory, unreadable or excluded files, source inventory status, **category coverage ledger path and summary**, source-side scaling signals, stale sources, material changes, and likely downstream impact.

## Continuation Rules

Do not stop before downstream output generation solely because refreshed inputs may change final outputs. Record source changes and downstream impact clearly, then continue through the rebuild when execution is otherwise possible.

- If a required source category is added or removed, record the requirement change and update source coverage ledgers. Continue with the current best interpretation unless the requirements are impossible to satisfy.
- If a source file is excluded, record the exclusion, rationale, and affected outputs. Continue only when exclusion is allowed by requirements or when the file is not required for execution.
- If a non-placeholder file under `inputs_human/` cannot be read or converted, stop only when the file is required and no requirement allows deferring or excluding it.
- If a material source change would alter final outputs, record the material change and rebuild affected outputs with caveats.
- If project scope or required source organization changes, continue with current requirements and record the proposed change unless the current requirements become contradictory or impossible.
- If first-build acquisition has `empty_required_without_gap` > 0, create qualifying gap files or stop as a fatal acquisition error. Do not proceed with silent empty required categories.

## Output

Report:

- expected sources
- verified `inputs_human/` inventory
- sources checked
- sources created or updated
- first-build acquisition gate result (including `empty_required_without_gap`)
- source-side scaling signals
- source inventory or source-category ledger status, if any
- unreadable or excluded files
- material changes
- likely downstream impact
- open questions added or resolved
- downstream caveats, blockers, or limitations
