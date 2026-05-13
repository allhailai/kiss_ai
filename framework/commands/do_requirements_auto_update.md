# do_requirements_auto_update

Synchronize the three root human requirement files through a proposal-and-apply web workflow:

- `human_goal_requirements.md`
- `human_input_requirements.md`
- `human_output_requirements.md`

The reusable prompt text lives under `framework/prompts/requirements_sync/`. This command is the durable runtime contract; prompt files are implementation text that must stay aligned with this command.

## Authority Model

The requirement hierarchy is strict:

1. `human_goal_requirements.md` is the controlling project contract.
2. `human_input_requirements.md` must support the goal.
3. `human_output_requirements.md` must address the goal.

When input or output requirements conflict with the goal, assume the goal wins and propose aligning input/output requirements to it. If the goal itself is internally unclear, keep the proposal conservative and identify the ambiguity.

## Preconditions

- Run from the project root.
- The canonical framework is outside the project root at sibling path `../_kiss_ai/framework/` unless the caller provides an explicit framework root.
- The caller must provide:
  - project root path
  - framework root path
  - sync step: `goal`, `inputs`, or `outputs`
  - current content and content hashes for all three root requirement files
  - current `human_open_questions.md` content when available
  - Git edit signals for `human_*_requirements.md`
  - AI-managed annotation signals from `inputs_ai/**` and `outputs_ai/**`
  - human source signals from `inputs_human/**`
  - optional user instruction
  - accepted proposal content from earlier wizard steps when applicable

## Conceptual Diff Runtime Contract

Proposal runs are read-only. Do not edit files, write logs, update `.harness-state.json`, or run commands that modify project state.

The browser previews conceptual diffs only. Accepted conceptual diffs are applied by a second constrained agent run that may edit only the selected requirement file. Rejected conceptual diffs are negative constraints for the apply run.

Manual edits during the modal are out of scope; the UI should communicate that the sync owns the files while running.

## Source Signal Semantics

- Git diffs in `human_*_requirements.md` are recent human edit signals. They are not annotations.
- Diffs under `inputs_ai/**` and `outputs_ai/**` are AI-managed annotations that should be mapped back into durable requirement files.
- Inventory and diffs under `inputs_human/**` are human source signals. Binary files may require later extraction; do not invent unreadable file contents.
- `human_open_questions.md` remains the queue for unresolved questions. Use it as context, but do not delete skipped questions during requirements sync.

## Wizard Steps

1. **Goal:** rewrite `human_goal_requirements.md` as the best controlling project contract possible. Pull in salient goal-level directives from input and output requirements.
2. **Inputs:** rewrite `human_input_requirements.md` so source acquisition, source quality, and input organization support the accepted/current goal.
3. **Outputs:** rewrite `human_output_requirements.md` so wiki, articles, reports, and deliverables address the accepted/current goal.

Each step proposes only its target file. Later steps must use accepted content from earlier steps when the caller provides it.

## Deliberate Work Requirement

Before returning, perform these passes internally:

1. Inventory requirement files and supplied signals.
2. Review recent Git diffs and infer user intent.
3. Scan contradictions against the goal hierarchy.
4. Decide the cleanest target-file organization.
5. Produce conceptual diffs for the target file.
6. Self-review for scope creep, accidental removals, missing support, and unclear assumptions.

Return only a concise reasoning summary through the structured output. Do not expose hidden chain-of-thought.

## Output Contract

Return a single JSON object matching `framework/prompts/requirements_sync/output_contract.md`.

The object must include:

- `step`
- `targetFilePath`
- `summary`
- `conceptualDiffs`
- `sourceSignalsUsed`

Do not return full replacement Markdown content. Do not wrap JSON in Markdown fences or explanatory prose.

Apply runs receive accepted conceptual diffs, rejected conceptual diffs, allowed edit paths, current requirement file content, sibling requirement context, open questions, and signal inventory. Apply must edit only the target requirement file and return failed conceptual diff ids plus a concise notice.
