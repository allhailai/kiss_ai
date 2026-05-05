# do_all_rebuild

Run the full `kiss_ai` research project loop from requirements to generated outputs.

## Preconditions

- Run from the project root.
- New projects should be initialized with the centralized command at `../_kiss_ai/framework/commands/do_init_project.md` before this command is run.
- The canonical framework is outside the project root at sibling path `../_kiss_ai/framework/` unless the user provides an explicit `KISS_AI_FRAMEWORK_ROOT`.
- Do not recreate or depend on a project-local `framework/` folder.
- The project root is its own Git root.
- Git annotation detection must be scoped to the project root and only to `inputs_ai/**` and `outputs_ai/**`.
- These files exist:
  - `human_goal_requirements.md`
  - `human_input_requirements.md`
  - `human_output_requirements.md`
  - `human_open_questions.md`
  - `change_logs/change_logs.md`
  - `change_logs/annotation_change_logs.md`
  - `change_logs/human_attention_queue.md` or it can be created during finalization
  - `.harness-state.json`
- These folders exist:
  - `change_logs/`
  - `change_logs/summaries/` or it can be created during finalization
  - `inputs_human/`
  - `inputs_ai/`
  - `outputs_ai/`

## Non-Interactive Runtime Contract

Web-triggered rebuilds must not ask for mid-run human confirmation. When a decision would normally require user input, choose the conservative default that preserves current requirements and source truth, continue when technically possible, and record a structured human-attention item in `.harness-state.json.extensions.human_attention.open_items` and `change_logs/human_attention_queue.md`.

Use these categories for attention items: `annotation`, `source_gap`, `git_snapshot`, `framework_guard`, `lint`, `schema`, `output_review`, and `runtime`.

Each item should include severity (`info`, `warning`, or `blocked`), category, concise issue summary, affected files, default action taken, and the next human action. A run with generated outputs plus open attention items should be reported as completed with attention, not as an interactive block.

## Instructions

1. Read the three human requirement files and `human_open_questions.md`.
2. Read `.harness-state.json`.
3. Verify the project root is the Git root:
   - If Git is missing in the project root, initialize Git in the project root when possible and record a `runtime` human-attention warning.
   - If only a parent folder is a Git repo, do not use the parent repository. Initialize Git in the project root when possible and record a `runtime` human-attention warning.
   - If Git cannot be initialized or used, continue only when project files can still be written, record a `git_snapshot` blocked attention item, and skip Git-dependent annotation diffing and snapshot steps for this run.
4. Determine whether this is the first build:
   - Treat it as a first build when `.harness-state.json` has `last_successful_run_at: null` and all run-state blocks are still `not_run`, including `scaling_assessment`, `rebuild_scope`, annotation scan, input refresh, wiki compile, output build, and lint.
   - Also treat it as a first build when `git rev-list --count HEAD` is `0`.
   - If Git has commits but `.harness-state.json` has no successful run, check whether the AI-managed baseline exists by reviewing committed files under `inputs_ai/**` and `outputs_ai/**`. If only placeholders exist or no committed generated files exist, continue to treat this as a first build.
   - If the signals conflict, choose the conservative first-build baseline path when there is no recorded successful run, then record a `runtime` human-attention warning explaining the conflict and default action.
5. For a first build, create a human-authored baseline commit before generating AI-managed content:
   - Verify the project root is cleanly scoped and no parent repository will be used.
   - Stage only setup and human-owned baseline paths:
     - `.harness-state.json`
     - `README.md`
     - `human_goal_requirements.md`
     - `human_input_requirements.md`
     - `human_output_requirements.md`
     - `human_open_questions.md`
     - `inputs_human/**`
     - `change_logs/**`
     - placeholder files under `inputs_ai/**` and `outputs_ai/**`, such as `.gitkeep`, if present
   - Do not stage generated AI-managed content under `inputs_ai/**` or `outputs_ai/**` unless the user explicitly says it is part of the initial human-authored baseline.
   - Commit with a message such as `kiss_ai initial human baseline: <project_name> (YYYY-MM-DD)`.
   - Update `.harness-state.json` after the commit with the baseline commit hash, then commit that state update with a message such as `kiss_ai record initial baseline: <project_name> (YYYY-MM-DD)`.
   - If the baseline commit fails, record a `git_snapshot` blocked attention item and continue the rebuild when project files are writable. Treat annotation detection as best-effort for this run and make the missing baseline visible in state, logs, summaries, and the final completion message.
