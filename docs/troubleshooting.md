# Troubleshooting

## Project Was Created Inside `kiss_ai/`

Move or recreate it under `kiss_ai_projects/` as a sibling of `_kiss_ai/`. The framework folder should stay separate from user projects.

## Agent Cannot Find `framework/`

Open the `kiss_ai_projects` workspace, or use a workspace that includes `_kiss_ai/` and the managed project. Project creation and rebuilds need access to `_kiss_ai/framework/`; they should not copy it into the project.

## Outputs Are Missing

Check that the project has:

- `human_goal_requirements.md`
- `human_input_requirements.md`
- `human_output_requirements.md`
- `human_open_questions.md`
- `inputs_human/`
- `inputs_ai/`
- `outputs_ai/`
- sibling `_kiss_ai/framework/commands/do_all_rebuild.md`

Then ask the agent to run the rebuild again.

## Git History Looks Confusing

Each project should have its own `.git/` folder at the project root. Avoid one parent Git repo around all projects.

## Agent Wants To Create `framework/`

Do not create a project-local framework folder or symlink. Use the centralized `_kiss_ai/framework/` copy instead.

## Private Data Warning

> Your project data stays local unless you choose to upload or share it. Do not put private client, patient, employer, or personal data into public GitHub repositories.
