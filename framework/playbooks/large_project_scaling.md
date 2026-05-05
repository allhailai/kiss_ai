# Optional Playbook: Large Project Scaling

Use this playbook when a project is growing enough that a single broad pass over every source and every output risks shallow synthesis, stale outputs, missed source details, or inconsistent recommendations.

The generic framework default is still simple: read requirements, refresh sources, organize a wiki, build outputs, lint, and snapshot. This playbook adds structure for larger projects without adding any domain-specific assumptions.

The agent, not the user, is responsible for deciding when this playbook applies. Every rebuild should run a lightweight scaling assessment and record whether the project stays on the simple workflow, uses baseline dependency tracking only, or escalates to the full large-project workflow.

## Scaling Modes

The user does not choose a scaling mode. The agent chooses and records one of these modes during every rebuild:

- `simple`: normal build flow with the baseline safeguards still active.
- `baseline_dependency_tracking`: normal build flow plus persisted dependency maps, stale-source detection, stale-output detection, and explicit preservation decisions.
- `large_project_scaling`: full workflow with project-defined intermediate ledgers, staged synthesis, and focused incremental rebuilds.

All modes use the baseline safeguards. The mode controls how much extra structure the agent must add, not whether dependency safeguards exist. Even in `simple` mode, record enough source inventory, source-to-page mapping, output dependency mapping, stale detection, and preservation rationale to justify what changed and what remained unchanged.

## Choosing Among Modes

Choose the mode automatically during every rebuild:

- Use `simple` when the project has low source/output complexity and the standard baseline safeguards are enough to explain what changed, what stayed unchanged, and why.
- Use `baseline_dependency_tracking` when the full large-project workflow is not required, but dependency maps, stale-source/stale-output records, and preservation decisions should be persisted because sources, wiki pages, or outputs can change independently.
- Use `large_project_scaling` when the escalation rubric below is met and the project needs project-defined intermediate ledgers, staged synthesis, or focused incremental rebuilds to avoid degraded output quality.

Do not present these modes as choices to the user. Continue with documented caveats for material source or output-impact findings. If a requirement, schema, or source-exclusion decision is unresolved, choose the conservative default supported by current requirements, record a human-attention item, and continue when technically possible.

## When To Use

Consider this playbook when the project has:

- many source categories;
- many human-owned files or large binary inputs;
- several output families;
- matrix-like, comparative, prioritization, strategy, or decision-support outputs;
- repeated refreshes where only some source categories change;
- outputs that depend on different subsets of sources;
- recurring low-coverage, stale-output, or over-compressed synthesis problems.

## Scaling Assessment

Run this assessment during every rebuild after input refresh and before downstream generation. Users do not need to request it.

Use the baseline workflow for all projects:

- verified source inventory;
- source-to-page mapping for wiki pages;
- output dependency mapping for directed outputs;
- stale-source and stale-output detection;
- blocked, missing-source, and low-confidence reporting;
- preservation of unchanged outputs only when dependencies are unchanged.

The baseline source-to-page and output dependency records may be stored inline in `.harness-state.json`, in compile state, or in a project-defined ledger path. Additional intermediate ledgers under `inputs_ai/<project-ledgers>/` are only required when the project requirements define them or the assessment escalates to `large_project_scaling`.

Escalate to the full large-project workflow when two or more of these signals are present, or when one signal is severe enough to risk degraded output quality:

- many human-owned files, large binary inputs, or generated source files;
- many source categories or distinct source schemas;
- several output families or outputs with different audiences;
- matrix-like, comparative, prioritization, scoring, strategy, recommendation, or decision-support outputs;
- outputs that depend on different subsets of sources, wiki pages, or intermediate evidence;
- repeated rebuilds where only some source categories change;
- stale-output warnings, low-coverage warnings, or shallow synthesis from a prior run;
- missing, unreadable, or low-confidence sources that affect final conclusions;
- final outputs that are too large to synthesize reliably from raw sources in one pass.

Severe single signals include high-impact decision outputs, one output depending on many heterogeneous source types, prior shallow or stale synthesis, or an uncertain dependency map that makes preservation decisions unreliable.

On first escalation, build or refresh the minimum project-defined ledgers needed to make dependencies explicit. If the requirements do not yet define useful ledger names or schemas, continue with the strongest available baseline safeguards instead of inventing hidden structures. A broader rebuild may be needed once to establish the new baseline. Record whether that broader rebuild was completed, partially completed, or deferred with caveats. After that, use the ledgers to keep incremental rebuilds focused.

If escalation is required but the project requirements do not yet define the needed ledger schemas, continue with baseline dependency tracking and record the missing schema as a caveat or deferred requirement decision. Do not invent hidden ledger structures that are not represented in the project requirements.

Do not ask non-technical users to choose the scaling mode. When escalation would benefit from a material requirement change, a new output schema, or exclusion of a required source, record the decision as a human-attention item and continue with the strongest current-requirements interpretation that can execute safely.

## Core Pattern

Large projects should be built through explicit intermediate layers:

