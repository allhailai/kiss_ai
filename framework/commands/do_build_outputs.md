# do_build_outputs

Build goal-directed deliverables from requirements, human context, AI-managed inputs, and the compiled wiki.

## Inputs

- `human_goal_requirements.md`
- `human_input_requirements.md`
- `human_output_requirements.md`
- `human_open_questions.md`
- `inputs_human/**`
- `inputs_ai/**`
- `outputs_ai/wiki/INDEX.md`
- relevant `outputs_ai/wiki/topics/**`
- relevant `outputs_ai/wiki/concepts/**`
- project-configured wiki paths when `human_output_requirements.md` or `.harness-state.json.paths.wiki` explicitly defines a different wiki root

## Instructions

1. Read all three human requirement files and `human_open_questions.md`.
2. Identify required directed outputs from `human_output_requirements.md`.
3. Validate that the wiki exists and is current enough for the requested output build.
4. Read the scaling assessment from `.harness-state.json` or the current rebuild summary. If the assessment is missing, incomplete, or older than the current input/wiki refresh, run the full rebuild-level scaling assessment from `framework/playbooks/large_project_scaling.md` before drafting. At minimum, include the output-side signals:
   - count output families and distinct audiences;
   - identify matrix-like, comparative, prioritization, scoring, strategy, recommendation, or decision-support outputs;
   - identify outputs that depend on different subsets of sources, wiki pages, intermediate ledgers, schemas, or open questions;
   - identify stale-output, low-coverage, blocked-output, or shallow-synthesis risks.
5. If output-side signals newly meet the `large_project_scaling` escalation criteria, update `.harness-state.json.scaling_assessment`, widen rebuild scope as needed, and either build through the required project-defined ledgers or mark the affected outputs blocked/stale until the needed requirement or schema decision is made. Do not continue final drafting under a simpler mode when the dependency map is uncertain or output quality is at risk.
6. For projects escalated to `large_project_scaling`, and for any large, cross-source, matrix-like, comparative, or strategy outputs, build through project-defined intermediate ledgers before final synthesis:
   - Identify any intermediate source files, schemas, or ledgers required by `human_input_requirements.md` or `human_output_requirements.md`.
   - Create or refresh those intermediate AI-managed source files before drafting final outputs.
   - Treat intermediate files as evidence ledgers: they should preserve source support, assumptions, confidence, gaps, and open questions.
   - Final directed outputs should consume the intermediate ledgers instead of re-synthesizing every raw source in one broad pass.
   - If required by project output requirements, create a coverage ledger that reports expected rows or items, generated rows or items, skipped rows or items, low-confidence areas, weak source coverage, and unresolved review needs.
7. Build an output dependency map before writing final outputs:
   - Map each required output to the wiki pages, source files, intermediate ledgers, schemas, and open questions it depends on.
   - Compare that dependency map to prior build state when available.
   - Identify outputs to rebuild, outputs that can remain unchanged, outputs to mark stale, and outputs blocked by missing or low-confidence sources.
8. For each required output:
   - read the required wiki articles and source files
   - follow the exact required output structure
   - cite wiki articles and source files for material claims
   - make citations and source references clickable using relative Markdown links from the generated file to the referenced file, not code-formatted paths
   - surface unresolved questions instead of inventing answers
   - write final directed outputs only under `outputs_ai/`; the only allowed non-output writes in this command are intermediate AI-managed source files explicitly required by the project requirements
9. For final analytical, strategy, recommendation, prioritization, or decision-support outputs:
   - Use stable schemas defined in `human_output_requirements.md`.
   - Preserve uncertainty and distinguish source-backed conclusions from assumptions, hypotheses, and open questions.
   - Do not present recommendations, impacts, risks, or conclusions as settled unless the cited sources and project requirements support them.
10. Preserve unchanged outputs only when their source, wiki, ledger, schema, and requirement dependencies are unchanged. Record preserved outputs and the dependency rationale in `.harness-state.json`.
11. Update `.harness-state.json` with directed output status, including output-side scaling signals, output dependency map status, intermediate ledger source status, coverage ledger status, stale output warnings, blocked outputs, low-confidence outputs, unchanged outputs, and preservation decisions when applicable.
12. Prepend a summary to `change_logs/change_logs.md` when outputs are created or materially changed.

## Output Standards

Every directed output should include:

- what sources it relied on
- which wiki articles support the conclusions
- open questions or blockers
- low-confidence areas
- any compliance, safety, or review caveats required by the project

Final Markdown reports should start with the human-facing report content, such as the title, executive summary, or first required section. Do not put YAML/frontmatter blocks or internal build metadata at the top of generated reports unless `human_output_requirements.md` explicitly requires that format for a downstream tool.

Handle technical-looking metadata this way:

- Omit metadata that is useful only to the generating agent and already exists in `.harness-state.json`, dependency maps, ledgers, citations, or change logs.
- Put reusable technical metadata at the bottom in a section such as `## Technical build notes` when it materially helps future rebuilds, review, or traceability.
- Keep reader-relevant evidence limits, confidence issues, path caveats, source gaps, and disclaimers in normal report sections where a non-technical reader will see them.

## Output

Report:

- outputs expected
- outputs written
- outputs skipped and why
- outputs unchanged and why
- outputs marked stale
- unresolved blockers
- citations or coverage warnings that need review
- output-side scaling signals
- output dependency map status
- intermediate ledger status when project-defined intermediate ledgers are requested
