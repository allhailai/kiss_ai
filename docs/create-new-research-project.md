# Create a New Research Project

Use this guide when you want to create a new project in the `kiss_ai` web app.

Start with [`../README.md`](../README.md) if the app is not running yet.

## Before You Start

Open the local `kiss_ai` web app in your browser.

Have three things ready:

- **Project folder name:** a short `snake_case` name, such as `competitor_scan_q2`.
- **Display name:** a readable name, such as `Competitor Scan Q2`.
- **Goal:** one sentence describing what the project should help you decide, understand, or produce.

## Create The Project In The Web App

Use the project picker or new-project flow in the web app. The app should create the project as a sibling of `_kiss_ai/`, copy the standard template, initialize project history, and prepare it for the guided workflow.

The project should appear in the browser after creation. Select it to start defining the project.

## Define The Project

Use the left-side workflow in the web app:

- **Define the requirements:** describe the goal, source needs, expected outputs, and open questions.
- **Build the project:** launch the AI build when the requirements are ready.
- **Source data view:** review sources and AI-prepared source notes.
- **Outputs Built:** review generated reports, wiki pages, and other deliverables.

## What The App Creates Behind The Scenes

The app stores the project as local files:

```text
kiss_ai_projects/
  _kiss_ai/
  your_project_name/
    README.md
    human_goal_requirements.md
    human_input_requirements.md
    human_output_requirements.md
    human_open_questions.md
    human_design_identity.md
    .harness-state.json
    change_logs/
      change_logs.md
      annotation_change_logs.md
      human_attention_queue.md
      summaries/
    inputs_human/
    inputs_ai/
    outputs_ai/
    .cursor/rules/
```

Do not create projects inside `_kiss_ai/`.

## Advanced Direct Creation

The normal path is to create projects in the web app. Maintainers or recovery workflows may create a project by asking an agent to follow `_kiss_ai/framework/commands/do_init_project.md`, but that is not the primary user experience.

## Next Step

When the project definition is ready, build it from the web app. See [`how-to-run-a-rebuild.md`](how-to-run-a-rebuild.md).

## Common Mistakes

- Creating the project inside `_kiss_ai/` instead of beside it.
- Renaming `_kiss_ai/`; the web app and framework expect that folder name.
- Copying `_kiss_ai/framework/` into the project. Use the shared framework in place.
- Editing implementation files directly when the web app already has a screen for that work.

## Privacy

Your project data stays local unless you upload or share it. Do not put private client, patient, employer, or personal data into public repositories.
