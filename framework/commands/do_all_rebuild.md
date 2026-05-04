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
  - `.harness-state.json`
- These folders exist:
  - `change_logs/`
  - `inputs_human/`
  - `inputs_ai/`
  - `outputs_ai/`

## Instructions

1. Read the three human requirement files and `human_open_questions.md`.
2. Read `.harness-state.json`.
3. Verify the project root is the Git root. If Git is missing or only a parent folder is a Git repo, stop and ask whether to initialize Git in the project root before continuing.
4. Determine whether this is the first build:
   - Treat it as a first build when `.harness-state.json` has `last_successful_run_at: null` and all run-state blocks are still `not_run`, including `scaling_assessment`, `rebuild_scope`, annotation scan, input refresh, wiki compile, output build, and lint.
   - Also treat it as a first build when `git rev-list --count HEAD` is `0`.
   - If Git has commits but `.harness-state.json` has no successful run, check whether the AI-managed baseline exists by reviewing committed files under `inputs_ai/**` and `outputs_ai/**`. If only placeholders exist or no committed generated files exist, continue to treat this as a first build.
   - If the signals conflict, stop and ask the user whether to create a first-build baseline or continue as a normal rebuild.
5. For a first build, create a human-authored baseline commit before generating AI-managed content:
   - Confirm the project root is cleanly scoped and no parent repository will be used.
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
   - Update `.harness-state.json` after the commit with the baseline commit hash, then commit that state update with a message such as `kiss_ai record initial baseline: <project_name> (YYYY-MM-DD)`. If the user prefers a single baseline commit, update state before committing and include the intended baseline marker in that commit.
   - If commit fails or the user does not approve committing, stop before annotation processing. Do not run the first build without an explicit decision to defer the baseline.
6. Run the centralized `do_process_annotations.md` command.
7. If annotation processing produces unresolved review items, stop and ask the user to decide before continuing.
8. Run the centralized `do_get_inputs.md` command.
9. Run the canonical rebuild-level scaling assessment before downstream generation, even when input refresh reports material changes that may block downstream rebuild:
    - Use input refresh results, verified source inventory, source counts, source categories, output requirements, prior compile state, prior lint findings, and project-defined dependency ledgers when available.
    - Classify the build as `simple`, `baseline_dependency_tracking`, or `large_project_scaling`.
    - Use the centralized `framework/playbooks/large_project_scaling.md` as the source of truth for choosing among the three modes.
    - Always use the baseline scaling safeguards: source-to-page mapping, output dependency mapping, stale-source/stale-output detection, blocked or low-confidence reporting, and preservation of unchanged outputs only when dependencies are unchanged.
    - In every mode, record enough source inventory, source-to-page mapping, output dependency mapping, stale detection, and preservation rationale to justify what changed and what remained unchanged.
    - Escalate to `large_project_scaling` when the signals in the centralized `framework/playbooks/large_project_scaling.md` show that a broad synthesis pass risks degraded output quality. The agent decides this automatically; do not ask non-technical users to choose the mode.
    - On first escalation, create or refresh the minimum project-defined intermediate ledgers needed for reliable synthesis. Ask the user only if escalation requires changing requirements, output schemas, source exclusions, or review gates.
    - If escalation requires ledgers that are not yet defined by project requirements, mark first escalation as `blocked` or `deferred` and ask only for the required requirement or schema decision.
    - If first escalation requires a one-time broader rebuild to establish dependency maps or intermediate ledgers, record whether the broader rebuild is required, blocked, completed, or deferred.
    - Update `.harness-state.json` with `scaling_assessment.status`, `assessed_at`, `selected_mode`, `intended_mode_after_unblock` when blocked, structured trigger signals, baseline safeguard statuses, required ledgers, first scaling escalation status, broader rebuild status, mode history, and notes.
