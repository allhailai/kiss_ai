# How To Run A Rebuild

A rebuild means asking the agent to run:

```text
../_kiss_ai/framework/commands/do_all_rebuild.md
```

## Before Rebuild

From the research project folder, make sure you have:

- filled in `human_goal_requirements.md`;
- filled in `human_input_requirements.md`;
- filled in `human_output_requirements.md`;
- answered any known items in `human_open_questions.md`;
- added notes, source lists, or documents to `inputs_human/`.

## Agent Command

Ask:

```text
Run the kiss_ai rebuild for this project.
```

On the first build, the agent should create an initial human-authored baseline Git commit before generating AI-managed content. This baseline should include the requirement files, `inputs_human/`, change logs, state, README, and only placeholder files from `inputs_ai/` or `outputs_ai/` unless the user explicitly includes other generated content. It should not include a copied project-local `framework/` folder.

The agent should detect a first build when `.harness-state.json` has no `last_successful_run_at`, run-state blocks are still `not_run` including scaling assessment and rebuild scope, Git has no commits, or no committed generated baseline exists under `inputs_ai/` and `outputs_ai/`. If these signals conflict, the agent should ask before building.

After the baseline step, the agent should process annotations, refresh or build `inputs_ai/`, run the automatic scaling assessment, organize wiki content when requested, build directed outputs, lint outputs, and commit a rebuild snapshot if the run succeeds.

During the input-refresh step, the agent must first build a verified inventory of `inputs_human/` from the filesystem. The agent should not rely on a single glob/search result to decide that human inputs are absent. The rebuild report should include the verified inventory and call out any unreadable or excluded non-placeholder files.

During every rebuild, the agent chooses whether the project can stay simple, needs persisted baseline dependency tracking, or needs the full large-project workflow. The user does not choose this mode. Baseline safeguards always apply: source inventory, source-to-page mapping, output dependency mapping, stale-source/stale-output checks, blocked or low-confidence reporting, and preserving unchanged outputs only when dependencies are unchanged.

## Where Outputs Appear

- AI working sources: `inputs_ai/`
- AI generated outputs: `outputs_ai/`
- Change logs: `change_logs/`
- Human review questions: `human_open_questions.md`

If the agent finds a material change, missing schema, source exclusion, review gate, or ambiguous annotation, it should stop and ask before regenerating downstream outputs. When it stops, it should mark affected wiki pages or outputs as stale, blocked, or pending rebuild in `.harness-state.json`.
