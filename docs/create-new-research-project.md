# Create a new research project

Use this when you want a **new** folder under `kiss_ai_projects/` with the standard layout, the centralized framework recorded as its build source, and Git initialized. You do **not** need the command line.

**Start from the repo root:** open [`README.md`](../README.md) first; this page is the detailed reference.

## What you get

The agent will follow [`../framework/commands/do_init_project.md`](../framework/commands/do_init_project.md) and create something like:

```text
kiss_ai_projects/
  your_project_name/
    human_goal_requirements.md
    human_input_requirements.md
    human_output_requirements.md
    human_open_questions.md
    .harness-state.json
    README.md
    change_logs/
    inputs_human/
    inputs_ai/
    outputs_ai/
    .cursor/rules/        # hints for the AI (do not edit unless you want)
```

Projects live under `kiss_ai_projects/` as siblings of `_kiss_ai/`, not inside `_kiss_ai/`.

## Before you start

1. Open the **`kiss_ai_projects`** workspace or the **`_kiss_ai`** folder in Cursor.
2. Have three things ready:
   - **Project folder name** — use `snake_case` (e.g. `competitor_scan_q2`).
   - **Display name** — human-readable (e.g. `Competitor scan Q2`).
   - **One-sentence goal** — what you want the research to help with.

## Copy-paste prompt for the AI

Paste this into chat and fill in the three placeholders:

```text
Create a new kiss_ai research project.

Follow _kiss_ai/framework/commands/do_init_project.md exactly.

Project folder name: YOUR_SNAKE_CASE_NAME
Display name: Your Human Readable Name
Goal: One sentence describing what this project should help you decide, understand, or produce.
```

The agent should create `kiss_ai_projects/YOUR_SNAKE_CASE_NAME/`, copy the project template (including hidden files), record `_kiss_ai/framework/` as the centralized framework source, initialize Git in the project root, prepend an entry to `change_logs/change_logs.md`, and **stop** before running a full rebuild or generating `inputs_ai/` / `outputs_ai/` content.

## After the project exists

1. Open the **new project folder** in Cursor (or keep a multi-root workspace that includes it).
2. Edit only the files you own for research intent:
   - `human_goal_requirements.md`
   - `human_input_requirements.md`
   - `human_output_requirements.md`
   - `human_open_questions.md`
3. Add notes, lists, and documents under `inputs_human/`.
4. When ready, ask the agent to follow `../_kiss_ai/framework/commands/do_all_rebuild.md` **from the project root** (same instructions as in the new project’s `README.md`).

## About the centralized `framework/` folder

- The canonical framework lives at `_kiss_ai/framework/` and is shared by all managed projects.
- Do not recreate project-local `framework/` folders. If you change `_kiss_ai/framework/` on purpose, commit that change in the `_kiss_ai` repo separately from project rebuild snapshots.
- Normal research work belongs in the human requirement files and `inputs_human/`.

## Privacy

Your project data stays local unless you upload or share it. Do not put private client, patient, employer, or personal data into public repositories.
