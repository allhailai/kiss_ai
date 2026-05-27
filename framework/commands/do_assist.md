# do_assist

Produce a proposal for an AI Assist edit to a user-owned file, or help the user draft annotations, answer questions, or understand project outputs.

## Preconditions

- Run from the project root.
- The canonical framework is outside the project root at sibling path `../_kiss_ai/framework/` unless the prompt provides an explicit framework root.
- The prompt must provide:
  - project root path
  - framework root path
  - current file path
  - current file content or bounded file context
  - user annotation, selected text, or manual assist instruction

## Proposal-Only Runtime Contract

Do not edit files directly. Do not run builds. Do not modify AI-managed content. Do not update `.build/manifest.json`.

AI Assist is an interactive drafting workflow. The browser will preview the proposal and, if the user accepts it, apply the proposed content to the editor draft. The user must explicitly save afterward.

## File Rename Constraint

**Never rename or move output files** (reports under `outputs_ai/reports/` or artifacts) using filesystem operations like `mv`. Renaming an output file requires updating references in multiple data stores (content ledger, topics, artifact specs, questions, markdown cross-links). Use the **`/api/projects/:slug/outputs/rename`** endpoint instead, which handles all reference updates deterministically.

## Scope

### User-Owned Files (Direct Edit Proposals)

AI Assist can propose edits to user-owned files:

- `project.md` — the project brief: goals, topics, context, constraints, directed outputs, output guidance
- `human_design_identity.md` — project identity and design tokens
- Files under `inputs_human/` — user-provided documents and notes

For `project.md`, AI Assist should:
- Polish and extrapolate the user's raw input into well-structured requirements
- Ensure topics, directed outputs, constraints, and output guidance are consistent
- Suggest additions the user may have overlooked based on the stated goal
- Maintain the user's voice and intent — don't over-engineer or add framework jargon

### AI-Managed Files (Annotation Drafting Only)

For AI-managed files (`sources/**`, `outputs_ai/**`, `questions.md`), AI Assist does **not** propose content edits. Instead, it helps the user draft a `<!-- FEEDBACK: ... -->` annotation:

- The user selects text or a section in an AI-managed file and asks for help
- AI Assist proposes a FEEDBACK marker with clear, actionable language
- The web UI inserts the marker at the selected location
- The next build processes the feedback

This preserves the ownership model: users guide AI-managed content through annotations, not direct edits.

## Instructions

1. Identify whether the target file is user-owned or AI-managed.
2. If **user-owned**: draft a full content proposal following the output contract below.
3. If **AI-managed**: draft a `<!-- FEEDBACK: ... -->` annotation proposal. The proposal content should be the FEEDBACK marker text only, not a replacement of the file.
4. Understand the purpose of the current file from its content, filename, headings, and project context.
5. Read `project.md` for project context when relevant.
6. Interpret the user's annotation naturally. It may be a TODO, incomplete idea, note, selected passage, or explicit instruction.
7. Reason across the whole current file, not only the annotation text.
8. For `project.md` edits: update every relevant section so the new concept is consistent throughout the file (e.g., adding a topic should be reflected in Topics, may affect Key Questions, and may need a new Directed Output).
9. Keep proposals conservative. Do not invent domain facts beyond the provided context. When details are unknown, phrase them as questions, assumptions, or placeholder text the user can refine.
10. Preserve the file's existing voice, heading structure, and level of detail.
11. Return only structured output matching the output contract.

## Output Contract

Prefer this tagged format for web-triggered AI Assist responses:

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
The full proposed Markdown content for the current file (for user-owned files)
or the FEEDBACK marker text to insert (for AI-managed files).
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
  "proposedContent": "The full proposed content or FEEDBACK marker text.",
  "targetType": "user_owned | ai_managed",
  "risks": ["Important risk, ambiguity, or overreach concern."],
  "questionsOrAssumptions": ["Assumption or question the user may want to review."]
}
```

For user-owned files, `proposedContent` must be the complete replacement content for the file. For AI-managed files, `proposedContent` must be the FEEDBACK marker text to insert at the user's selected location.
