# Migrating Existing Projects to kiss_ai v2

This guide is for migrating projects that were created with the v1 architecture (three requirement files, `.harness-state.json`, `inputs_ai/` tree) to the v2 architecture (single `project.md`, `.build/manifest.json`, `sources/` cache).

## What Changed

| v1 | v2 | Notes |
|----|-----|-------|
| `human_goal_requirements.md` | `project.md` | Merged into single file |
| `human_input_requirements.md` | `project.md` | AI infers source needs from topics |
| `human_output_requirements.md` | `project.md` | Built-in wiki + user-listed directed outputs |
| `human_open_questions.md` | `questions.md` | Renamed |
| `human_design_identity.md` | `human_design_identity.md` | Unchanged |
| `.harness-state.json` | `.build/manifest.json` | Simplified build record |
| `inputs_ai/` | `sources/` | Lightweight cache, flat organization |
| `inputs_ai/source_inventory.md` | `sources/source_log.md` | Single ledger |
| `inputs_ai/source_category_coverage.md` | `sources/source_log.md` | Merged |
| `inputs_ai/data_refresh_log.md` | `sources/source_log.md` | Merged |
| `change_logs/change_logs.md` | `change_logs/builds.md` | Simplified |
| `change_logs/annotation_change_logs.md` | Eliminated | Replaced by FEEDBACK markers |
| `change_logs/human_attention_queue.md` | Eliminated | Replaced by AI_SUGGESTION markers |
| `change_logs/summaries/` | Eliminated | Build log in builds.md |
| `.conceptual-diff-memory.json` | Eliminated | |
| `.kiss_ai/runtime/rebuild_plan.json` | Eliminated | |
| Git-diff annotation detection | `<!-- FEEDBACK: ... -->` markers | Explicit, user-initiated |

## Migration Steps

### Step 1: Create `project.md`

Create a new `project.md` at the project root by consolidating your three requirement files. Use this structure:

```markdown
# Project: [Your Project Name]

## Goal
[Take the key content from human_goal_requirements.md — the objective,
audience, scope, and what the project should help you decide.
Remove framework-specific language and keep your intent.]

## My Context
[Move any personal context, planning context, or user-specific
information here from wherever it appeared in the three files.]

## Key Questions
[List the practical questions from your goal file's Decision Criteria
section and any other questions scattered across the three files.]

## Topics
[Consolidate the topic areas from your goal's In Scope section.
List them as simple bullets — no need for detailed sub-categories.]

## Directed Outputs
[List the outputs from human_output_requirements.md's directed outputs
section. Describe each briefly — what it is and who it's for.
You don't need to specify exact structure — the AI will figure that out.]

## Constraints
[Consolidate constraints from all three files: what to avoid,
what rules to follow, source preferences, etc.]

## Output Guidance
[Optional. Move any lasting formatting or structural rules here.
For example: "always include historical comparisons going back to 2008"
or "sort risk tables by severity".]
```

**Tip:** Use AI Assist to help. Open the three old requirement files, paste their content into a conversation, and ask the AI to consolidate them into a single `project.md`.

### Step 2: Rename `human_open_questions.md` to `questions.md`

```sh
mv human_open_questions.md questions.md
```

### Step 3: Create the new directory structure

```sh
mkdir -p sources/web_research sources/extracted .build
```

### Step 4: Move source content (optional)

If your `inputs_ai/` has useful source files you want to preserve:

```sh
# Move web research files to the new location
mv inputs_ai/* sources/web_research/
```

Or simply let the next build re-gather sources from scratch. The old `inputs_ai/` content was an intermediate cache — the next build will recreate what it needs.

### Step 5: Create `.build/manifest.json`

```json
{
  "version": 1,
  "project_name": "Your Project Name",
  "last_build": null,
  "project_md_hash": null,
  "scope": null,
  "wiki_pages": [],
  "directed_outputs": [],
  "sources_gathered": 0,
  "sources_refreshed": 0,
  "feedback_applied": 0,
  "suggestions_added": 0,
  "suggestions_accepted": 0,
  "suggestions_dismissed": 0,
  "inputs_human_inventory": [],
  "build_notes": null
}
```

### Step 6: Create `sources/source_log.md`

```markdown
# Source Log

Last updated: (not yet built)

## Active Sources

| Source | Type | URL / Path | Last Checked | Freshness | Used By | Notes |
|--------|------|-----------|--------------|-----------|---------|-------|

## Gaps

## Stale Sources
```

### Step 7: Create `change_logs/builds.md`

```markdown
# Build Log

Build history for this project. Newest entries first.

---

## Migration to v2

- Migrated from three requirement files to single `project.md`
- Moved from `.harness-state.json` to `.build/manifest.json`
- Moved from `inputs_ai/` to `sources/`
- Previous build history preserved in `change_logs/change_logs.md` (if it exists)
```

### Step 8: Clean up old files (optional)

After confirming the migration works, you can remove old files:

```sh
# Old requirement files (content is now in project.md)
rm human_goal_requirements.md
rm human_input_requirements.md
rm human_output_requirements.md

# Old state tracking
rm .harness-state.json
rm -f .conceptual-diff-memory.json
rm -rf .kiss_ai/runtime/

# Old inputs tree (if content was moved to sources/)
rm -rf inputs_ai/

# Old change log files (keep change_logs/ directory)
rm -f change_logs/annotation_change_logs.md
rm -f change_logs/human_attention_queue.md
rm -rf change_logs/summaries/
```

Or keep the old files around for reference — they won't interfere with v2 builds.

### Step 9: Run the first v2 build

```
Run ../_kiss_ai/framework/commands/do_build.md from the project root.
```

The build will treat this as a first build (since the manifest shows no prior build), create a baseline commit, and generate all outputs fresh.

## Notes

- `human_design_identity.md` is unchanged between v1 and v2. No migration needed.
- `inputs_human/` is unchanged. No migration needed.
- `outputs_ai/` will be regenerated by the first v2 build. Existing outputs will be overwritten. If you want to preserve old outputs, copy them somewhere before building.
- The v2 build does not use any of the old v1 files. If old files exist but the new files also exist, the build ignores the old ones.
