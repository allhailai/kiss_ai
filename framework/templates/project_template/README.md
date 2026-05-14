# New kiss_ai Research Project

This project was created from the `kiss_ai` template.

## First Steps

Continue in the `kiss_ai` web app. The browser interface is the normal way to define, build, review, and evolve this project.

1. Open this project in the web app.
2. Use **Define the requirements** to describe the goal, sources, outputs, and open questions.
3. Use **Build the project** to launch the AI build.
4. Use **Source data view** to review source material and AI-prepared source notes.
5. Use **Outputs Built** to review generated reports, wiki pages, and other deliverables.

## Behind-The-Scenes Files

The web app stores project state in local files. You normally do not need to edit them directly.

Human-controlled project definition is stored in:

- `human_goal_requirements.md`
- `human_input_requirements.md`
- `human_output_requirements.md`
- `human_open_questions.md`
- `human_design_identity.md`
- `inputs_human/`

The agent creates or refreshes:

- `inputs_ai/`
- `outputs_ai/`
- `change_logs/`
- `.harness-state.json`

Human edits in AI-managed folders are treated as annotations during the next rebuild.

## Logs And Review

- `change_logs/change_logs.md` records project changes.
- `change_logs/annotation_change_logs.md` records annotations found in AI-managed paths.
- `change_logs/human_attention_queue.md` records decisions the agent could not safely make alone.
- `change_logs/summaries/` contains per-rebuild summaries.

## Shared Framework And Runtime

The shared framework lives outside this project at `../_kiss_ai/framework/`. The web app calls local API routes that run Cursor CLI agent work behind the scenes.

Do not create a project-local `framework/` folder.

## Advanced Direct Access

Direct Cursor or filesystem access is for maintainers, debugging, or recovery. To start the web app from this project folder:

```sh
cd ../_kiss_ai/web
npm install
npm run dev
```

AI builds launched from the web app need `CURSOR_API_KEY` in the web app environment or `_kiss_ai/web/.env`. Do not commit `.env` files or share API keys.
