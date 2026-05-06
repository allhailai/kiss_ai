# do_requirements_auto_update

Produce a proposal for synchronizing concepts across the three root human requirement files:

- `human_goal_requirements.md`
- `human_input_requirements.md`
- `human_output_requirements.md`

## Preconditions

- Run from the project root.
- The canonical framework is outside the project root at sibling path `../_kiss_ai/framework/` unless the prompt provides an explicit framework root.
- The prompt must provide:
  - project root path
  - framework root path
  - source requirement file path
  - selected requirement file paths to update
  - current content and content hashes for all three root requirement files
  - optional user instruction

## Proposal-Only Runtime Contract

Do not edit files. Do not write logs. Do not update `.harness-state.json`. Do not run commands that modify project state.

AI Auto Update is an interactive review workflow. The browser will preview the proposal and, if the user accepts it, the server will write only the selected accepted requirement files after content-hash checks.

If a requested change cannot be proposed safely from the provided context, return a proposal with the original content unchanged for the affected file and explain the blocker in `risks` and `questionsOrAssumptions`.

## Scope

Use all three requirement files as context, but propose replacement content only for the paths listed in `selectedPaths`.

Treat `sourcePath` as the main source of recent user intent. Concepts newly emphasized there should be reflected in the selected target files when they are missing, weak, stale, or inconsistent.

Do not propose edits to unselected requirement files. You may mention unselected-file observations in rationale, risks, or assumptions.

## Instructions

1. Read the goal, input, and output requirement files as one requirements set.
2. Identify important concepts, constraints, terms, exclusions, success criteria, source expectations, and deliverable expectations that appear in one file but are not adequately represented in the others.
3. Prioritize concepts from `sourcePath` as recent user intent, while preserving older constraints that are still compatible.
4. For each selected file, update the whole document so the relevant concepts are represented naturally in that file's role:
   - Goal requirements should describe purpose, audience, outcomes, scope, and success criteria.
   - Input requirements should describe source material, evidence expectations, exclusions, organization, and quality constraints.
   - Output requirements should describe deliverables, structure, evaluation criteria, formatting, and consumption needs.
5. Preserve each file's existing voice, heading structure, Markdown conventions, and level of detail unless a small structural change is necessary for clarity.
6. Keep the proposal conservative. Do not invent domain facts beyond the provided requirement context. When details are unknown, phrase them as requirements, questions, assumptions, or review criteria.
7. Return only structured output matching the contract. Do not wrap it in Markdown fences.

## Output Contract

Prefer this tagged format for web-triggered AI Auto Update responses:

```text
<requirements_auto_update_proposal>
<fileProposal>
<filePath>human_input_requirements.md</filePath>
<summary>
Short human-readable summary of the proposed change for this file.
</summary>
<rationale>
Why this change fits this file and the cross-file requirements set.
</rationale>
<affectedSections>
- Section or heading names changed or intentionally reviewed.
</affectedSections>
<proposedContent>
The full proposed Markdown content for this file.
</proposedContent>
<risks>
- Important risk, ambiguity, or overreach concern.
</risks>
<questionsOrAssumptions>
- Assumption or question the user may want to review.
</questionsOrAssumptions>
</fileProposal>
</requirements_auto_update_proposal>
```

Return one `fileProposal` block for each selected path, and no `fileProposal` blocks for unselected paths.

When a caller explicitly requires JSON, return a single JSON object:

```json
{
  "proposals": [
    {
      "filePath": "human_input_requirements.md",
      "summary": "Short human-readable summary of the proposed change for this file.",
      "rationale": "Why this change fits this file and the cross-file requirements set.",
      "affectedSections": ["Section or heading names changed or intentionally reviewed."],
      "proposedContent": "The full proposed Markdown content for this file.",
      "risks": ["Important risk, ambiguity, or overreach concern."],
      "questionsOrAssumptions": ["Assumption or question the user may want to review."]
    }
  ]
}
```

Each `proposedContent` value must be the complete replacement content for that file. It must remain valid Markdown text and must not include explanatory wrappers outside the document content.
