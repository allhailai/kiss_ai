# do_process_annotations

Detect human edits in AI-managed areas and convert them into logged annotations.

## AI-Managed Paths

Scan only:

- `inputs_ai/**`
- `outputs_ai/**`

Do not treat changes under `inputs_human/**` or root-level `human_*.md` files as annotations. Those files are human-owned.

## Wiki schema (`outputs_ai/wiki/schema.md` by default)

Edits to **`outputs_ai/wiki/schema.md`** or the project-configured wiki schema path are **always in-scope annotations** because the file lives under `outputs_ai/**`.

Treat them as **human taxonomy and structure guidance** for the wiki, not casual scratch edits:

1. **Classify** each diff as `real_annotation` unless it is clearly accidental noise.
2. **Log** every schema edit in `change_logs/annotation_change_logs.md` with the same fields as other annotation candidates (path **project-relative**, for example `outputs_ai/wiki/schema.md` or a project-configured segmented schema path).
3. **Infer intent**, for example: rename a topic slug, clarify a description, add or retire a concept row, update naming conventions, or add an evolution log note.
4. **Propose follow-ups** when needed:
   - If the change should become durable policy, propose updates to `human_output_requirements.md` (topic hints, concept rules, caveat or escalation rules).
   - If the change is purely organizational, the next `do_organize_data.md` / `compile_wiki.md` run should **merge** the logged human intent into the regenerated `schema.md` instead of discarding it silently (see `framework/skills/compile_wiki.md` Phase 6).

Do not skip logging schema edits just because the file looks like “configuration.” It is generated output that humans may intentionally curate between compiles.

## Instructions

1. Read `human_goal_requirements.md`, `human_input_requirements.md`, `human_output_requirements.md`, and `human_open_questions.md` to understand the current source of truth and review queue.
2. Verify the project root is the Git root. If Git is missing or only a parent folder is a Git repo, stop and ask whether to initialize Git in the project root before continuing.
3. Use Git status and Git diff to find added, modified, renamed, and deleted files under only those AI-managed pathspecs. For example, from the project root use:
   - `git status -- inputs_ai outputs_ai`
   - `git diff -- inputs_ai outputs_ai`
   - `git diff --cached -- inputs_ai outputs_ai` when staged changes exist
4. For each changed file, classify the edit as one of:
   - `real_annotation`
   - `ignored_annotation_candidate`
   - `ambiguous_annotation`
   - `deletion_annotation`
5. For each annotation candidate, record:
   - timestamp
   - file path (always write this **relative to the project root**, for example `inputs_ai/README.md`)
   - change type
   - concise diff summary
   - full diff or enough context to preserve the original annotation
   - inferred intent
   - confidence
   - proposed requirement-file change, if any
   - review requirement
   - recommended action
6. Prepend entries to `change_logs/annotation_change_logs.md`.
7. If the annotation is low-risk and unambiguous, propose a small requirement-file change.
8. If the annotation is material, ambiguous, or a deletion, ask for review before changing requirements.
9. Do not restore or overwrite the edited AI-managed file until the annotation has been logged and review handling is complete.
10. Update `.harness-state.json.last_annotation_scan` with scan status, scanned paths, number logged, and unresolved review items.

## Deletion Handling

For deleted generated content, ask explicitly:

```markdown
Annotation Review Needed

I noticed generated content was deleted from `{path}`.

Possible interpretation:
You may be saying this content is wrong, irrelevant, duplicated, too detailed, or should be deprioritized.

Recommended action:
Do not change requirements until you confirm the intent.

Choose one:
1. Exclude or deprioritize this content in the requirements.
2. Keep this content and regenerate it.
3. The deletion was accidental.
4. I am not sure; ask again later.
```

## Output

Return:

- number of AI-managed files scanned
- number of annotation candidates found
- number logged
- proposed requirement changes
- unresolved review items
- unresolved items or caveats the rebuild should carry forward
