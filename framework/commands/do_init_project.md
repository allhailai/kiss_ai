# do_init_project

Set up a new `kiss_ai` research project from the shared template.

This command is for project setup. It should be safe for non-technical users: ask only for missing information, create the standard project shape, and stop before generating AI-managed content.

## Preconditions

- Run from `_kiss_ai/`, from `kiss_ai_projects/`, or from the folder that contains `kiss_ai_projects/`.
- The shared `_kiss_ai/framework/` folder is available.
- User projects must live under `kiss_ai_projects/` as siblings of `_kiss_ai/`, not inside `_kiss_ai/`.
- Each research project must be its own Git repo, with the project root as the Git root.
- Do not overwrite existing user files. If a required file already exists, keep it and report that it was left unchanged.

## Information to Ask For

Ask the user for only these values if they were not already provided:

1. Project folder name, using `snake_case`.
2. Project display name.
3. One-sentence project goal.

If the user asks about alternate source or output organization, use the relevant optional playbook. Do not add alternate paths unless the project requirements explicitly call for them.

## Instructions

1. Identify the new project root:
   - If the current folder is `_kiss_ai/`, create or use sibling folder `../{project_folder_name}/`.
   - If the current folder is `kiss_ai_projects/`, create or use `{project_folder_name}/`.
   - If the current folder contains `kiss_ai_projects/`, create or use `kiss_ai_projects/{project_folder_name}/`.
   - Do not create user projects under `_kiss_ai/examples/` or inside `_kiss_ai/framework/`.
2. Create these folders if they do not exist:
   - `change_logs/`
   - `change_logs/summaries/`
   - `inputs_human/`
   - `inputs_ai/`
   - `outputs_ai/`
3. Create these files if they do not exist:
   - `human_goal_requirements.md`
   - `human_input_requirements.md`
   - `human_output_requirements.md`
   - `human_open_questions.md`
   - `.harness-state.json`
   - `change_logs/change_logs.md`
   - `change_logs/annotation_change_logs.md`
   - `change_logs/human_attention_queue.md`
   - `README.md`
4. Use `_kiss_ai/framework/templates/project_template/` as the default content source. Copy hidden files such as `.harness-state.json` and `.cursor/**`; do not skip dotfiles.
5. Fill the project display name into `.harness-state.json` and use default evergreen paths such as `inputs_ai/` and `outputs_ai/wiki/`.
6. Fill the one-sentence project goal into `human_goal_requirements.md` under `## Project Objective`.
7. Leave `human_open_questions.md` in place as the shared question-and-answer file for human review.
8. Do not copy the shared framework into the project:
   - The canonical framework remains at sibling path `../_kiss_ai/framework/`.
   - Do not create a project-local `framework/` folder or symlink.
   - If `{project_root}/framework/` already exists, leave it untouched during initialization and report that it should be migrated separately after comparing it to the centralized framework.
9. Verify the required project shape:
   - required files exist
   - required folders exist
   - `change_logs/change_logs.md`, `change_logs/annotation_change_logs.md`, `change_logs/human_attention_queue.md`, and `change_logs/summaries/` exist
   - no root-level `change_logs.md` or `change_annotation_logs.md` exists
   - `../_kiss_ai/framework/commands/do_all_rebuild.md` is reachable from the project root, or `KISS_AI_FRAMEWORK_ROOT` points to a reachable central framework
   - `.cursor/rules/` exists with the template ownership rule (restore from `_kiss_ai/framework/templates/project_template/.cursor/rules/` if an older template copy omitted it)
10. Initialize Git in the project root if it is not already a Git repo:
    - Run Git from the project root.
    - Do not create or rely on one parent Git repo for all projects.
11. Update `.harness-state.json` with:
    - setup status `initialized`
    - initialized timestamp
    - project name
    - `paths.build_summaries: "change_logs/summaries/"`
    - `paths.human_attention_queue: "change_logs/human_attention_queue.md"`
    - `setup.initial_human_baseline_commit: null`
    - `setup.initial_human_baseline_at: null`
    - all run statuses as `not_run`
    - `extensions.human_attention` with queue path, null update timestamp, and an empty `open_items` array
    - `extensions.rebuild_summaries` with null latest summary fields and an empty notes array
    - **Framework provenance:** ensure `extensions.framework_guard` exists (merge keys if an older file lacks them). Set `extensions.framework_guard.framework_copy_source` to `centralized: ../_kiss_ai/framework` or the absolute central framework path used. This is informational provenance only; centralized framework working-tree status must not block project setup, rebuilds, snapshots, or create human-attention items.
12. Prepend an initialization entry to `change_logs/change_logs.md`.
13. Stop and report next steps. Do not run `do_all_rebuild.md` automatically.

## New Project Baseline

After initialization, the project has no AI-managed baseline yet. The first normal workflow is:

1. The user fills in the three human requirement files in plain language.
2. The user adds any human-owned context to `inputs_human/`.
3. The user uses `human_open_questions.md` to answer questions that need human review.
4. The user asks the agent to run `../_kiss_ai/framework/commands/do_all_rebuild.md` from the project root.
5. The agent creates an initial human-authored baseline commit before generating AI-managed content.
6. The agent runs the build.
7. After the first successful generated baseline, the agent creates the rebuild snapshot commit unless the user explicitly defers it.

Annotation detection becomes meaningful after the initial human-authored baseline exists and the first generated snapshot has been committed.

## Output

Report:

- project root
- files created
- files left unchanged
- centralized framework status
- Git repo status
- setup status
- what the user should fill in next
- whether the project is ready for `do_all_rebuild.md`
