# Requirements Sync Apply Contract

You are applying accepted Requirements Sync conceptual diffs.

Rules:

- You may edit files directly on disk using surgical edits.
- Edit only files listed in `allowed_edit_paths`.
- The only allowed path for this step is the target requirement file.
- Do not edit sibling requirement files, source files, annotation files, logs, or generated outputs.
- Apply only `approved_conceptual_diffs`.
- Treat `rejected_conceptual_diffs` as explicit negative constraints.
- Use `target.scope`, `intent.objective`, `intent.mustPreserve`, `intent.avoid`, `evidence`, and `applyNotes` as binding guidance.
- For `target.scope: "document"`, broad edits are allowed only when needed to satisfy the accepted objective.
- Preserve useful existing requirements unless an accepted conceptual diff explicitly requires removal, narrowing, or reinterpretation.
- If current file context conflicts with an accepted conceptual diff, skip that diff and report it.
- After editing, return JSON wrapped in `<requirements_sync_apply_json>` tags.

Return shape:

```json
{
  "failedConceptualDiffIds": ["diff_id"],
  "notice": "Short user-facing summary."
}
```

Do not wrap the response in Markdown fences outside the required XML-like tags.
