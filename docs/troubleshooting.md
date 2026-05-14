# Troubleshooting

Use this page when the web app, project creation, or builds do not behave as expected.

## Web App Does Not Start

Confirm:

- Node.js 20 or newer is installed.
- You ran the commands from `kiss_ai_projects/_kiss_ai/web/`.
- `npm install` completed before `npm run dev`.
- No other process is already using the configured UI port.

The normal startup commands are:

```sh
cd _kiss_ai/web
npm install
npm run dev
```

## Web App Cannot Run AI Builds

AI builds need a Cursor API key available to the web app backend.

Check one of these is set:

- macOS Keychain item `cursor_api_key`
- `_kiss_ai/web/.env` with `CURSOR_API_KEY="cursor_..."`
- process environment variable `CURSOR_API_KEY`

Do not commit `.env` files or share API keys.

## Project Was Created Inside `_kiss_ai/`

Research projects should be siblings of `_kiss_ai/`, not inside it.

Correct layout:

```text
kiss_ai_projects/
  _kiss_ai/
  your_project_name/
```

If a project was created inside `_kiss_ai/`, move or recreate it as a sibling project under `kiss_ai_projects/`.

## Web App Cannot Find A Project

Confirm the project is a sibling of `_kiss_ai/` and has the expected project files.

If you use a custom projects folder, set `KISS_AI_PROJECTS_ROOT` before starting the web app.

## Agent Runtime Cannot Find The Framework

The project root should be able to reach:

```text
../_kiss_ai/framework/commands/do_all_rebuild.md
```

Do not copy `_kiss_ai/framework/` into the project.

## Outputs Are Missing

Check that the project has:

- `human_goal_requirements.md`
- `human_input_requirements.md`
- `human_output_requirements.md`
- `human_open_questions.md`
- `human_design_identity.md`
- `inputs_human/`
- `inputs_ai/`
- `outputs_ai/`
- `change_logs/`
- sibling `_kiss_ai/framework/commands/do_all_rebuild.md`

Then run **Build the project** again in the web app.

If `inputs_human/` is empty, that is not a problem unless your input requirements say human uploads are required.

## Rebuild Finished With Attention Items

Attention items are issues the agent could not safely decide alone. Review:

- `change_logs/human_attention_queue.md`
- `human_open_questions.md`
- the latest summary under `change_logs/summaries/`

Answer the question or choose the recommended follow-up in the web app, then run another build when ready.

## Git History Looks Confusing

Each project should have its own saved history at the project root. Avoid one parent Git repo around all projects.

If the agent reports a Git snapshot problem, generated files may still exist. Review the rebuild summary before rerunning.

## Agent Wants To Create `framework/`

Do not create a project-local `framework/` folder or symlink. Use the centralized `_kiss_ai/framework/` copy instead.

## Direct Cursor Workflow Appears In Older Notes

Older internal notes may mention working directly in Cursor or pasting framework command files. That is now an advanced maintainer fallback. Normal users should create projects, define requirements, build, and review outputs in the web app.

## Private Data Warning

Your project data stays local unless you choose to upload or share it. Do not put private client, patient, employer, or personal data into public repositories.
