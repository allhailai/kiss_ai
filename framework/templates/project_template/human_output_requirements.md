# Output Requirements

## Purpose

Describe what the project should produce.

## Wiki Requirements

If the project should create a wiki, describe:

- source paths
- output path
- topic hints
- required article sections
- citation style
- coverage or confidence rules
- how open questions should appear

Wiki page depth rules to define:

- Every wiki page should start with a thorough but concise `Summary`.
- Pages should incorporate the important and salient facts from every mapped source, not only link to source files.
- The build should create a source-to-page ledger, draft page by page, and run a second-pass coverage review.
- Required sections with no support should be marked `N/A - no source support yet` or surfaced as open questions.
- Coverage annotations should appear inline on generated section headings using the framework's default lower-emphasis heading style, not as standalone coverage-only lines.
- Add filename or slug prefixes where useful for human scanning, using project-defined naming rules.
- Concept pages should be deep enough to stand alone, with definitions, examples, mechanism, dependencies, limits, measurement implications, and review caveats.

## Directed Outputs

List each final deliverable the project should create under `outputs_ai/`.

For each output, include:

- file path
- intended audience
- required structure
- required source support
- review caveats

## Scale And Dependency Rules

The agent should run a scaling assessment during every rebuild and automatically escalate when output complexity risks shallow or stale synthesis.

Start simple. Leave project-specific ledger details blank unless the project truly needs them; the agent still runs baseline source-to-page, output dependency, stale-output, blocked-output, and preservation checks on every rebuild.

If the project grows, define output families, dependency maps, intermediate ledgers, coverage ledgers, stale-output rules, and low-confidence handling needed to keep final outputs reliable. The agent should choose whether to stay simple, persist baseline dependency tracking, or escalate to the full large-project workflow. Escalation may require a one-time broader rebuild to establish dependency maps or intermediate ledgers. Preserve unchanged outputs only when their sources, wiki pages, ledgers, schemas, and requirements are unchanged.

The user does not choose the scaling mode. Approving a schema, source-exclusion, output-structure, or review-gate change is not a scaling-mode decision.

## Citation Standards

Describe when the agent must cite source files, wiki articles, or both.

Source and wiki references should be clickable in Obsidian. For files outside the generated file's folder, use relative Markdown links such as `[inputs_ai/example.md](../inputs_ai/example.md)`, not code-formatted paths.

## Review Gates

List changes that require user approval before rebuilding outputs, such as scope changes, source exclusions, output structure changes, or unresolved blockers.