10. If input refresh reports material changes requiring approval, stop after the scaling assessment is recorded and ask the user to approve or defer downstream rebuild:
    - Mark affected wiki pages, intermediate ledgers, and directed outputs as `stale`, `blocked`, or `pending_rebuild` in `.harness-state.json` rather than leaving prior successful state looking current.
    - Update `rebuild_scope` with the affected artifacts and uncertainty.
11. Determine rebuild scope before downstream generation:
    - Use input refresh results, source inventory, prior compile state, scaling assessment, and project-defined dependency ledgers when available.
    - Identify changed source categories, affected wiki pages, affected intermediate ledgers, affected final outputs, and outputs that may now be stale.
    - If the impact map is uncertain, rebuild the uncertain area and report the uncertainty.
    - For projects escalated to `large_project_scaling`, follow the centralized `framework/playbooks/large_project_scaling.md`.
12. Run the centralized `do_organize_data.md` command.
13. Run the centralized `do_build_outputs.md` command.
14. Run the centralized `do_lint.md` command.
15. Update `.harness-state.json` with:
    - `last_run_at`
    - `last_successful_run_at` if all steps passed
    - scaling assessment status and selected mode
    - status summaries from each step
    - generated output inventory
    - rebuild scope, including artifacts rebuilt, preserved, stale, blocked, or uncertain
    - stale output inventory, if any
    - intermediate ledger status, if any
    - unresolved review items
16. Prepend a run entry to `change_logs/change_logs.md`.
17. **Central framework snapshot guard (before Git snapshot):** Resolve the centralized framework root. Prefer `KISS_AI_FRAMEWORK_ROOT` when set; otherwise use `../_kiss_ai/framework/` from the project root. Verify that path exists and that its Git root is `_kiss_ai`.
    - If the `_kiss_ai` repo has uncommitted changes under `framework/**` compared to `HEAD` (for example `git -C ../_kiss_ai status --short -- framework` or `git -C ../_kiss_ai diff --stat -- framework` is non-empty), stop and **ask** whether those centralized framework changes are **intentional**.
    - If **not intentional**, ask whether to defer the project snapshot until the centralized framework tree is fixed. Do not claim a successful rebuild snapshot that silently hides accidental framework drift.
    - If **intentional**, commit or defer the centralized framework change in the `_kiss_ai` repo before continuing, or record a user-confirmed reason in the project run summary and `change_logs/change_logs.md` if the user explicitly wants the project snapshot to proceed before that separate framework commit.
18. **Git snapshot of the whole project (required on successful rebuild):** If steps 6 through 14 completed without a blocking stop (review gates respected), and step 17 did not block waiting on user intent, record the full project tree in Git so the next rebuild has a clean baseline for diffs and annotations.
    - Run **from the project root** (the directory that contains `human_goal_requirements.md`, `inputs_human/`, `inputs_ai/`, `outputs_ai/`, and `change_logs/`).
    - Stage **everything under this project root only** — human files, logs, state, inputs, and outputs:
      - `git add -A .`
      - `git status --short`
    - Commit with a message that includes the project name, date, and that this is a rebuild snapshot, for example:
      - `kiss_ai rebuild snapshot: <project_name> (YYYY-MM-DD)`
    - If `git commit` fails (missing author identity, empty commit, hook failure), stop and report the error. Do not claim a successful rebuild until the snapshot commit exists or the user explicitly defers commits.

## Review Gates

Stop before regenerating downstream outputs if any of these are true:

- An annotation proposes a goal or scope change.
- An annotation proposes excluding a previously required source or topic.
- An annotation proposes major wiki reorganization.
- An annotation changes directed output standards.
- Input refresh finds a material source or requirement change.
- Conflicting annotations cannot be reconciled.

## Completion Message

Report:

- Annotation status.
- First-build baseline status and commit hash when applicable.
- Input refresh status.
- Scaling assessment mode and trigger signals.
- Wiki topics and concepts written.
- Directed outputs written.
- Lint status.
- Git snapshot commit hash and summary (or why commit was skipped or failed).
- Any deferred review items.
