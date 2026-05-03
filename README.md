# kiss_ai Hub

This repo contains the local multi-project `kiss_ai` web hub.

## Layout

```text
kiss_ai_projects/
  _kiss_ai/              # this repo: hub and framework code
    web/
  economics_and_equity_markets/
  hwh_clinical_protocols/
```

Each managed project remains its own git repo. The hub uses project-scoped API routes so file status, diffs, reverts, annotations, design lint, and rebuilds run from the selected project root.

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