6. Run the centralized `do_process_annotations.md` command.
7. If annotation processing produces unresolved review items, record them in `.harness-state.json`, `change_logs/annotation_change_logs.md`, and generated outputs where relevant. Continue unless the annotations make the project impossible to execute safely, such as contradictory required schemas or missing required source decisions.
8. Run the centralized `do_get_inputs.md` command.
9. Run the canonical rebuild-level scaling assessment before downstream generation:
    - Use input refresh results, verified source inventory, source counts, source categories, output requirements, prior compile state, prior lint findings, and project-defined dependency ledgers when available.
    - Classify the build as `simple`, `baseline_dependency_tracking`, or `large_project_scaling`.
    - Use the centralized `framework/playbooks/large_project_scaling.md` as the source of truth for choosing among the three modes.
    - Always use the baseline scaling safeguards: source-to-page mapping, output dependency mapping, stale-source/stale-output detection, blocked or low-confidence reporting, and preservation of unchanged outputs only when dependencies are unchanged.
    - In every mode, record enough source inventory, source-to-page mapping, output dependency mapping, stale detection, and preservation rationale to justify what changed and what remained unchanged.
    - Escalate to `large_project_scaling` when the signals in the centralized `framework/playbooks/large_project_scaling.md` show that a broad synthesis pass risks degraded output quality. The agent decides this automatically; do not ask non-technical users to choose the mode.
    - On first escalation, create or refresh the minimum project-defined intermediate ledgers needed for reliable synthesis. If escalation exposes a requirement, schema, or source-exclusion decision that cannot be resolved from current requirements, choose the conservative default, record a `schema` or `source_gap` human-attention item, and continue with caveats when technically possible.
    - If escalation would benefit from ledgers that are not yet defined by project requirements, continue with the strongest available baseline safeguards and record the missing ledger definition as a caveat or deferred requirement decision.
    - If first escalation requires a one-time broader rebuild to establish dependency maps or intermediate ledgers, perform that broader rebuild when feasible and record whether it was completed, partially completed, or deferred with caveats.
    - Update `.harness-state.json` with `scaling_assessment.status`, `assessed_at`, `selected_mode`, structured trigger signals, baseline safeguard statuses, required ledgers, first scaling escalation status, broader rebuild status, mode history, and notes.
10. If input refresh reports material changes, continue through downstream rebuild:
    - Mark affected wiki pages, intermediate ledgers, and directed outputs as changed, stale before rebuild, rebuilt, low-confidence, or uncertain in `.harness-state.json`.
    - Update `rebuild_scope` with the affected artifacts, downstream impact, uncertainty, and caveats.
    - Carry material-change caveats into generated wiki pages, directed outputs, stale-output ledgers, and the executive rebuild summary as user-facing implications.
11. Determine rebuild scope before downstream generation:
    - Use input refresh results, source inventory, prior compile state, scaling assessment, and project-defined dependency ledgers when available.
    - Identify changed source categories, affected wiki pages, affected intermediate ledgers, affected final outputs, and outputs that may now be stale.
    - If the impact map is uncertain, rebuild the uncertain area and report the uncertainty.
    - For projects escalated to `large_project_scaling`, follow the centralized `framework/playbooks/large_project_scaling.md`.
12. Run the centralized `do_organize_data.md` command.
13. Run the centralized `do_build_outputs.md` command.
14. Run the centralized `do_lint.md` command.
15. Establish one shared `run_timestamp` for rebuild finalization, using the current local ISO timestamp. Reuse this exact timestamp for the build summary section, `.harness-state.json.last_run_at`, `.harness-state.json.last_successful_run_at` when applicable, summary metadata, and the aggregate change-log entry.
16. Run the centralized `do_write_rebuild_summary.md` command with the shared `run_timestamp`.
    - If the summary cannot be written, stop before the framework guard and Git snapshot. Report the failure and record `extensions.rebuild_summaries.latest_summary_status: "failed"` in `.harness-state.json` if state can be updated safely.
