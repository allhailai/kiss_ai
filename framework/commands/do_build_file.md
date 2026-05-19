# do_build_file

Build a single directed output file for a kiss_ai research project.

This command is called by the build pipeline for each directed output file. It receives a focused context containing only the sources, wiki pages, and requirements relevant to this specific output. Your job is to write ONE output file with maximum depth and specificity.

## Non-Interactive Runtime Contract

This is a web-triggered sub-phase of a larger build. Never ask for confirmation or wait for input. When a decision is needed, choose the conservative default and leave an `<!-- AI_SUGGESTION: ... -->` marker explaining what the user should review.

## Instructions

### Step 1: Read Provided Context

The build pipeline has already prepared the following context for you:

1. **Output requirements** — The relevant sections of `project.md` that describe this output type, its required structure, tone, and citation standards.
2. **Wiki pages** — The compiled wiki pages relevant to this output (already built in a prior pass). These contain synthesized regulatory analysis from the full source base.
3. **Full source files** — The complete text of source files directly relevant to this output. These contain the raw evidence: specific MCO names, H-numbers, CFR sections, contract terms, phase dates, and regulatory details.
4. **Source digests** — Compact key-claim summaries of additional federal sources.
5. **Open questions** — Relevant open questions from `questions.md`.
6. **Human inputs** — The `about_harborwellhealth.md` and any other human context files.

### Step 2: Write the Output File

Write the directed output file at the exact path specified in the prompt (e.g. `outputs_ai/strategies/OH_alignment_strategy.md` or `outputs_ai/reagent_brittleness_index_dashboard.md`). Do NOT nest it inside an additional directory — write to the exact path given. Follow the structure defined in the output requirements.

**Depth requirements — every output must include:**

- **Named entities**: MCO names, affiliated plan names, H-numbers, contract identifiers. Never use generic descriptions when specific names are available in the sources.
- **Specific dates**: Phase rollout dates, contract effective dates, waiver approval dates, enrollment periods. If the source provides a date, include it.
- **CFR citations**: Every prohibition and permission must cite the specific CFR section (e.g., 42 CFR §422.2268(b)(5), not just "federal marketing rules").
- **Consequences**: Each prohibition must state what happens if violated (CMS sanction, OIG exclusion, state licensing action, MCO contract breach, etc.).
- **Mitigations**: Each risk must include a specific mitigation strategy, not just a severity label.
- **Actionable checklists**: Pathways and prerequisite steps must be specific enough that a compliance officer can execute them without further research.

### Step 3: Citation Standards

- Cite wiki pages with relative links: `[topic-name](../wiki/topic-name.md)`
- Cite source files with relative links: `[source](../../sources/digests/source_name.md)` or `[source](../../sources/web_research/source_name.md)`
- Cite both source files and wiki articles when a conclusion depends on synthesis across multiple sources.
- If sources conflict, cite both and explain the conflict.
- If a data point cannot be confirmed from sources, label it as unverified.

### Step 4: Quality Gate

Before finishing, verify:

- [ ] Every section in the required structure has substantive content (not just a heading and a link).
- [ ] Every prohibition includes: specific rule citation, consequence, and mitigation.
- [ ] Every risk includes: likelihood assessment and specific mitigation strategy.
- [ ] Every pathway includes: permitted actions, required documentation, and prohibited actions.
- [ ] State-specific named entities (MCO names, plan names, H-numbers) are included where sources provide them.
- [ ] Open questions are listed inline with tier and blocking status, not just "see questions.md".

## What NOT to Do

- Do not write wiki pages. They are already built.
- Do not update `manifest.json`, `questions.md`, or `change_logs/`. The orchestrator handles those.
- Do not run git commands.
- Do not generate other output files.
- Do not read sources that are not provided in your context — the pipeline has already determined what is relevant.
