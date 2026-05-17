# kiss_ai

## Apple / Mac Computer

Just run this:

```sh
curl -fsSL https://raw.githubusercontent.com/allhailai/kiss_ai/master/scripts/install-mac.sh | bash
```

`kiss_ai` is a local web application for creating, managing, and evolving AI-assisted research projects.

The web app is the primary interface. Behind the scenes, the app stores project files locally and uses Cursor CLI agent runs through its API layer.

The normal workflow is:

```mermaid
flowchart LR
  downloadProject["Download kiss_ai_projects"] --> runWebApp["Run the web app"]
  runWebApp --> createProject["Create a project"]
  createProject --> writeProject["Write project.md"]
  writeProject --> buildProject["Build the project"]
  buildProject --> reviewOutputs["Review outputs"]
  reviewOutputs --> annotate["Add annotations"]
  annotate --> buildProject
```

## Folder Layout

Keep `_kiss_ai/` beside your research projects:

```text
kiss_ai_projects/
  _kiss_ai/              # web app, shared framework, docs, and examples
  your_project_name/     # one research project
  another_project/       # another research project
```

Research projects should be siblings of `_kiss_ai/`, not inside it.

## Project Structure

Each project has a simple file layout:

```text
my_project/
  project.md                 # Your project brief (the one file you write)
  human_design_identity.md   # Visual identity and design preferences
  questions.md               # Open questions needing your input
  inputs_human/              # Your documents, notes, PDFs
  sources/                   # AI's evidence cache
    source_log.md            # What was gathered, freshness, gaps
    web_research/            # Downloaded web content
    extracted/               # Extracted content from your files
  outputs_ai/                # The deliverables
    wiki/                    # Research wiki
    reports/                 # Dated reports
    ...                      # Other directed outputs
  .build/                    # Build machinery
    manifest.json            # Build record
  change_logs/               # Build history
    builds.md
```

## Quick Start

1. Put the `kiss_ai_projects` folder somewhere easy to find.
2. Install Node.js 20 or newer from <https://nodejs.org/>.
3. Start the web app from `_kiss_ai/web/`:

```sh
cd _kiss_ai/web
npm install
npm run dev
```

4. Open the local web app in your browser.
5. Use the app to create or select a project.
6. Edit `project.md` to describe your goal, topics, and desired outputs.
7. Build the project and review outputs.

Read the setup guide for your computer:
   - [Mac setup](docs/setup-mac.md)
   - [Windows setup](docs/setup-windows.md)

If something goes wrong, use [Troubleshooting](docs/troubleshooting.md). For terminology, see the [Glossary](docs/glossary.md).

## How You Work

1. **Write `project.md`** — describe your goal, context, topics, and what outputs you want.
2. **Add documents** to `inputs_human/` — optional notes, PDFs, data files.
3. **Build the project** — the AI gathers sources, builds a wiki, and creates your directed outputs.
4. **Review outputs** — read the wiki and reports in the web app.
5. **Add annotations** — use the [+] button to give feedback on any AI output.
6. **Build again** — the AI applies your feedback and refreshes with latest data.

## Annotations

When reviewing AI-generated outputs, you can add feedback using the [+] annotation button:

- **Blue annotations (FEEDBACK)** — your feedback to the AI. Applied on the next build.
- **Green annotations (AI_SUGGESTION)** — AI suggestions for improvements. Accept, dismiss, or modify.

This replaces the old git-diff annotation system. Annotations are explicit, visible, and intentional.

## Framework Commands

The shared framework lives in `_kiss_ai/framework/`. Three commands:

- `do_build.md` — Build the project (the main command).
- `do_assist.md` — AI Assist for editing project.md and drafting annotations.
- `do_init_project.md` — Create a new project from template.

## Agent Runtime

The web app calls local API routes, and those routes launch Cursor CLI agent work behind the scenes. Users should normally start builds from the web app.

Runtime settings:

- `KISS_AI_PROJECTS_ROOT` overrides the projects folder.
- `CURSOR_API_KEY` enables web-app-triggered agent runs.
- `KISS_AI_UI_PORT` controls the Express API port.
- `CURSOR_MODEL` optionally controls the model selection.

## Migration

If you have projects created with the v1 architecture (three requirement files, `.harness-state.json`), see [migration.md](migration.md) for how to convert them.

## Privacy

Your project data stays local unless you choose to upload, publish, or share it. Do not put private client, patient, employer, or personal data into public repositories.

## More Documentation

Use the [Documentation map](docs/documentation-map.md) to find user guides, examples, template docs, and maintainer references.