17. Update `.harness-state.json` with:
    - `last_run_at` using the shared `run_timestamp`
    - `last_successful_run_at` if all steps passed
    - scaling assessment status and selected mode
    - status summaries from each step
    - rebuild summary metadata under `extensions.rebuild_summaries`, including the latest summary path, section timestamp, status, and notes
    - generated output inventory
    - rebuild scope, including artifacts rebuilt, preserved, stale, blocked, or uncertain
    - stale output inventory, if any
    - intermediate ledger status, if any
    - unresolved review items
    - `extensions.human_attention`, including queue path, update timestamp, and open items
18. Prepend a run entry to `change_logs/change_logs.md` using the shared `run_timestamp`. Include a link to the per-rebuild summary report under `change_logs/summaries/`.
19. **Central framework snapshot guard (before Git snapshot):** Resolve the centralized framework root. Prefer `KISS_AI_FRAMEWORK_ROOT` when set; otherwise use `../_kiss_ai/framework/` from the project root. Verify that path exists and that its Git root is `_kiss_ai`.
    - If the `_kiss_ai` repo has uncommitted changes under `framework/**` compared to `HEAD` (for example `git -C ../_kiss_ai status --short -- framework` or `git -C ../_kiss_ai diff --stat -- framework` is non-empty), do not ask mid-run. Record a `framework_guard` human-attention warning with the changed framework paths and default action.
    - Default action: defer the project Git snapshot until the centralized framework tree is reviewed or committed separately, but keep generated artifacts, state, logs, and summaries written.
    - Do not claim a clean successful rebuild snapshot when centralized framework drift was detected.
20. **Git snapshot of the whole project (required on successful rebuild):** If steps 6 through 18 completed without a fatal execution stop, and step 19 did not block waiting on user intent, record the full project tree in Git so the next rebuild has a clean baseline for diffs and annotations.
    - Run **from the project root** (the directory that contains `human_goal_requirements.md`, `inputs_human/`, `inputs_ai/`, `outputs_ai/`, and `change_logs/`).
    - Stage **everything under this project root only** — human files, logs, state, inputs, and outputs:
      - `git add -A .`
      - `git status --short`
    - Commit with a message that includes the project name, date, and that this is a rebuild snapshot, for example:
      - `kiss_ai rebuild snapshot: <project_name> (YYYY-MM-DD)`
    - If `git commit` fails (missing author identity, empty commit, hook failure), record a `git_snapshot` human-attention item with the error and leave the generated files in place. The run may still finish with attention, but do not claim that a snapshot commit exists.

## Rebuild Caveats And Escalations

Do not stop before regenerating downstream outputs solely because findings are material, low-confidence, high-impact, or require human attention. Instead, continue the rebuild and make the uncertainty visible in state, logs, ledgers, and outputs.

- If an annotation proposes a goal, scope, source, topic, wiki organization, or output-standard change, preserve the proposal as an unresolved item and continue with the current requirements unless the requirements become impossible to apply.
- If input refresh finds a material source or requirement change, rebuild affected downstream artifacts and include source caveats, uncertainty, and stale-before-rebuild status.
- If annotations conflict, record the conflict and choose the most conservative interpretation that still satisfies current requirements.
- Stop only for technical execution blockers that make file generation impossible, such as missing required project files, unreadable required human inputs with no allowed exclusion path, impossible schemas with no conservative default, command failures, or filesystem write failures. Git/framework snapshot problems should normally finish with attention after generated artifacts, state, logs, and summaries are written.

## Completion Message

Report:

- Annotation status.
- First-build baseline status and commit hash when applicable.
- Input refresh status.
- Scaling assessment mode and trigger signals.
- Wiki topics and concepts written.
- Directed outputs written.
- Lint status.
- Rebuild summary report path.
- Git snapshot commit hash and summary (or why commit was skipped or failed).
- Any caveats, unresolved items, or deferred decisions.
