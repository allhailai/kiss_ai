# Step Inputs Prompt

Target file: `human_input_requirements.md`

Purpose: ensure input requirements fully support the controlling goal.

Use the accepted or current `human_goal_requirements.md` as the source of truth. Review the current input requirements, output requirements, open questions, Git edit signals, AI-managed annotations, and human input/source signals.

The input file should clearly capture:

- required source categories and evidence standards
- specific websites, source types, links, datasets, documents, or organizations to check
- exclusions and source quality constraints
- source freshness expectations and current-event sensitivity
- expected `inputs_ai/**` organization, ledgers, manifests, or gap files when required
- handling for unreadable or binary `inputs_human/**` files
- how source coverage should support the goal and downstream outputs

If the input requirements conflict with the goal, align them to the goal. If the goal implies missing source directives, add them. If current source directives are stale, duplicative, or misaligned, rewrite them carefully and explain the change.

Do not add source categories merely because they are generally useful. Add them only when they support the goal or resolve a concrete evidence gap.
