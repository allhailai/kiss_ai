# kiss_ai Web Source Architecture

This directory is organized so AI agents can add features without growing a single app file.

## Module Map

```text
src/
  app/        App shell, theme mapping, and workspace orchestration
  contracts/  Shared API request/response shapes
  data/       Backend API transport helpers
  domain/     Pure helpers for files, links, diffs, design identity parsing, formatting
  editor/     CodeMirror React wrapper and editor extensions
  features/   User-facing workflow components
  navigation/ Route, view, and navigation models
  shared/     App-neutral shared UI components and types
```

## App Layer

`main.tsx` imports the app shell from `app/App.tsx`.

`app/App.tsx` composes the shell, sidebar, and active workflow. It should read like the map of the UI. Keep data loading, route application, saving, reverting, rebuild polling, and project selection in `app/useProjectWorkspace.ts`.

`navigation/views.ts` owns view ids, route-backed view metadata, local storage keys, and file-path-to-view policy. Route hash behavior belongs in `navigation/routes.ts`.

App-owned orchestration belongs in `app/`. If state drives more than one workflow surface, keep the controller in `app/` or a focused `app/hooks/` module and pass behavior into features as props.

Right-panel behavior is app shell state. Panel persistence, panel width, selected agent conversation mirroring, and file context selection belong in `app/`; the panel UI belongs in `features/agents/`.

Shared UI components such as chat message rendering live under `shared/`, while feature directories own workflow-specific composition.

## Domain Layer

Use `domain/` for deterministic helpers that can be understood and tested without React:

- `designIdentity.ts`: parse and serialize `human_design_identity.md`.
- `diffs.ts`: line diff calculations and diff counts.
- `files.ts`: file trees, file de-duplication, and path display helpers.
- `formatters.ts`: date and display formatting helpers.
- `links.ts`: wiki/markdown link resolution and display helpers.

Domain modules should not import React, components, hooks, CodeMirror widgets, app view types, or transport clients. They may import API contract types from `contracts/api.ts`.

## Editor Layer

Use `editor/` for CodeMirror-specific behavior:

- `MarkdownEditor.tsx`: React wrapper for the configured editor.
- `MarkdownEditor.css`: CodeMirror wrapper, diff, wiki link, and base table editor styles.
- `diffExtension.ts`: saved and unsaved diff decorations.
- `wikiLinkExtension.ts`: clickable wiki and markdown links.
- `markdownTableExtension.ts`: table editing extension public API.
- `markdownTableExtension.css`: table interaction styling, including handles, selection, active cells, and context menus.

Editor modules may import domain helpers and API contract types. They should receive app behavior through callbacks rather than importing workflow components or transport clients.

## Feature Layer

Use `features/<feature>/` for workflow UI. A feature component can own local UI state, but app-wide state and API orchestration should stay in `useProjectWorkspace.ts` and focused hooks under `app/hooks/`. Feature-local API calls are acceptable for isolated interactions, such as debounced search, when the result does not become shared workspace state.

`features/navigation/` is shell-adjacent UI: it may consume `navigation/` metadata, but it should not import from `app/`, own route parsing, local storage behavior, or data loading.

Current features:

- `agents/`
- `buildLog/`
- `chat/`
- `dashboard/`
- `design/`
- `files/`
- `navigation/`
- `projectPicker/`
- `rebuild/`
- `search/`
- `toast/`

## Data And Live Updates

Use `contracts/` for shared API shapes and `data/` for transport helpers. Server request validation lives in `server/routes/requestSchemas.js`; when adding or changing an API shape, update the contract type, transport helper, route schema, and focused tests together.

Chat and rebuild workflows use a dual transport:

- A REST request starts or mutates the workflow.
- An `EventSource` stream sends live snapshots and deltas.
- Polling or a fresh REST read should remain a recovery path for stream disconnects.

Long-running server work should have an explicit lifecycle state. Rebuilds persist state under `.runtime/`; chat conversations persist messages under the project and should normalize stale streaming messages when recovered.

## Quality Gate

Run `npm run check` from `web/` before handing off substantive changes. It runs app TypeScript, server TypeScript, boundary checks, and Vitest.

## Adding A New Workflow

1. Add the view id and label in `navigation/views.ts`.
2. Add route/data loading behavior in `app/useProjectWorkspace.ts` or a focused hook under `app/hooks/`.
3. Add the root component under `features/<feature>/`.
4. Compose the feature in `app/App.tsx`.
5. Run `npm run check` from `web/`.

Keep each step narrow and behavior-preserving.
