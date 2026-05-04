# kiss_ai

This repo contains the centralized local `kiss_ai` framework and the shared multi-project web hub.

## Layout

```text
kiss_ai_projects/
  _kiss_ai/              # this repo: hub and framework code
    framework/           # canonical agentic build framework
    docs/
    examples/
    web/
  economics_and_equity_markets/
  hwh_clinical_protocols/
  wiki_dual_alignment/
```

Each managed project remains its own Git repo. The hub uses project-scoped API routes so file status, diffs, reverts, annotations, design lint, and rebuilds run from the selected project root.

## Framework

`framework/` is the canonical shared framework for agentic builds. Managed projects should reference this central copy, usually from a sibling project root as:

```text
../_kiss_ai/framework/commands/do_all_rebuild.md
```

Do not recreate project-local `framework/` folders. Framework changes belong in this `_kiss_ai` repo and should be committed here, separate from project rebuild snapshot commits.

The older `/opt/all_hail_ai/kiss_ai` checkout may exist temporarily as a fallback during migration, but this repo is the active home for framework and hub work.

## Run

```sh
cd web
npm install
npm run dev
```

Runtime settings:

- `KISS_AI_PROJECTS_ROOT` overrides the projects folder. The default is two levels above `web/`.
- `CURSOR_API_KEY` enables UI-triggered Cursor SDK rebuilds. The server also checks `web/.env` and macOS Keychain item `cursor_api_key`.
- `KISS_AI_UI_PORT` controls the Express API port.
- `CURSOR_MODEL` optionally controls the Cursor SDK model selection.
