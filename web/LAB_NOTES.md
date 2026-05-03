# kiss_ai Hub Notes

This web app is the local `kiss_ai` hub. It lives in `kiss_ai_projects/_kiss_ai/web/` and manages sibling project folders under `kiss_ai_projects/`.

The `_kiss_ai` repo tracks hub and framework code. Each managed project remains its own git repo so project file status, diffs, reverts, and annotation detection continue to belong to the selected project.

## What This Hub Provides

- A browser UI can read `.harness-state.json` and turn rebuild, lint, stale-output, and annotation state into non-technical project status.
- Human-owned files can be edited directly without exposing the user to Cursor, Obsidian, Git, or raw folders.
- AI-managed files under `inputs_ai/` and `outputs_ai/` can be edited as visually distinct annotations for the existing Git-diff annotation workflow.
- `human_design_identity.md` can provide per-project visual identity without changing shared framework code.
- A local backend can keep file access allowlisted to the project root.
- A single-flight Cursor SDK rebuild runner can start from the project root when `CURSOR_API_KEY` is available, and show a blocked state when it is not.

## Repo Boundaries

- `kiss_ai_projects/_kiss_ai/` is the hub repo.
- `kiss_ai_projects/{project_slug}/` folders are project repos.
- The UI must run project git commands with the selected project root as `cwd`, never with `_kiss_ai` as `cwd`.
- The project picker excludes reserved folders such as `_kiss_ai`, `.obsidian`, `_archive`, and `_templates`.

## Runtime Settings

- `KISS_AI_PROJECTS_ROOT` can override the projects root. By default, `_kiss_ai/web` resolves the projects root as two levels above the web app.
- `CURSOR_API_KEY` enables UI-triggered Cursor SDK rebuilds. The server also checks `web/.env` and macOS Keychain item `cursor_api_key`.
- `KISS_AI_UI_PORT` controls the Express API port. The Vite dev proxy expects the same API port.
- `CURSOR_MODEL` optionally controls the Cursor SDK model selection.

## Open Questions

- Whether the rebuild runner should remain Cursor SDK based, become a framework CLI, or support both.
- How review gates should become structured machine-readable events rather than prose-only agent stops.
- Whether upload/conversion for PDFs, spreadsheets, and screenshots belongs in the shared UI or a later plugin.
- How to lock or queue UI edits while a rebuild is running.
- How much Git history/recovery to expose to non-technical users.

## Deferred Framework Relocation

The multi-project hub now treats `kiss_ai_projects/` as the project browser root, but the canonical `kiss_ai` framework remains outside that folder for this phase. Moving or mirroring `/opt/all_hail_ai/kiss_ai` into `kiss_ai_projects/` should be a separate migration after the hub proves project selection, project-scoped file access, and project-scoped rebuilds across multiple existing projects.

That later migration should update framework creation docs, `framework/commands/do_init_project.md`, project templates, and framework guard semantics together so project creation and rebuild behavior do not change accidentally during the hub refactor.
