# kiss_ai Framework

This is maintainer documentation for the reusable framework. Non-technical users should start with [`../README.md`](../README.md) and only open command files when an agent asks them to paste a specific command path.

This folder contains the reusable `kiss_ai` framework. Commands are the user-facing workflows; skills are lower-level procedures that commands invoke; templates are used to initialize new research projects.

## Runtime Contract

The framework assumes an LLM agent is executing the command files. Commands should be explicit enough that the agent can perform the work with file, Git, and shell tools without relying on hidden plugin behavior. Rebuild commands must be non-interactive when launched from the web UI: do not wait for human confirmation mid-run; record decisions that need review in the human-attention queue and continue when technically possible.

## Core Invariants

- The requirement files are the source of truth.
- `inputs_human/` is human-owned.
- `inputs_ai/` and `outputs_ai/` are AI-managed.
- Human edits in AI-managed paths are annotations, not durable source-of-truth changes.
- Material requirement changes are captured as human-attention items unless the current requirement files already authorize the change.
- Logs live under `change_logs/` and are prepended in reverse chronological order.
- Human-attention items live in `change_logs/human_attention_queue.md` and `.harness-state.json.extensions.human_attention`. Each open item should include stable resolution options so the web UI can launch a non-interactive follow-up agent run.
- Generated outputs must be reproducible from requirements and inputs.

## Command Order

`do_init_project.md` is the setup entry point for a new research project. It creates the standard project shape under `kiss_ai_projects/`, records this centralized framework as the build source, initializes Git in the project root, and stops before generating AI-managed content.

`do_all_rebuild.md` is the normal rebuild entry point after setup. It composes:

1. `do_process_annotations.md`
2. `do_get_inputs.md`
3. `do_organize_data.md`
4. `do_build_outputs.md`
5. `do_lint.md`
6. `do_write_rebuild_summary.md`

After lint, `do_all_rebuild.md` writes a per-rebuild summary under `change_logs/summaries/` and links it from the aggregate `change_logs/change_logs.md` run entry.

Finalization uses one shared rebuild timestamp for the summary section, harness state, and aggregate change-log entry. Lint checks existing project health before the current summary is written; summary generation itself is a finalization gate, and a failed current-run summary blocks the framework guard and Git snapshot.

## Command Map

- [`commands/do_init_project.md`](commands/do_init_project.md) — create a new research project from the template.
- [`commands/do_all_rebuild.md`](commands/do_all_rebuild.md) — run the normal end-to-end rebuild after setup.
- [`commands/do_process_annotations.md`](commands/do_process_annotations.md) — detect human edits in AI-managed folders and log them as annotations.
- [`commands/do_get_inputs.md`](commands/do_get_inputs.md) — create or refresh AI-managed source notes.
- [`commands/do_organize_data.md`](commands/do_organize_data.md) — compile source notes into the project wiki.
- [`commands/do_build_outputs.md`](commands/do_build_outputs.md) — build final deliverables from requirements, sources, and wiki pages.
- [`commands/do_lint.md`](commands/do_lint.md) — run project, wiki, and output health checks.
- [`commands/do_write_rebuild_summary.md`](commands/do_write_rebuild_summary.md) — write the user-facing rebuild summary.
- [`commands/do_ai_assist.md`](commands/do_ai_assist.md) — support constrained file-assist workflows from the local hub.
- [`commands/do_requirements_auto_update.md`](commands/do_requirements_auto_update.md) — support requirements-sync proposal workflows.
- [`commands/do_resolve_human_attention_item.md`](commands/do_resolve_human_attention_item.md) — resolve a recorded human-attention item.

When a command mentions `framework/...`, it means this centralized framework root. From a normal project folder, the explicit path is usually `../_kiss_ai/framework/...`, unless `KISS_AI_FRAMEWORK_ROOT` points somewhere else.

## Testing The Framework

The folders under `examples/` are static reference examples, not runnable project roots. They intentionally do not include a copied `framework/` folder.

For integration testing, create a throwaway project with `do_init_project.md` so it has the same centralized-framework layout as a real non-technical user project:

1. Run read-only checks from the project root: required `human_*.md` files, folders, reachable `../_kiss_ai/framework/`, and scoped `git status -- inputs_ai outputs_ai`.
2. Prefer committing `inputs_ai/` and `outputs_ai/` once before relying on per-file annotation diffs, otherwise Git may only show untracked trees instead of line-level changes.
3. Run `../_kiss_ai/framework/commands/do_all_rebuild.md`, then simulate a small edit under `inputs_ai/` or `outputs_ai/` and run the centralized `do_process_annotations.md` again to confirm logging and path conventions.
