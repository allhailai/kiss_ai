# kiss_ai Framework

This is maintainer documentation for the reusable framework. Non-technical users should start with [`../README.md`](../README.md) and the web app.

This folder contains the reusable `kiss_ai` framework. Commands are the user-facing workflows; templates are used to initialize new research projects.

## Runtime Contract

The framework assumes an LLM agent is executing the command files. Commands should be explicit enough that the agent can perform the work with file, Git, and shell tools without relying on hidden plugin behavior. Build commands must be non-interactive when launched from the web UI: do not wait for human confirmation mid-run; leave `AI_SUGGESTION` markers in output files and continue when technically possible.

## Core Invariants

- `project.md` is the single source of truth for project requirements.
- `human_design_identity.md` defines project identity and design tokens.
- `inputs_human/` is user-owned.
- `sources/**` and `outputs_ai/**` are AI-managed.
- Users interact with AI-managed files through `<!-- FEEDBACK: ... -->` annotation markers, not direct editing.
- The AI may leave `<!-- AI_SUGGESTION: ... -->` markers in output files for user review.
- Generated outputs must be reproducible from `project.md` and available sources.

## File Ownership

**User-owned (direct edit):**
- `project.md`
- `human_design_identity.md`
- `inputs_human/**`

**AI-managed (read + annotate only):**
- `sources/**`
- `outputs_ai/**`
- `questions.md`
- `.build/manifest.json`
- `change_logs/**`

## Commands

Three commands:

- [`commands/do_build.md`](commands/do_build.md) — Build the project. Reads `project.md`, gathers sources, processes annotations, generates outputs, leaves suggestions, and git snapshots. This is the single build entry point.
- [`commands/do_assist.md`](commands/do_assist.md) — AI Assist. Helps users edit `project.md`, draft annotations, answer questions, and understand outputs. Does not modify files directly.
- [`commands/do_init_project.md`](commands/do_init_project.md) — Create a new project from the template.

When a command mentions `framework/...`, it means this centralized framework root. From a normal project folder, the explicit path is usually `../_kiss_ai/framework/...`, unless `KISS_AI_FRAMEWORK_ROOT` points somewhere else.

## Annotation System

Two marker types exist in AI-managed markdown files:

**`<!-- FEEDBACK: ... -->`** — User-to-AI. Added via the web UI [+] affordance. The build applies the feedback and removes the marker.

**`<!-- AI_SUGGESTION: ... -->`** — AI-to-user. Added by the build. Users can accept (executed on next build), dismiss (removed), or modify (becomes FEEDBACK).

## Project Template

The template under `templates/project_template/` provides the standard project structure:

```text
project.md
human_design_identity.md
questions.md
README.md
inputs_human/
sources/
  source_log.md
  web_research/
  extracted/
outputs_ai/
  wiki/
.build/
  manifest.json
change_logs/
  builds.md
```

## Migration

Projects created with the v1 architecture (three requirement files, `.harness-state.json`) should be migrated using the guide at [`../migration.md`](../migration.md).
