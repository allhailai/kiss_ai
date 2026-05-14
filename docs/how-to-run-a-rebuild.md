# How To Run A Rebuild

A rebuild refreshes a project from the current definition, sources, and open questions.

Run rebuilds from the `kiss_ai` web app.

## Before You Rebuild

In the web app, review:

- **Define the requirements:** goal, source needs, expected outputs, and open questions.
- **Source data view:** any source material or notes already attached to the project.
- **Chat:** any recent guidance you want the project to follow.

You do not need to add files unless the project actually has notes, source lists, uploads, or other source material to include.

## Start The Build

Open the project in the web app and use **Build the project**.

The web app calls local API routes, and those routes run the Cursor CLI agent workflow behind the scenes.

## What The Rebuild Does

Behind the web app, the agent will:

1. Read the project definition and open questions.
2. Check for human review notes and prior changes.
3. Refresh or create source notes.
4. Organize source notes into a wiki when requested.
5. Build the requested final outputs.
6. Run project health checks.
7. Write change logs and a rebuild summary.
8. Save a project snapshot when possible.

## Where To Review Results

Use the web app:

- **Build the project:** status, runtime readiness, and review notes.
- **Source data view:** source material and generated source notes.
- **Outputs Built:** reports, wiki pages, and final deliverables.
- **Define the requirements:** open questions and project definition changes.

## Behind The Scenes

The web app stores rebuild results in local project files:

- `inputs_ai/` for AI-prepared source notes.
- `outputs_ai/` for generated outputs.
- `change_logs/` for summaries and review history.
- `.harness-state.json` for runtime state.

On the first rebuild, the agent creates an initial baseline before generating AI-managed content. That baseline helps future rebuilds detect annotations and file changes.

If first-build signals conflict, web and non-interactive rebuilds should not pause for a mid-run question. The agent should choose the conservative path, continue when technically possible, and record a human-attention item for later review.

During input refresh, the agent should verify the actual contents of `inputs_human/` from the filesystem. It should not assume human inputs are missing from a single search result.

During each rebuild, the agent chooses the right processing mode automatically. You do not need to choose between simple, dependency-tracked, or large-project modes.

## When The Rebuild Finishes

Review:

- the build status in the web app;
- the latest build summary;
- any review notes or human attention items;
- the generated outputs;
- any open questions.

If a rebuild finishes with caveats, the generated outputs may still be useful, but the caveats explain what needs human review.

## Advanced Direct Command

Maintainers may run the framework command directly from a project root:

```text
../_kiss_ai/framework/commands/do_all_rebuild.md
```

This is an advanced fallback, not the normal user workflow.
