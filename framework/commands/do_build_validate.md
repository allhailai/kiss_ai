# do_build_validate

Run evidence validation for a kiss_ai research project.

File existence checks, manifest updates, build log entries, and git snapshots are handled by the server. Your job is evidence analysis only.

## Non-Interactive Runtime Contract

This is a web-triggered sub-phase of a larger build. Never ask for confirmation or wait for input. When a decision is needed, choose the conservative default.

## Scope

This agent run should complete in 1–3 minutes. You are NOT responsible for the full build — only evidence validation and gap analysis.

## Instructions

### Step 1: Evidence Coverage Check

For each directed output and wiki page:
- Verify that key claims cite gathered sources
- Check that BLUF statements are supported by evidence in the body
- For unsourced claims, add `coverage_gap` entries to the relevant topic in `.build/topics.json`

### Step 2: Contradiction Detection

Scan wiki pages and directed outputs for claims where sources disagree:
- Note both claims and their source citations
- Indicate which source has higher confidence (primary > secondary > news)
- If the contradiction is material (changes a recommendation or conclusion), create a question in `.build/questions.json`

### Step 3: Act on Gaps

- Missing wiki page for an evidenced topic → note in `coverage_gaps` for that topic
- Thin source coverage (topic has fewer than 2 sources) → add `coverage_gap` with description
- Source contradiction that is material → create a blocking question

### Step 4: Update Working Memory

Write `.build/scratchpad.md` with:
- Key data points discovered during validation
- Cross-references between topics
- Contradictions found and their resolution status
- Open threads for the next build
- Keep it concise (~500 words max)

### Step 5: Update Topic State

Update `.build/topics.json`:
- Set topic metrics (source_count, cross_references, word_count, last_updated)
- Update topic state (shallow → deep if evidence is sufficient)
- Add or update `coverage_gaps` arrays

### Step 6: Question Consolidation

If raw BUILD_QUESTION markers are provided in the prompt:
- Merge duplicates and near-duplicates into single questions
- When merging, combine all `relatedFiles` from merged questions
- Preserve the highest priority level when merging (`blocking` > `important` > `informational`)
- Do not add questions that are already answered in existing `.build/questions.json`
- Write the final consolidated list to `.build/questions.json`

Write `.build/questions.json` with this schema:
```json
{
  "questions": [{
    "id": "q-...",
    "text": "...",
    "context": "...",
    "priority": "blocking|important|informational",
    "status": "open|answered|applied",
    "askedAt": "...",
    "askedDuring": { "phase": "3b", "buildId": "...", "modelId": "..." },
    "relatedFiles": [...],
    "relatedTopics": [...],
    "answer": null,
    "answeredAt": null,
    "answeredBy": null
  }]
}
```

Preserve any existing answered questions from the current `.build/questions.json`.

### Step 7: Auto-Answer Open Questions

For each question with `status: "open"` in `.build/questions.json`:
- Check whether gathered sources (`sources/web_research/`, `sources/digests/`) or wiki pages already contain the answer
- If the answer is clearly supported by evidence, auto-answer it:
  - Set `status: "answered"`
  - Set `answer` to a concise answer citing the source file(s)
  - Set `answeredBy: "ai_auto"` and `answeredAt` to the current ISO timestamp
- If the answer is only partially available or inconclusive, leave the question open — do not guess

## What NOT to Do

- Do not check file existence — the server already validated that
- Do not update `manifest.json` — the server handles this
- Do not write to `change_logs/builds.md` — the server handles this
- Do not run git commands — the server handles this
- Do not write wiki pages or directed outputs — they are already built
- Do not search the web
