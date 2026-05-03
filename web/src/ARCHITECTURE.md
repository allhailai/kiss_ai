# kiss_ai Web Source Architecture

This directory is organized so AI agents can add features without growing a single app file.

## Module Map

```text
src/
  app/        App shell, routing, view/file policy, theme mapping, workspace orchestration
  domain/     Pure helpers for files, links, diffs, design identity parsing, formatting
  editor/     CodeMirror React wrapper and editor extensions
  features/   User-facing workflow components
  api.ts      Backend API types and transport helpers
```

## App Layer

`app/App.tsx` composes the shell, sidebar, and active workflow. It should read like the map of the UI. Keep data loading, route application, saving, reverting, rebuild polling, and project selection in `app/useProjectWorkspace.ts`.

`app/views.ts` owns view ids, route-backed view metadata, local storage keys, and file-path-to-view policy. Route hash behavior belongs in `app/routes.ts`.

`App.tsx` at the source root is only a compatibility export.

## Domain Layer

Use `domain/` for deterministic helpers that can be understood and tested without React:

- `designIdentity.ts`: parse and serialize `human_design_identity.md`.
- `diffs.ts`: line diff calculations and diff counts.
- `files.ts`: file trees, file de-duplication, and path display helpers.
- `formatters.ts`: date and display formatting helpers.
- `links.ts`: wiki/markdown link resolution and display helpers.

Domain modules should not import React, components, hooks, CodeMirror widgets, or app view types. They may import API contract types from `api.ts`.

## Editor Layer

Use `editor/` for CodeMirror-specific behavior:

- `MarkdownEditor.tsx`: React wrapper for the configured editor.
- `diffExtension.ts`: saved and unsaved diff decorations.
- `wikiLinkExtension.ts`: clickable wiki and markdown links.
- `markdownTableExtension.ts`: table editing extension public API and table-specific editor styling.

Editor modules may import domain helpers and API types. They should receive app behavior through callbacks rather than importing workflow components.

## Feature Layer

Use `features/<feature>/` for workflow UI. A feature component can own local UI state, but app-wide state and API orchestration should stay in `useProjectWorkspace.ts`. Feature-local API calls are acceptable for isolated interactions, such as debounced search, when the result does not become shared workspace state.

`features/navigation/` is shell-adjacent UI: it may consume app view metadata, but it should not own route parsing, local storage behavior, or data loading.

Current features:

- `dashboard/`
- `design/`
- `files/`
- `navigation/`
- `projectPicker/`
- `rebuild/`
- `search/`
- `toast/`

## Adding A New Workflow

1. Add the view id and label in `app/views.ts`.
2. Add route/data loading behavior in `app/useProjectWorkspace.ts`.
3. Add the root component under `features/<feature>/`.
4. Compose the feature in `app/App.tsx`.
5. Run `npm run check` from `web/`.

Keep each step narrow and behavior-preserving.
