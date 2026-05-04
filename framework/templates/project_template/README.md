# New kiss_ai Research Project

This research project was created from the `kiss_ai` project template.

## First Steps
- You can use AI to help create, edit, and revise the `human_*.md` requirement files.

1. Fill in `human_goal_requirements.md` in plain language.
2. Fill in `human_input_requirements.md` in plain language.
3. Fill in `human_output_requirements.md` in plain language.
4. Use `human_open_questions.md` to answer questions that need human review.
5. Put human-owned context, notes, files, and source lists in `inputs_human/`.
6. From this project root, ask the agent to run `../_kiss_ai/framework/commands/do_all_rebuild.md`.

## Cursor API Key For UI Rebuilds

If this project uses the optional local web UI rebuild runner, it needs a Cursor API key in the backend process environment. Support both modes:

### Safer persistent mode: macOS Keychain

Store the key once:

```bash
security add-generic-password -a "$USER" -s cursor_api_key -w "cursor_..."
```

Load it when starting the UI:

```bash
export CURSOR_API_KEY="$(security find-generic-password -a "$USER" -s cursor_api_key -w)"
npm run dev
```

### Convenient local mode: environment file

For the shared local UI, you may put the key in `_kiss_ai/web/.env` as:

```bash
CURSOR_API_KEY="cursor_..."
```

Do not commit `web/.env`. Prefer Keychain for longer-lived storage and use `.env` only for local convenience.

## Log Files

- `change_logs/change_logs.md` records requirement, source-process, wiki, and output changes.
- `change_logs/annotation_change_logs.md` records annotations extracted from AI-managed paths.

## Folder Ownership

### Human-owned (edit these for your research)

- `human_goal_requirements.md`
- `human_input_requirements.md`
- `human_output_requirements.md`
- `human_open_questions.md`
- `inputs_human/` — notes, source lists, uploads, and durable context

### AI-managed (generated or processed by the agent)

- `inputs_ai/` — working sources the agent creates or refreshes
- `outputs_ai/` — wiki and directed outputs
- `change_logs/` — run and annotation logs (prepend-only convention)
- `.harness-state.json` — harness and run status (updated by the agent during rebuilds)

### Shared framework

- The shared framework lives outside this project at `../_kiss_ai/framework/`.
- Do not create a project-local `framework/` folder. Framework changes belong in the `_kiss_ai` repo and should be committed there separately from project rebuild snapshots.
- If you intentionally change the shared framework, say so when you ask for a rebuild so the agent can run the central framework guard.

### Agent hints

- `.cursor/rules/` — optional Cursor rules copied from the template; you can ignore or adjust them.

Human edits in AI-managed folders are treated as annotations and processed during rebuild. A successful rebuild should also create a Git snapshot unless you explicitly ask the agent to defer it.
