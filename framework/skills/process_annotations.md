# Skill: Process Annotations

Convert edits in AI-managed paths into structured feedback for requirement files.

## Safety Rules

- Never discard a human edit before logging it.
- Never apply an ambiguous annotation directly to a requirement file.
- Never treat `inputs_human/**` as generated content.
- Never treat root-level `human_*.md` files as generated content.
- Restore or regenerate AI-managed files only after logging and review handling.

## Algorithm

1. Verify the project root is the Git root.
2. Collect Git changes under `inputs_ai/**` and `outputs_ai/**`, scoped to the project root.
3. Use pathspecs equivalent to `git status -- inputs_ai outputs_ai` and `git diff -- inputs_ai outputs_ai` from the project root.
4. For each change, read enough file/diff context to understand the edit.
5. Identify the likely human intent:
   - factual correction
   - source inclusion request
   - source exclusion request
   - wiki organization request
   - output format request
   - deletion/exclusion signal
   - accidental edit
   - unclear
6. Map intent to requirement files:
   - goal/scope changes -> `human_goal_requirements.md`
   - source changes -> `human_input_requirements.md`
   - wiki/output changes -> `human_output_requirements.md`
7. Decide whether approval is required.
8. Create a log entry.
9. Propose precise requirement-file patches only when confidence is high or the user approves.

## Log Entry Template

~~~markdown
## {YYYY-MM-DD HH:mm} - Annotation Candidate

**File:** `{path}`
**Change type:** added | modified | deleted | renamed
**Classification:** real_annotation | ignored_annotation_candidate | ambiguous_annotation | deletion_annotation
**Confidence:** high | medium | low

### Detected Edit
{summary}

### Inferred Intent
{intent}

### Proposed Requirement Change
{none or patch summary}

### Review Status
pending | approved | ignored | deferred | applied

### Preserved Diff
```diff
{diff}
```
~~~
