# do_lint

Run health checks on the project, wiki, and directed outputs.

## Inputs

- `.harness-state.json`
- human requirement files
- `human_open_questions.md`
- `inputs_human/**`
- `inputs_ai/**`
- `outputs_ai/**`
- `change_logs/change_logs.md`
- `change_logs/annotation_change_logs.md`
- `change_logs/human_attention_queue.md`
- `change_logs/summaries/**`

## Checks

1. Required project files exist.
2. Required top-level folders exist, including `change_logs/`, `inputs_human/`, `inputs_ai/`, and `outputs_ai/`.
3. AI-managed paths are not left with unprocessed annotation changes.
4. Required source inventory exists under `inputs_ai/`.
5. Auxiliary human review context, such as `human_open_questions.md` when required by the project, is present but not counted as required source inventory unless `human_input_requirements.md` says otherwise.
6. Wiki state exists under the configured wiki path, defaulting to `outputs_ai/wiki/`.
7. `INDEX.md` and `schema.md` agree on topics and concepts.
8. Topic articles have required sections from `human_output_requirements.md`.
9. Topic articles list sources.
10. Every wiki page has a substantive `Summary` section.
11. Topic articles do not rely on link-only sections where source details should be summarized in the page.
12. Required sections are either filled with source-supported synthesis or explicitly marked `N/A - no source support yet` / open question.
13. Source-to-page coverage review has no unaddressed critical gaps.
14. Low-coverage sections are listed for review.
15. Potential contradictions are surfaced.
16. Directed outputs required by `human_output_requirements.md` exist.
17. Directed outputs cite wiki/source support.
18. Open questions are linked or surfaced in outputs where relevant.
19. The rebuild recorded a scaling assessment with selected mode, trigger signals, baseline safeguards, first scaling escalation status, broader rebuild status, and any required ledgers.
20. If scaling signals indicate `large_project_scaling` but the selected mode is simpler, the run summary gives a concrete, signal-specific explanation. A missing or generic explanation is a warning; an unexplained simpler mode with stale-output, blocked-output, low-coverage, or shallow-synthesis risk is critical.
21. Project-defined intermediate ledgers exist when final outputs require them or when the scaling assessment escalated to `large_project_scaling`.
22. Dependency or coverage ledgers do not show stale required outputs, missing required rows/items, or unresolved critical source gaps.
23. Logs are reverse chronological.
24. Human-attention metadata is internally consistent: if `.harness-state.json.extensions.human_attention.open_items` has entries, each item should have a stable `id`, a concise `summary`, and at least one actionable `resolution_options` entry with `id`, `attentionItemId`, `label`, `prompt`, `riskLevel`, `recommended`, and `createdAt`. `change_logs/human_attention_queue.md` should exist and the latest rebuild summary should include a human-attention section.
25. Existing rebuild summary metadata is internally consistent when `.harness-state.json.extensions.rebuild_summaries.latest_summary_path` is set. Because lint runs before the current run's summary is written, lint should only warn about missing `change_logs/summaries/`, missing summary metadata, or missing legacy summary files. The parent `do_all_rebuild.md` command is responsible for treating failure to write the current run's summary as a blocker before the Git snapshot.
26. **Required source categories (first-build and ongoing):** From `human_input_requirements.md`, derive required source categories and expected `inputs_ai/` leaf directories (including paths implied by the **Expected structure** tree). A category/path is **required** unless requirements **explicitly** mark it optional.
27. **`REQUIRED_SOURCE_CATEGORY_EMPTY` (critical, blocking):** No required `inputs_ai/` leaf directory may be empty or contain only placeholders (for example `.gitkeep` alone) without a **qualifying gap/status file** in that directory (e.g. `source_gap.md`, or `README.md` only if requirements specify it). Compare against `.harness-state.json.last_input_refresh.empty_required_without_gap` when present—must be **0** for a successful first acquisition to claim lint-clean required-source coverage.
28. **`REQUIRED_SOURCE_GAP_INCOMPLETE` (warning or critical):** Every gap/status file for a required category must state **attempted sources** (URLs, titles, or search paths), **what is missing**, **downstream impact**, and explicit **blocker status** (e.g. `blocks_outputs: true|false`). Missing any of these → emit at least **warning**; if conclusions could be materially misleading, use **critical**.
29. **First substantive input acquisition:** If the run is a first acquisition per the centralized `do_get_inputs.md` command (no prior successful input refresh or newly required categories not yet covered), lint **must not pass** with critical count zero while required categories are silently empty or gaps are incomplete—treat as blocking until populated or properly gapped.
30. **Subsequent builds:** If dependency maps, coverage ledgers, or `source_category_coverage.md` show a required category is **missing**, **stale**, or **not refreshed** while dependent wiki sections or directed outputs are marked current or were rebuilt without refreshing that category, emit **`STALE_OR_MISSING_SOURCE_FOR_OUTPUT`** as **warning** or **critical** (critical when high-impact outputs are affected).
31. **`TOP_OF_FILE_INTERNAL_METADATA` (warning):** Generated Markdown under `inputs_ai/**` or `outputs_ai/**` should not start with YAML/frontmatter-style internal build metadata unless the relevant human requirements explicitly require top-of-file frontmatter for a downstream tool. If a generated Markdown file begins with metadata keys such as `document_type`, `project`, `issued_for_cycle`, `generation_timestamp`, `primary_inputs`, `evidence_grade`, `source_record_id`, `publisher`, `public_url`, `source_access_provenance`, `normalized_timing_hint`, or path/routing notes, warn that useful technical metadata should be omitted or moved to a bottom section such as `Technical build notes`, `Source metadata`, or `Technical source notes`.

## Instructions

1. Read the configured paths from `.harness-state.json` and requirements.
2. Run each check above, including required-source category walks under `inputs_ai/` aligned with `human_input_requirements.md`. For the top-of-file metadata check, inspect generated Markdown under both `inputs_ai/**` and `outputs_ai/**`; skip the warning only when the relevant human requirements explicitly call for frontmatter at the top.
3. Group findings by severity:
   - `critical` blocks rebuild or use
   - `warning` should be reviewed
   - `info` is useful context
4. Update `.harness-state.json` with lint status. Each finding should include `severity`, `code`, `message`, `path`, `artifact`, and `blocking`.
5. Append or prepend a lint entry to `change_logs/change_logs.md` based on the project's log convention. Default to prepend.
6. Recommend the next command:
   - If critical findings are fixable by the current rebuild flow, recommend rerunning `../_kiss_ai/framework/commands/do_all_rebuild.md` after fixing the cited files.
   - If findings require a human decision, recommend reviewing `human_open_questions.md` or `change_logs/human_attention_queue.md` before rebuilding.
   - If only warnings or info findings remain, recommend reviewing the cited files and continuing with the normal rebuild workflow when ready.

## Output

Report:

- critical count
- warning count
- info count
- specific files to inspect
- recommended next command
