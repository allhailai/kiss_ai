# do_write_rebuild_summary

Write a per-rebuild summary report after the full rebuild steps have completed.

## Preconditions

- Run from the project root.
- The project root contains `.harness-state.json`.
- The rebuild has already run annotation processing, input refresh, wiki organization, output build, and lint.
- `change_logs/` exists. If `change_logs/summaries/` does not exist, create it before writing the report.

## Inputs

- `.harness-state.json`
- `change_logs/change_logs.md`
- `change_logs/annotation_change_logs.md`
- `change_logs/human_attention_queue.md`
- human requirement files
- `human_open_questions.md`
- shared `run_timestamp` established by the parent `do_all_rebuild.md` command
- current Git status and Git diff from the project root
- step summaries from the current `do_all_rebuild.md` run

## Instructions

1. Read `.harness-state.json` and resolve the summary directory:
   - Prefer `.harness-state.json.paths.build_summaries` when present.
   - Otherwise use `change_logs/summaries/`.
2. Ensure the summary directory exists.
3. Use the shared `run_timestamp` established by `do_all_rebuild.md`.
   - Do not create a separate timestamp unless this command is run standalone.
   - When run standalone, use the current local ISO timestamp and report that no parent rebuild timestamp was provided.
4. Determine the report file path:
   - Use `YYYY_MM_DD_build.md` based on the run timestamp.
   - If the file already exists, append a new timestamped rebuild section to it.
   - If the file does not exist, create it with `# YYYY_MM_DD Build Summary` followed by the first section.
5. Collect changed artifacts from:
   - `git status --short`
   - `git diff --name-only HEAD --`
   - `.harness-state.json.rebuild_scope`
   - `.harness-state.json.last_input_refresh`
   - `.harness-state.json.last_wiki_compile`
   - `.harness-state.json.last_output_build`
   - `.harness-state.json.last_lint`
   - annotation scan results from `.harness-state.json.last_annotation_scan`
   - human-attention items from `.harness-state.json.extensions.human_attention.open_items`
6. Classify changes into:
   - global rebuild changes
   - human input or requirement changes
   - AI input changes
   - output changes, including wiki pages and directed outputs
7. Write a concise, source-grounded summary. Do not invent implications beyond the run evidence.
8. Use project-relative Markdown links for files. Do not use code-formatted paths when a link is practical.
9. Omit empty subsections, but keep the three top-level levels so the report is easy to scan.
10. Include a `### Human Attention Required` section when open attention items exist. Group items by severity and link to `change_logs/human_attention_queue.md`.
11. Return summary metadata to the parent rebuild finalization so `do_all_rebuild.md` can update `.harness-state.json.extensions.rebuild_summaries` with the same `run_timestamp`.

## Report Structure

Each rebuild section should use this shape:

```markdown
## <ISO timestamp> - Rebuild Summary

### Global Level

<Terse executive summary.>

- <Salient conceptual or informational change, with links when relevant.>
- <Caveat, unresolved item, or Git snapshot status when relevant.>

### Inputs Level

#### Human Inputs

<Only include when human-owned files or requirements changed.>

#### AI Inputs

<Only include when `inputs_ai/**` changed or source inventory/coverage changed.>

### Outputs Level

<Executive summary of output changes.>

- <Wiki page, directed output, stale artifact, preserved artifact, or blocked item with links.>

### Human Attention Required

- <Severity/category: issue summary. Default action taken. Human next action.>
```

## Summary Metadata

When the parent `do_all_rebuild.md` command updates `.harness-state.json`, record:

- `extensions.rebuild_summaries.latest_summary_path`
- `extensions.rebuild_summaries.latest_summary_section_timestamp`
- `extensions.rebuild_summaries.latest_summary_status`
- `extensions.rebuild_summaries.latest_summary_notes`

For existing projects, merge this object into `extensions` without removing project-specific extension keys.

## Output

Report:

- summary file path
- whether the report was created or appended
- timestamp used
- human input changes summarized
- AI input changes summarized
- outputs summarized
- human-attention items summarized
- caveats, unresolved items, or missing evidence
