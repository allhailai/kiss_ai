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
- centralized `_kiss_ai/framework/**` (for the optional `CENTRAL_FRAMEWORK_UNREVIEWED_CHANGES` check when Git is available)

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
24. Human-attention metadata is internally consistent: if `.harness-state.json.extensions.human_attention.open_items` has entries, `change_logs/human_attention_queue.md` should exist and the latest rebuild summary should include a human-attention section.
25. Existing rebuild summary metadata is internally consistent when `.harness-state.json.extensions.rebuild_summaries.latest_summary_path` is set. Because lint runs before the current run's summary is written, lint should only warn about missing `change_logs/summaries/`, missing summary metadata, or missing legacy summary files. The parent `do_all_rebuild.md` command is responsible for treating failure to write the current run's summary as a blocker before the framework guard and Git snapshot.
26. **Required source categories (first-build and ongoing):** From `human_input_requirements.md`, derive required source categories and expected `inputs_ai/` leaf directories (including paths implied by the **Expected structure** tree). A category/path is **required** unless requirements **explicitly** mark it optional.
27. **`REQUIRED_SOURCE_CATEGORY_EMPTY` (critical, blocking):** No required `inputs_ai/` leaf directory may be empty or contain only placeholders (for example `.gitkeep` alone) without a **qualifying gap/status file** in that directory (e.g. `source_gap.md`, or `README.md` only if requirements specify it). Compare against `.harness-state.json.last_input_refresh.empty_required_without_gap` when present—must be **0** for a successful first acquisition to claim lint-clean required-source coverage.
28. **`REQUIRED_SOURCE_GAP_INCOMPLETE` (warning or critical):** Every gap/status file for a required category must state **attempted sources** (URLs, titles, or search paths), **what is missing**, **downstream impact**, and explicit **blocker status** (e.g. `blocks_outputs: true|false`). Missing any of these → emit at least **warning**; if conclusions could be materially misleading, use **critical**.
29. **First substantive input acquisition:** If the run is a first acquisition per the centralized `do_get_inputs.md` command (no prior successful input refresh or newly required categories not yet covered), lint **must not pass** with critical count zero while required categories are silently empty or gaps are incomplete—treat as blocking until populated or properly gapped.
30. **Subsequent builds:** If dependency maps, coverage ledgers, or `source_category_coverage.md` show a required category is **missing**, **stale**, or **not refreshed** while dependent wiki sections or directed outputs are marked current or were rebuilt without refreshing that category, emit **`STALE_OR_MISSING_SOURCE_FOR_OUTPUT`** as **warning** or **critical** (critical when high-impact outputs are affected).
31. **Centralized `framework/` changes (warning, not blocking):** If Git is available, resolve the centralized framework root. Prefer `KISS_AI_FRAMEWORK_ROOT` when set; otherwise use sibling path `../_kiss_ai/framework/` from the project root. Compare `_kiss_ai/framework/**` to `HEAD` in the `_kiss_ai` repo (for example `git -C ../_kiss_ai status --short -- framework` and `git -C ../_kiss_ai diff --stat -- framework`). If there are working-tree changes under centralized `framework/**` that are not yet committed, check whether the user has **declared intentional customization**:
    - `.harness-state.json.extensions.framework_guard.intentional_customization_note` is non-null and non-empty **and** `intentional_customization_acknowledged_at` is set, **or**
    - the newest `change_logs/change_logs.md` entry explicitly mentions intentional centralized `framework/` edits.
    - If neither is true and centralized `framework/**` differs from the last committed tree, emit a **warning** finding with code `CENTRAL_FRAMEWORK_UNREVIEWED_CHANGES`, severity `warning`, `blocking: false`, and list the changed paths. Intentional framework work is allowed, but it should be committed in `_kiss_ai`, not hidden inside a project snapshot.

## Instructions

1. Read the configured paths from `.harness-state.json` and requirements.
2. Run each check above, including required-source category walks under `inputs_ai/` aligned with `human_input_requirements.md`.
3. Group findings by severity:
   - `critical` blocks rebuild or use
   - `warning` should be reviewed
   - `info` is useful context
4. Update `.harness-state.json` with lint status. Each finding should include `severity`, `code`, `message`, `path`, `artifact`, and `blocking`.
5. Append or prepend a lint entry to `change_logs/change_logs.md` based on the project's log convention. Default to prepend.

## Output

Report:

- critical count
- warning count
- info count
- specific files to inspect
- recommended next command
