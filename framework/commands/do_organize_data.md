# do_organize_data

Compile AI-managed inputs into a navigable wiki under the configured wiki path, defaulting to `outputs_ai/wiki/`.

## Inputs

- `human_input_requirements.md`
- `human_output_requirements.md`
- `human_open_questions.md`
- `inputs_ai/**`
- existing `outputs_ai/wiki/schema.md`, if present
- existing `outputs_ai/wiki/.compile-state.json`, if present
- project-configured wiki schema or compile-state paths when `human_output_requirements.md` or `.harness-state.json.paths.wiki` explicitly defines a different wiki root

## Instructions

1. Read `human_output_requirements.md` and extract the wiki requirements:
   - source directories
   - wiki output path
   - topic hints
   - article sections
   - concept rules
   - citation/link style
   - coverage rules
   - open-question handling
2. Read `.harness-state.json.scaling_assessment`. If the selected mode is `large_project_scaling`, follow `framework/playbooks/large_project_scaling.md` for incremental scope, project-defined ledgers, coverage review, and uncertainty handling.
3. Invoke `framework/skills/compile_wiki.md`. Ensure **Phase 6** of that skill merges any recent wiki `schema.md` edits under the configured wiki path that were logged in `change_logs/annotation_change_logs.md` (see `do_process_annotations.md`, wiki schema section), so human schema curation is incorporated rather than wiped by a naive regenerate.
4. Compile from every wiki source path listed in `human_output_requirements.md`, plus generated source Markdown under `inputs_ai/**`. If the requirements list `inputs_human/`, include human-owned Markdown directly and include binary human sources through verified inventory and `inputs_ai/**` extraction files.
5. Build and use a source-to-page ledger before drafting pages. The ledger should map each intended wiki page to assigned source files, salient facts, required sections, and source gaps.
6. Compare the source-to-page ledger to prior compile state when available. Identify affected pages, unchanged pages, removed pages, stale pages, and pages whose source mapping is uncertain.
7. Draft affected pages one at a time from the full source bundle assigned to that page. Do not draft from changed files alone when unchanged files are part of the page's required source bundle.
8. Preserve unchanged pages only when their source bundle, required sections, naming rules, and output requirements are unchanged. Record each preservation decision in `.harness-state.json.rebuild_scope.preservation_decisions` or the wiki compile state.
9. Run a second-pass coverage review that checks required sections, page summaries, citations, link-only sections, unincorporated salient facts, stale pages, and open questions.
10. Treat project-level auxiliary files, such as `human_open_questions.md`, as human review context when the requirements name them. Do not count them as required source inventory unless the requirements explicitly say to.
11. Write generated wiki files only under the configured wiki path. Default to `outputs_ai/wiki/`; use a different wiki root only when project requirements explicitly define one.
12. Do not modify `human_input_requirements.md`, `human_output_requirements.md`, or `inputs_human/**`.
13. Update `.harness-state.json` with wiki compile status, affected page inventory, unchanged page inventory, stale page warnings, uncertain mappings, low-confidence pages, source-to-page ledger status, and relevant rebuild-scope preservation decisions.
14. Prepend a compile summary to `change_logs/change_logs.md` when the wiki structure or output inventory changes.

## Output

Report:

- sources scanned
- changed sources
- topics created or updated
- concepts created or updated
- schema changes
- source-to-page coverage warnings
- affected, unchanged, stale, or uncertain wiki pages
- required sections satisfied or waived
- open questions surfaced
- low-coverage areas
