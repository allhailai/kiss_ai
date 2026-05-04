# Web Build Design Principle

## Contextual Persistent Navigation

The web UI should preserve a persistent left panel for orientation and affordance, but the panel should have only one navigational job at a time.

Initial state:
- The left panel shows the main workflow menu.
- Main workflow items include `Dashboard`, `Requirements`, `Inputs`, `Outputs`, `Annotations`, `Design`, and `Rebuild`.
- The design should allow more workflow items to be added over time without requiring a second permanent navigation column.

After a user selects a main workflow:
- The selected workflow becomes a dropdown control at the top of the persistent left panel.
- The dropdown lets the user switch to any other main workflow.
- The rest of the persistent left panel becomes the local navigation for the selected workflow.
- The main document or task view receives the remaining horizontal space.

Examples:
- `Requirements` shows the human-owned requirement files in the left panel.
- `Inputs` shows human input files in the left panel.
- `Outputs` shows generated output files in the left panel.
- `Annotations` shows AI-managed files that can be edited as annotations.
- `Design` shows design identity controls or files.
- `Rebuild` shows rebuild status and actions without a separate file list unless needed later.

Principles:
- Do not use a permanent main navigation column plus a permanent sub-navigation column.
- Do not make the document/editor compete with two sidebars.
- Keep the current workflow visible at the top of the left panel.
- Make switching workflows easy through the dropdown.
- Let local navigation change based on the current workflow.
- Keep long filenames contained within the panel; do not let them widen the layout.
- Wrap text content instead of cutting it off or truncating it with "...".
- Put document mode controls such as edit, preview, and split inside the main workspace, not inside the global navigation.

Summary:

The persistent left panel is a contextual navigator. It starts as the main workflow menu. Once a workflow is selected, the workflow becomes a dropdown header and the panel body becomes that workflow's local navigation.

## URL-Driven Deep Links

Every meaningful UI location should have a deep link. The URL should drive the UI, not merely reflect internal client state.

Principles:
- Refreshing the browser must preserve the current workflow and selected file.
- Browser back and forward should move through workflow and file navigation history.
- Links should be shareable within the same local project context.
- The selected main workflow should be encoded in the URL.
- The selected local file or item should be encoded in the URL when applicable.
- Invalid or stale URLs should fail gently, usually by returning to the dashboard or showing an understandable missing-file state.
- Backend API paths should remain separate from UI route paths.

For the local Vite lab, hash routes are acceptable because they preserve refresh behavior without requiring server-side route fallback. Example routes:
- `#/dashboard`
- `#/requirements/human_goal_requirements.md`
- `#/outputs/outputs_ai/macro_snapshot.md`
- `#/annotations/outputs_ai/wiki/topics/macro_current_snapshot.md`
- `#/design/human_design_identity.md`
- `#/rebuild`

## Save, Undo, and Revert Workflow

Editable Markdown editors and structured forms should share the same file workflow.

Principles:
- Treat the project file as the source of truth, even when the UI presents a structured form.
- Keep live edits in an in-memory draft until the user saves.
- `Save` writes the current draft to the editable project file and reloads the saved baseline, diff, and status.
- `Undo Changes` discards unsaved draft edits only. It restores the last loaded or saved file content and does not touch disk.
- `Revert to Committed State` restores the file from the last git commit, reloads the draft, and refreshes diff/status state.
- Show `Save` and `Undo Changes` only when the draft differs from the loaded file.
- Show `Revert to Committed State` only when the saved file has a Git diff from `HEAD`.

Summary:

Forms and Markdown editors should use the same mental model: edit a draft, save it to the file, undo unsaved draft changes, or revert saved file changes back to the last commit.
