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

Three user-facing entry points and seven pipeline sub-commands:

### User-facing commands

- [`commands/do_build.md`](commands/do_build.md) — Build the project. Reads `project.md`, gathers sources, processes annotations, generates outputs, leaves suggestions, and git snapshots. This is the single build entry point.
- [`commands/do_assist.md`](commands/do_assist.md) — AI Assist. Helps users edit `project.md`, draft annotations, answer questions, and understand outputs. Does not modify files directly.
- [`commands/do_init_project.md`](commands/do_init_project.md) — Create a new project from the template.

### Pipeline sub-commands

These are invoked by the build pipeline (`agentJobs.js`) or prompt builders, not run directly by users:

- [`commands/do_build_research.md`](commands/do_build_research.md) — Phase 1 research: source gathering and web research.
- [`commands/do_build_file.md`](commands/do_build_file.md) — Single file synthesis from source material.
- [`commands/do_build_wiki_page.md`](commands/do_build_wiki_page.md) — Wiki page synthesis sub-phase.
- [`commands/do_build_artifact.md`](commands/do_build_artifact.md) — Artifact build from spec and sources.
- [`commands/do_deepen.md`](commands/do_deepen.md) — Targeted deeper research for specific topics.
- [`commands/do_propose_output_artifacts.md`](commands/do_propose_output_artifacts.md) — Propose artifact specs from project outputs.
- [`commands/do_resolve_human_attention_item.md`](commands/do_resolve_human_attention_item.md) — Resolve a human attention queue item.

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
