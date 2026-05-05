# do_resolve_human_attention_item

Resolve one open human-attention item from a non-interactive web-triggered agent run.

## Preconditions

- Run from the project root.
- The canonical framework is outside the project root at sibling path `../_kiss_ai/framework/` unless the prompt provides an explicit framework root.
- The project root contains `.harness-state.json`.
- `change_logs/human_attention_queue.md` may exist; create it if needed.
- The prompt must provide:
  - `attention_item_id`
  - the serialized attention item
  - the selected resolution action or manual resolution prompt
  - the project root path

## Non-Interactive Runtime Contract

Do not ask the user questions or wait for confirmation. Attempt the selected resolution using the provided prompt and current project files. If the item still cannot be resolved safely, keep it open and replace or add `resolution_options` that let the browser show the next reasonable choices.

## Instructions

1. Read `.harness-state.json` and locate `.extensions.human_attention.open_items`.
2. Locate the target item by exact `id`. If the file contains a legacy item without an `id`, match only when the provided serialized item clearly identifies the same category, severity, and summary.
3. Read `change_logs/human_attention_queue.md` when present.
4. Execute the selected resolution action exactly as provided. Stay inside the project root.
5. If the resolution succeeds:
   - Remove the target item from `.harness-state.json.extensions.human_attention.open_items`.
   - Update `.harness-state.json.extensions.human_attention.last_updated_at` using the current local ISO timestamp. Preserve `queue_path`.
   - Update `change_logs/human_attention_queue.md` so the item is no longer listed as open. Add a brief resolved entry with timestamp, item id, action taken, and affected files.
   - If no open items remain, make the queue file clearly say there are no open human-attention items.
6. If the resolution fails or remains incomplete:
   - Keep the target item open.
   - Append a `resolution_attempts` entry (and update `last_resolution_attempt`) with `attemptedAt`, `outcome` (`failed` or `incomplete`), selected option id or manual prompt, summary, and failure details.
   - Replace stale `resolution_options` with the best next one or two actionable options when useful. Each option must include `id`, `attentionItemId`, `label`, `prompt`, `description`, `riskLevel`, `recommended`, and `createdAt`.
   - Update `change_logs/human_attention_queue.md` with the failed or incomplete attempt and the current suggested next actions.
7. If resolving the item changes generated outputs, state, or logs, update any directly affected files consistently. Do not run a full rebuild unless the selected resolution action explicitly requires it.
8. Report the final result plainly: resolved, still open with updated options, or failed due to a technical blocker.

## Output

Return:

- item id
- whether it was resolved
- files changed
- remaining open human-attention count
- any new suggested resolution options