```text
inputs_human/                human-owned source material
inputs_ai/                   AI-managed source extractions and source summaries
inputs_ai/<project-ledgers>/  project-defined intermediate evidence ledgers
outputs_ai/wiki/             organized topic and concept synthesis
outputs_ai/                  final directed outputs
```

The intermediate ledger names and schemas are project-defined in `human_input_requirements.md` and `human_output_requirements.md`.

## First-build baseline (large projects)

Before relying on incremental scoped refreshes, large **first** builds must establish a **complete baseline** of source coverage:

- Treat `human_input_requirements.md` as a source-acquisition contract: every **required** source category and expected `inputs_ai/` leaf path must be either populated with source-backed content or documented with an explicit gap/status file per `framework/commands/do_get_inputs.md` and `framework/skills/refresh_inputs.md`.
- **Empty required leaf directories are not acceptable** as silent scaffolding. Optional-only categories must be labeled optional in requirements; otherwise lint may emit critical findings (see `framework/commands/do_lint.md`).
- Broad source coverage across required categories should exist **before** final synthesis stages that commit strategic or decision outputs.
- If full acquisition is infeasible in one run, the build must create explicit gap files, update open questions, mark affected outputs **low-confidence**, **stale before rebuild**, **rebuilt with caveats**, or **blocked only when impossible to generate** as appropriate, and record this in `.harness-state.json` and run summaries.

## Incremental Build Workflow

For larger projects, each rebuild should determine the impacted scope before regenerating downstream outputs—**after** a complete baseline exists per **First-build baseline** above.

1. Read requirements and current build state.
2. Inventory human-owned inputs directly from the filesystem.
3. Compare source inventory, source metadata, file paths, content hashes, or modified times when available.
4. Identify changed, missing, deleted, stale, and unchanged source files.
5. Map changed sources to affected source categories, wiki pages, intermediate ledgers, and final outputs.
6. **Refresh only the affected AI-managed sources** only when baseline coverage is complete, dependency maps are reliable, and stale-source detection shows unrefreshed categories remain current and not needed for outputs being rebuilt—unless requirements request a full refresh or uncertainty warrants a broader pull (see `framework/commands/do_get_inputs.md`).
7. Rebuild affected wiki pages from complete source bundles, not from changed files alone.
8. Refresh affected intermediate ledgers before final outputs that depend on them.
9. Rebuild affected final outputs.
10. Run coverage and consistency checks for all outputs that were rebuilt or may now be stale.

## Subsequent builds after baseline

**Incremental refresh** (narrow scope) is allowed only when:

- required source categories are not silently empty (every required path is populated or has a qualifying gap file),
- dependency maps and coverage ledgers show which outputs depend on which categories, and
- stale-source detection and change signals indicate categories left unrefreshed are still current **and** not required for outputs being regenerated.

If any required category is missing, stale, newly required, or dependency-uncertain for changed outputs, refresh **broadly enough** to restore coverage rather than preserving shallow or stale downstream synthesis.

If the impact map is uncertain, prefer a broader rebuild for the uncertain area and record the uncertainty in the run summary.

## Ledgers To Consider

Projects can define any intermediate ledgers they need. Common generic ledger types include:

- source inventory ledger;
- source-to-page coverage ledger;
- topic dependency ledger;
- output dependency ledger;
- comparison matrix input ledger;
- scoring or rating factor ledger;
- strategy assumption ledger;
- coverage or completeness ledger;
- open-question ledger.

Do not create these files automatically for every project. Add them when the project requirements say the added structure is useful.

## Requirement Guidance

For large projects, `human_input_requirements.md` should define:

- source categories;
- expected source paths;
- source schemas;
- refresh cadence or refresh triggers;
- material-change rules;
- intermediate ledgers required before final output synthesis;
- open questions that must appear as downstream output caveats.

For large projects, `human_output_requirements.md` should define:

- output families;
- output dependency expectations;
- stable table or section schemas;
- which outputs require intermediate ledgers;
- coverage ledgers or completeness checks;
- caveat rules for low-confidence or high-impact conclusions.

## Quality Gates

Large-project rebuilds should rebuild affected outputs and clearly mark caveats, stale-before-rebuild status, or low-confidence areas when:

- required source categories are missing;
- source extraction fails for a required human-owned file;
- a source category changes materially and dependent outputs need refresh;
- a final output depends on an intermediate ledger that is missing or stale;
- coverage review finds shallow synthesis, link-only sections, or missing required sections;
- low-confidence conclusions are presented without caveats;
- material recommendations are unsupported by cited sources.

Stop only for fatal execution blockers, such as unreadable required human-owned files with no allowed deferral, missing required project files, impossible schemas, command failures, or Git/framework snapshot problems.

## Reporting

Completion summaries for large projects should include:

- sources checked, changed, skipped, and blocked;
- source categories affected;
- intermediate ledgers refreshed;
- wiki pages rebuilt;
- final outputs rebuilt;
- outputs left unchanged;
- outputs marked stale;
- low-confidence areas;
- unresolved review items.

This keeps large projects from relying on one broad synthesis pass and gives future rebuilds a durable map of what changed and what must be refreshed next.
