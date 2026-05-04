# Simple Research Project

This is a tiny `kiss_ai` example showing the basic project shape before a rebuild has generated AI-managed outputs.

This folder is a static example only. It is not intended to run rebuild commands directly.

## First Steps

1. Fill in `human_goal_requirements.md` in plain language.
2. Fill in `human_input_requirements.md` in plain language.
3. Fill in `human_output_requirements.md` in plain language.
4. Use `human_open_questions.md` to answer questions that need human review.
5. Put human-owned context, notes, files, and source lists in `inputs_human/`.
6. In a real project created under `kiss_ai_projects/`, ask the agent to run `../_kiss_ai/framework/commands/do_all_rebuild.md`.

## Log Files

- `change_logs/change_logs.md` records requirement, source-process, wiki, and output changes.
- `change_logs/annotation_change_logs.md` records annotations extracted from AI-managed paths.

## Folder Ownership

- `inputs_human/` is human-owned.
- `inputs_ai/` is AI-managed.
- `outputs_ai/` is AI-managed.

Human edits in AI-managed folders are treated as annotations and processed during rebuild.

After the first successful generated baseline is reviewed, ask the agent to commit it so future annotation detection has a clean comparison point.
