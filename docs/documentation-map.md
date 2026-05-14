# Documentation Map

Use this page to decide which `kiss_ai` documentation to read.

## Start Here

- [`../README.md`](../README.md) — public overview and main onboarding path.
- [`../START_HERE.md`](../START_HERE.md) — short pointer to the README.

## User Guides

- [`setup-mac.md`](setup-mac.md) — first setup on macOS.
- [`setup-windows.md`](setup-windows.md) — first setup on Windows.
- [`create-new-research-project.md`](create-new-research-project.md) — create and define a project in the web app.
- [`how-to-run-a-rebuild.md`](how-to-run-a-rebuild.md) — build or refresh a project from the web app.
- [`troubleshooting.md`](troubleshooting.md) — common setup and rebuild problems.
- [`glossary.md`](glossary.md) — plain-language terms used across the docs.

## Behind-The-Scenes Project Files

The web app stores each project as local files. New projects inherit these files from [`../framework/templates/project_template/`](../framework/templates/project_template/):

- `README.md` — first steps inside a new research project.
- `human_goal_requirements.md` — project goal, audience, scope, and decision criteria.
- `human_input_requirements.md` — source needs and input standards.
- `human_output_requirements.md` — wiki and final deliverable requirements.
- `human_open_questions.md` — human review questions.
- `human_design_identity.md` — optional visual identity settings.

## Examples

- [`../examples/simple_research_project/`](../examples/simple_research_project/) — minimal static example.
- [`../examples/clinical_patient_engagement/`](../examples/clinical_patient_engagement/) — larger static example.

The example folders are for review only. Create your own project as a sibling of `_kiss_ai/` before running rebuild commands.

Normal users work with these through the web app. Maintainers may inspect the files directly.

## Maintainer Docs

These files are for people maintaining the framework, web app, or agent runtime:

- [`../framework/README.md`](../framework/README.md)
- [`../framework/commands/`](../framework/commands/)
- [`../framework/skills/`](../framework/skills/)
- [`../web/LAB_NOTES.md`](../web/LAB_NOTES.md)
- [`../web/src/ARCHITECTURE.md`](../web/src/ARCHITECTURE.md)
- [`../feature_ideas.md`](../feature_ideas.md)

Non-technical users normally do not need these pages.

## Obsolete Redirect

- [`how-to-create-a-project.md`](how-to-create-a-project.md) is kept only as a compatibility redirect. Use [`create-new-research-project.md`](create-new-research-project.md) instead.
