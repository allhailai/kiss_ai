# Input Requirements

## Purpose

Describe what information the project needs in order to produce useful outputs.

## Source Scope

State the source scope and organization the project should focus on.

## Human Inputs

Put background notes, uploaded files, source lists, and durable human context in `inputs_human/`.

Required human context:

- Add any required files here.

Expected file types:

- List expected extensions or document types here, for example Markdown, PDF, PowerPoint, Word, spreadsheets, images, or plain text.

Inventory rule:

- Before concluding which human inputs exist, the agent must build a verified inventory of `inputs_human/` using direct filesystem enumeration from the project root.
- The inventory must include non-Markdown and binary files, hidden files, and filenames with spaces or punctuation.
- Placeholder files such as `.gitkeep` may be ignored, but every other discovered file must be read, converted, summarized, or explicitly reported as unreadable/out of scope.
- If a discovered non-placeholder file is excluded or unreadable, the agent must record the exclusion or read failure and continue only when this file explicitly permits that exclusion or deferral.

## AI-Managed Source Locations

Generated or refreshed source files belong under `inputs_ai/`.

Expected structure:

```text
inputs_ai/
```

## Scale And Refresh Strategy

The agent should run a scaling assessment during every rebuild. Users do not need to decide whether the project is large enough.

Start simple. Leave project-specific ledger details blank unless the project truly needs them; the agent still runs the baseline safeguards on every rebuild.

If the project grows, define any project-specific source inventory, dependency, coverage, or intermediate ledger files needed to keep rebuilds focused and reliable. The agent should choose whether to stay simple, persist baseline dependency tracking, or escalate to the full large-project workflow when source volume, source categories, binary inputs, stale-source risk, or dependency complexity would make one broad synthesis pass unreliable.

The user does not choose the scaling mode. The agent should continue with documented caveats for material source changes and may ask only for fatal requirement, source-exclusion, or schema decisions that make the current run impossible to execute.

## Required Source Categories

List the source categories the agent should gather, refresh, or maintain.

## Source File Standards

Describe what each source file should include, such as citation, source URL, summary, key facts, open questions, and last checked date.

## Open Questions

If the project needs a central unresolved-question tracker, use `human_open_questions.md` as auxiliary source context. Do not count it as part of the required source inventory unless this file explicitly says to.

## Acceptance Criteria

How will the user know the source set is complete enough for the first build?
