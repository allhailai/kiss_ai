# kiss_ai Web App Maintainer Notes

This is maintainer documentation for the primary local web application. External users should start with [`../README.md`](../README.md).

This web app is the local `kiss_ai` hub. It lives in `kiss_ai_projects/_kiss_ai/web/` and manages sibling project folders under `kiss_ai_projects/`.

The `_kiss_ai` repo tracks hub and framework code. Each managed project remains its own git repo so project file status, diffs, reverts, and annotation detection continue to belong to the selected project.

## What This Hub Provides

- A browser UI can read `.harness-state.json` and turn rebuild, lint, stale-output, and annotation state into non-technical project status.
- Human-owned files can be edited directly without exposing the user to Cursor, Obsidian, Git, or raw folders.
- AI-managed files under `inputs_ai/` and `outputs_ai/` can be edited as visually distinct annotations for the existing Git-diff annotation workflow.
- `human_design_identity.md` can provide per-project visual identity without changing shared framework code.
- A local backend can keep file access allowlisted to the project root.
- A single-flight Cursor CLI rebuild runner can start from the project root when `CURSOR_API_KEY` is available, and show a blocked state when it is not.

## Repo Boundaries

- `kiss_ai_projects/_kiss_ai/` is the hub repo.
- `kiss_ai_projects/{project_slug}/` folders are project repos.
- The UI must run project git commands with the selected project root as `cwd`, never with `_kiss_ai` as `cwd`.
- The project picker excludes reserved folders such as `_kiss_ai`, `.obsidian`, `_archive`, and `_templates`.

## Runtime Settings

- `KISS_AI_PROJECTS_ROOT` can override the projects root. By default, `_kiss_ai/web` resolves the projects root as two levels above the web app.
- `CURSOR_API_KEY` enables UI-triggered Cursor agent runs. The server also checks `web/.env` and the OS credential store (macOS Keychain or Linux `secret-tool`) for an item named `cursor_api_key`.
- `KISS_AI_UI_PORT` controls the Express API port. The Vite dev proxy expects the same API port.
- `CURSOR_MODEL` optionally controls the Cursor SDK model selection.

## Open Questions

- Whether the rebuild runner should remain Cursor CLI based through the current API layer, become a framework CLI, or support both.
- How rebuild caveats and unresolved decisions should become structured machine-readable events rather than prose-only agent notes.
- Whether upload/conversion for PDFs, spreadsheets, and screenshots belongs in the shared UI or a later plugin.
- How to lock or queue UI edits while a rebuild is running.
- How much Git history/recovery to expose to non-technical users.

## Centralized Framework

The canonical `kiss_ai` framework now lives at `kiss_ai_projects/_kiss_ai/framework/`. Managed projects should not keep copied `framework/` folders. Rebuild agents run from the selected project root, but follow the central command docs, normally `../_kiss_ai/framework/commands/do_all_rebuild.md`.

Framework changes are committed in the `_kiss_ai` repo. Project rebuild snapshots remain project-local and should continue to commit generated inputs, outputs, logs, state, and human requirement changes from the selected project root only.
