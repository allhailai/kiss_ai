# do_ai_assist

Produce a proposal for an AI Assist edit to one human-facing Markdown file.

## Preconditions

- Run from the project root.
- The canonical framework is outside the project root at sibling path `../_kiss_ai/framework/` unless the prompt provides an explicit framework root.
- The prompt must provide:
  - project root path
  - framework root path
  - current file path
  - current file content or bounded file context
  - user annotation, selected text, or manual assist instruction
  - relevant requirement-file context
  - previous proposal and ephemeral feedback when refining

## Proposal-Only Runtime Contract

Do not edit files. Do not write logs. Do not update `.harness-state.json`. Do not run commands that modify project state.

AI Assist is an interactive drafting workflow. The browser will preview the proposal and, if the user accepts it, apply the proposed content to the editor draft only. The user must explicitly save afterward.

If a requested change cannot be proposed safely from the provided context, return a proposal with the original content unchanged and explain the blocker in `risks` and `questionsOrAssumptions`.

## Scope

Start with editable human-owned Markdown files, especially:

- `human_goal_requirements.md`
- `human_input_requirements.md`
- `human_output_requirements.md`
- `human_open_questions.md`
- other root-level `human_*.md` files

For AI-managed paths such as `inputs_ai/**` and `outputs_ai/**`, do not treat AI Assist as permission to rewrite generated source-of-truth behavior unless the prompt explicitly says the file is editable. When in doubt, propose how the human-owned requirements should change instead.

## Instructions

1. Understand the purpose of the current file from its content, filename, nearby headings, and provided project context.
2. Understand the `_kiss_ai` framework invariants:
   - requirement files are the source of truth
   - `inputs_human/` is human-owned
   - `inputs_ai/` and `outputs_ai/` are AI-managed
   - generated outputs must remain reproducible from requirements and inputs
3. Interpret the user annotation naturally. It may be a TODO, incomplete idea, note, selected passage, or explicit instruction.
4. Reason across the whole current file, not only the annotation text.
5. Update every relevant section in the proposed content so the new concept is consistent throughout the file.
6. Edit the annotation into natural document prose. Do not leave disconnected notes unless a note/TODO is the correct final form.
7. Preserve the file's existing voice, heading structure, Markdown conventions, and level of detail.
8. Keep the proposal conservative. Do not invent domain facts beyond the provided context. When details are unknown, phrase them as requirements, questions, assumptions, or review criteria.
9. Return only structured JSON matching the output contract. Do not wrap it in Markdown fences.

## Output Contract

Prefer this tagged format for web-triggered AI Assist responses because it avoids fragile JSON escaping around long Markdown content:

```text
<ai_assist_proposal>
<summary>
Short human-readable summary of the proposed change.
</summary>
<rationale>
Why this change fits the file and project.
</rationale>
<affectedSections>
- Section or heading names changed or intentionally reviewed.
</affectedSections>
<proposedContent>
The full proposed Markdown content for the current file.
</proposedContent>
<risks>
- Important risk, ambiguity, or overreach concern.
</risks>
<questionsOrAssumptions>
- Assumption or question the user may want to review.
</questionsOrAssumptions>
</ai_assist_proposal>
```

When a caller explicitly requires JSON, return a single JSON object:

```json
{
  "summary": "Short human-readable summary of the proposed change.",
  "rationale": "Why this change fits the file and project.",
  "affectedSections": ["Section or heading names changed or intentionally reviewed."],
  "proposedContent": "The full proposed Markdown content for the current file.",
  "risks": ["Important risk, ambiguity, or overreach concern."],
  "questionsOrAssumptions": ["Assumption or question the user may want to review."]
}
```

`proposedContent` must be the complete replacement content for the current file. It must remain valid Markdown text and must not include explanatory wrappers outside the document content.
