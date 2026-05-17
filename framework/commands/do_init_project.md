# do_init_project

Set up a new kiss_ai research project from the shared template.

This command is for project setup. It should be safe for non-technical users: ask only for missing information, create the project structure, and stop before generating AI-managed content.

## Preconditions

- Run from `_kiss_ai/`, from `kiss_ai_projects/`, or from the folder that contains `kiss_ai_projects/`.
- The shared `_kiss_ai/framework/` folder is available.
- User projects must live under `kiss_ai_projects/` as siblings of `_kiss_ai/`, not inside `_kiss_ai/`.
- Each research project must be its own Git repo, with the project root as the Git root.
- Do not overwrite existing user files.

## Information to Ask For

Ask the user for only these values if they were not already provided:

1. Project folder name, using `snake_case`.
2. Project display name.
3. One-sentence project goal.

## Instructions

1. Identify the new project root:
   - If the current folder is `_kiss_ai/`, create or use sibling folder `../{project_folder_name}/`.
   - If the current folder is `kiss_ai_projects/`, create or use `{project_folder_name}/`.
   - If the current folder contains `kiss_ai_projects/`, create or use `kiss_ai_projects/{project_folder_name}/`.
   - Do not create user projects under `_kiss_ai/examples/` or inside `_kiss_ai/framework/`.
2. Create these folders if they do not exist:
   - `inputs_human/`
   - `sources/`
   - `sources/web_research/`
   - `sources/extracted/`
   - `outputs_ai/`
   - `outputs_ai/wiki/`
   - `change_logs/`
   - `.build/`
3. Create these files if they do not exist:
   - `project.md`
   - `questions.md`
   - `human_design_identity.md`
   - `README.md`
   - `change_logs/builds.md`
   - `.build/manifest.json`
   - `sources/source_log.md`
4. Use `_kiss_ai/framework/templates/project_template/` as the default content source. Copy hidden files such as `.build/manifest.json` and `.cursor/**`; do not skip dotfiles.
5. Fill the project display name into `.build/manifest.json` and `project.md`.
6. Fill the one-sentence project goal into `project.md` under `## Goal`.
7. Add `.gitkeep` to empty directories: `inputs_human/`, `sources/web_research/`, `sources/extracted/`, `outputs_ai/wiki/`, `outputs_ai/`.
8. Verify the required project shape:
   - Required files exist.
   - Required folders exist.
   - `../_kiss_ai/framework/commands/do_build.md` is reachable from the project root, or `KISS_AI_FRAMEWORK_ROOT` points to a reachable central framework.
9. Initialize Git in the project root if it is not already a Git repo.
10. Stop and report next steps. Do not run `do_build.md` automatically.

## New Project Baseline

After initialization, the project has no AI-managed content yet. The normal workflow is:

1. The user fills in `project.md` with their goal, context, topics, and desired outputs.
2. The user optionally adds documents to `inputs_human/`.
3. The user asks the agent to run `../_kiss_ai/framework/commands/do_build.md` from the project root.
4. The build creates an initial baseline commit before generating AI-managed content.
5. After the build succeeds, the build creates a rebuild snapshot commit.

## Output

Report:

- Project root.
- Files created.
- Files left unchanged (if project already existed).
- Git repo status.
- What the user should fill in next.
- Whether the project is ready for `do_build.md`.
