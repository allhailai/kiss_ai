# Input Requirements

## Purpose

Maintain a tiny source set for a local market scan. The source set should be small enough for a first-time user to understand.

## Source Scope

Use current source dates when available and organize sources by topic or source category.

## Human Inputs

Put background notes, uploaded files, source lists, and durable human context in `inputs_human/`.

Required human context:

- Optional notes about the user's market, location, idea, or constraints.

## AI-Managed Source Locations

Generated or refreshed source files belong under `inputs_ai/`.

Expected structure:

```text
inputs_ai/
  market_notes/
  competitors/
  open_questions/
```

## Required Source Categories

- Local market overview.
- Competitor or alternative options.
- Customer segment notes.
- Pricing or offer examples when publicly available.
- Open questions that require human judgment.

## Source File Standards

Each source file should include title, source or citation, source URL when available, last checked date, summary, key facts, limitations, and open questions.

## Open Questions

If the project needs a central unresolved-question tracker, use `human_open_questions.md` as auxiliary source context. Do not count it as part of the required source inventory unless this file explicitly says to.

## Acceptance Criteria

- At least one source file exists under `inputs_ai/market_notes/`.
- Any unsupported assumptions are listed as open questions.
- The source set is small enough to review in one sitting.
