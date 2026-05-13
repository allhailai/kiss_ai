# Skill: Refresh Inputs

Maintain AI-managed source files under `inputs_ai/` according to `human_input_requirements.md`.

## First-build vs subsequent refreshes

- **First builds** default to **full acquisition** for every required source category defined in requirements: populate with source-backed content where credible sources exist, or write an explicit gap/status file where they do not. Placeholder-only coverage is **not** sufficient for required categories on first acquisition.
- **Later builds** may be **incremental** only when existing source coverage is complete enough (no required category empty without a qualifying gap file), dependency maps are sufficiently certain, and stale-source detection shows unrefreshed categories remain current and unnecessary for changed outputs.
- **When in doubt**, fetch or synthesize more source material rather than less—especially before high-impact decision outputs.

## Safety Rules

- Do not edit `inputs_human/**`.
- Treat an empty or `.gitkeep`-only `inputs_human/` directory as neutral unless `human_input_requirements.md` explicitly requires human-provided files. Humans add files there when they have files to share.
- Do not remove source files unless the requirements explicitly call for removal. If removal seems needed but is not authorized, preserve the file or mark it stale and record a human-attention item.
- Flag material changes before downstream outputs are trusted.
- Preserve source URLs, effective dates, and check dates whenever possible.

## Algorithm

1. Read `human_input_requirements.md`.
2. Extract:
   - project time basis, if any
   - required source categories
   - required file naming rules
   - source schema
   - update cadence
   - material-change criteria
3. Build an expected source inventory (paths, categories, required ledgers).
4. Compare expected inventory to `inputs_ai/**` and to **`inputs_ai/source_category_coverage.md`** when present (see `framework/commands/do_get_inputs.md`).
5. For each **missing required source** or **missing required source category**:
   - **fetch or synthesize** real content when possible (official data, primary docs, project-approved URLs), following the project schema.
   - **A placeholder alone is not sufficient** for required coverage: if you cannot fetch or synthesize, create an explicit **gap/status file** (e.g. `source_gap.md` in the category directory) that states: attempted sources (URLs/titles), why it is missing, downstream impact, and **`blocks_outputs: true|false`**.
6. For each existing source, decide whether it is due for review.
7. When reviewing a source, update:
   - `last_checked`
   - `last_updated` when content changes
   - source URLs
   - change notes
8. Add unresolved questions to `human_open_questions.md` only for required or genuinely ambiguous source/evidence needs. Do not ask for `inputs_human/**` uploads solely because none exist.
9. Update any source manifest, update runbook, or **category coverage ledger** required by the project.

## Material Change Criteria

Treat a source update as material if it changes:

- allowed or disallowed actions
- constraints or exceptions
- target population or audience
- source scope
- risk, impact, or review needs
- final output conclusions

## Output

Return:

- expected source count
- missing source count
- reviewed source count
- updated source count
- categories populated vs gapped vs blocked
- material changes
- open questions added or resolved
