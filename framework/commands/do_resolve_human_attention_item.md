# do_resolve_human_attention_item

Resolve one human-attention review note for a kiss_ai project.

## Purpose

The user has selected a review note (human-attention item) and chosen either a suggested resolution option or provided a manual prompt. This command resolves that single item by taking the requested action, editing project files as needed, and updating state.

Human-attention items are review notes surfaced during a build — for example, low source confidence, coverage gaps, ambiguous requirements, or agent decisions that need human confirmation. Each item may carry pre-generated `resolution_options` with targeted prompts.

## Scope

This is a non-interactive, web-triggered resolution run. Never ask the user for confirmation or wait for input mid-run. If the selected action cannot be safely completed, keep the item open and record failure details rather than asking a question.

This agent run should complete in 1–3 minutes. It resolves exactly one item and does not modify unrelated project content.

## Inputs (provided in prompt)

The build pipeline provides these values in the prompt:

- `attention_item_id`: The ID of the item to resolve
- **Serialized attention item**: Full JSON of the item including `id`, `severity`, `category`, `summary`, `affected_files`, `default_action_taken`, `next_human_action`, and `resolution_options`
- **Selected resolution action**: Either:
  - `{ "type": "suggested_option", "id": "...", "label": "...", "prompt": "..." }` — a pre-built resolution option
  - `{ "type": "manual_prompt", "prompt": "..." }` — a user-written free-form instruction

## Instructions

### Phase 1: Read Context

1. Read `project.md` for overall project context — goals, thesis, constraints.
2. Read `.harness-state.json` to understand the current list of open items and their state.
3. Read `change_logs/human_attention_queue.md` if it exists. Understand the resolution history.
4. If the attention item has `affected_files`, read those files to understand the current state of the content the item refers to.
5. Read any wiki pages or directed outputs referenced by the item's `summary` or `next_human_action`.

### Phase 2: Execute Resolution

6. **If the selected action is a suggested option**, follow the option's `prompt` field as the primary instruction. The prompt describes a specific action the agent should take (e.g., "search for more sources on topic X", "rewrite section Y with conservative framing", "update project.md to clarify requirement Z").
7. **If the selected action is a manual prompt**, follow the user's free-form instruction. Apply it in the context of the attention item's `summary`, `category`, and `affected_files`.
8. Execute the resolution by editing project files as needed. Common resolution patterns by category:
   - **source_confidence**: Search the web for additional corroborating sources, add them to `sources/research_plan.json`, update the relevant wiki page with new citations.
   - **coverage_gap**: Research the missing area, update the relevant wiki page and any downstream directed outputs.
   - **ambiguous_requirement**: Update `project.md` or the relevant directed output with clearer framing. If the ambiguity cannot be resolved from available evidence, document the conservative default taken and why.
   - **agent_decision**: Document the rationale in the relevant output file or wiki page. If the user's resolution changes the decision, apply the change.
   - **general / other**: Follow the resolution prompt directly.
9. If the resolution requires web search, write new URLs to `sources/research_plan.json` using the standard schema. Note: the pipeline will not fetch these URLs during this run. Record them so the next full build picks them up.

### Phase 3: Update State

10. Read `.harness-state.json` again (it may have changed since Phase 1).
11. Remove the resolved item from `.harness-state.json` → `extensions.human_attention.open_items` by filtering out the item with the matching `attention_item_id`.
12. Write the updated `.harness-state.json` back to disk. Ensure the JSON is valid and parseable.
13. Append a resolution entry to `change_logs/human_attention_queue.md` with this format:

```markdown
### Resolved: <item summary> (<YYYY-MM-DD>)

- **Item ID**: <attention_item_id>
- **Category**: <category>
- **Severity**: <severity>
- **Resolution**: <"suggested_option: <label>" or "manual_prompt">
- **Action taken**: <brief description of what was changed>
- **Files modified**: <list of files edited>
```

### Phase 4: Handle Failure

14. If the resolution action cannot be safely completed (e.g., insufficient evidence, conflicting constraints, the affected file no longer exists):
    - **Do not remove the item** from `.harness-state.json`.
    - Record a `resolution_attempts` entry on the item in `.harness-state.json`:
      ```json
      {
        "attemptedAt": "<current ISO timestamp>",
        "outcome": "failed",
        "selectedResolutionOptionId": "<option id or null>",
        "manualPrompt": "<manual prompt or null>",
        "summary": "<what was attempted>",
        "failureDetails": "<why it could not be completed>"
      }
      ```
    - Generate 1–3 updated `resolution_options` on the item that reflect what was learned from the failed attempt.
    - Append a failure entry to `change_logs/human_attention_queue.md`:
      ```markdown
      ### Failed to resolve: <item summary> (<YYYY-MM-DD>)
      
      - **Item ID**: <attention_item_id>
      - **Reason**: <why resolution failed>
      - **Updated options**: <count> new resolution options generated
      ```

### Phase 5: Snapshot

15. Git snapshot:
    - `git add -A .`
    - `git commit -m "kiss_ai resolve: <item summary snippet> (<YYYY-MM-DD>)"`

## Rules

- **Resolve exactly one item.** Do not modify other open human-attention items.
- **Do not operate outside the project root.** All file paths are relative to the project directory.
- **Non-interactive.** Never ask for confirmation or wait for user input.
- **Preserve existing content.** When updating wiki pages or outputs, add or revise — do not delete well-sourced existing content unless the resolution specifically requires it.
- **Conservative defaults.** When a decision is ambiguous, choose the safer option and document why.
- **Valid JSON.** `.harness-state.json` must remain valid and parseable after every write.

## Completion Message

Report:
- Item resolved: `<summary>` (id: `<attention_item_id>`)
- Resolution type: suggested option / manual prompt
- Action taken: brief description
- Files modified: list of files touched
- Status: resolved / failed
- If failed: reason and number of updated resolution options
