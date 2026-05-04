The kiss_ai project has a few concepts built into it:
- Human outlines & provides:
  - the goal to achieve (`human_goal_requirements`)
  - other input information assets such as files of various sorts (placed in `human_inputs/`)
  - input information to acquire from the public internet (`human_input_requirements`)
  - outputs to produce (`output_requirements`)
    - structured wiki (based on Karpathy LLM Wiki notion)
    - other output artifacts that link back to source human & ai inputs, public internet sources, kiss_ai curated wiki etc
- kiss_ai acquires inputs (information) and curates into the required outputs

The kiss_ai project attempts to provide non-technical users with AI augmented research and strategy building capabilities.
- This requires hiding all of the underlying complexities of the technologies uses.
- Currently kiss_ai exposes users to too much technical complexity
  - editing markdown files in Obsidian or Cursor (or like IDE)
  - viewing markdown files in Obsidian
  - interacting with AI agents in Cursor (or like) to build human inputs and build the project
  - potential exposure to git

The project needs to reduce exposure to these technologies as much as possible.
Here are some ideas:
- A web based interface that can:
  - Edit & view markdown files
  - Build the project

## Build Plan

Build a project-local web experience for a newly initialized or existing `kiss_ai` project. The first exercise should use `kiss_ai_projects/economics_and_equity_markets/` as a realistic reference project and regression fixture, then port the reusable workflow back into `kiss_ai` so future projects inherit the same non-technical experience.

The goal is not to build the UI for creating a new project. The goal is to let a user work inside a project after it exists: review requirements, add human inputs, run or review rebuilds, inspect caveats and unresolved decisions, and browse outputs without directly using Cursor, Obsidian, Git, or raw folders.

Key points:
- Use `economics_and_equity_markets` to prove the UI can handle real project complexity.
- Do not treat that project as the universal template for all projects.
- Design around three project states: fresh initialized, active or in-progress, and mature with stale or blocked outputs.
- Give each project a customizable design identity using a human-owned `human_design_identity.md` file.
- Preserve the ownership boundary between human-authored files and AI-managed files while still allowing humans to annotate AI-managed content.
- Make annotation edits visually distinct from direct edits to human-owned files.
- Hide technical machinery, but still surface blocked rebuilds, caveats, stale outputs, and source gaps clearly.
- Port reusable UI and workflow primitives back into `kiss_ai`, not economics-specific assumptions.

More detailed execution plan:

1. Inspect the mature economics project.
   - Identify what a non-technical user would actually need to see and do.
   - Separate reusable workflow concepts from economics-specific domain content.
   - Treat the project as a test fixture for complexity, not as the default product shape.

2. Define the project status model.
   - Read status from `.harness-state.json`, `human_*_requirements.md`, `human_open_questions.md`, `inputs_human/`, `inputs_ai/`, and `outputs_ai/`.
   - Show whether the project is fresh, ready to build, rebuilding, blocked, stale, or successfully rebuilt.
   - Make rebuild caveats and unresolved decisions first-class UI events rather than hidden agent notes.

3. Add project design identity.
   - Create a human-owned `human_design_identity.md` file using the DESIGN.md format from `google-labs-code/design.md`.
   - Use YAML front matter for exact design tokens such as colors, typography, spacing, rounded corners, and component tokens.
   - Use the Markdown body for human-readable style rationale, including overview, colors, typography, layout, components, and do's and don'ts.
   - Provide a sensible default identity in the project template, then let each project customize it without touching framework code.
   - Validate the file with the `@google/design.md` CLI when available, and use its exported tokens to theme the project UI.

4. Build the core project views.
   - Requirements editor for human-owned goal, input, output, and open-question files.
   - Design identity editor for `human_design_identity.md`, with guided fields for common tokens and a raw Markdown escape hatch.
   - Human input inventory for uploaded notes, PDFs, spreadsheets, screenshots, and other source files.
   - Annotation editor for AI-managed files under `inputs_ai/` and `outputs_ai/`, where human edits are captured as guidance for the next rebuild.
   - Visual annotation treatment so users can tell when they are editing source-of-truth requirements versus marking up AI-generated content.
   - Rebuild panel that starts the project build and reports progress in plain language.
   - Caveat and blocker panel for approvals, blocked source categories, unreadable files, and scope changes.
   - Output browser for wiki pages, directed outputs, dated reports, dependency maps, and stale-output notes.

5. Exercise the UI against `economics_and_equity_markets`.
   - Confirm the UI can explain a large project without exposing the user to repository mechanics.
   - Confirm the default design identity can be customized for this project without changing shared framework behavior.
   - Confirm stale outputs, source inventories, dependency maps, and dated reports are understandable.
   - Confirm AI-managed file edits are clearly shown as annotations and can be processed through the existing Git-diff annotation workflow.

6. Generalize back into `kiss_ai`.
   - Move reusable status, build, review-gate, input-inventory, design-identity, and output-browsing primitives into the framework.
   - Keep project-specific requirements and domain assumptions inside each project.
   - Ensure newly initialized projects get the same UI experience once created.
   - Preserve local-first behavior and avoid requiring users to understand Git unless recovery or history review is needed.

Guardrails:
- Do not include new-project creation UI in this exercise.
- Do not overfit the interface to economics, equity markets, or capital-preservation outputs.
- Do not hard-code one visual brand into the framework; use `human_design_identity.md` plus sensible defaults.
- Do not make AI-managed annotation edits look the same as direct human-owned requirement edits.
- Do not hide caveats or blockers so much that uncertain, blocked, or stale outputs appear clean.
- Do not copy project-specific framework drift back into `kiss_ai` without separating reusable behavior from local customization.
- Keep the first implementation small enough to validate the workflow before broadening the interface.

-------------------------------------------------------------------------------------------------------------------------------
BUILD PLAN BELOW
-------------------------------------------------------------------------------------------------------------------------------

## Build And Evolution Plan Before Backporting

Treat `kiss_ai_projects/economics_and_equity_markets/` as a product lab, not as the framework. Build and evolve the UI there first, using real project complexity to discover the right user experience, then backport only stable, reusable primitives into `kiss_ai`.

High-level approach:
- Prototype inside one real project before changing the shared framework.
- Keep the first UI project-local so it can read and write the actual project files.
- Design around user workflows rather than exposing a file browser.
- Make AI-owned file annotations a first-class user experience.
- Add `human_design_identity.md` early so each project can customize its look without changing framework code.
- Backport reusable capabilities only after repeated rebuild cycles prove the model.

Execution plan:

1. Prototype inside the economics project.
   - Use `kiss_ai_projects/economics_and_equity_markets/` as the first working fixture.
   - Exercise the UI against real generated outputs, source inventories, stale-output tracking, dependency maps, dated reports, caveats, blockers, and AI-owned files.
   - Avoid treating economics or capital-preservation content as the default shape for every project.

2. Keep the UI project-local at first.
   - Let the UI work directly with the project files it needs: `human_goal_requirements.md`, `human_input_requirements.md`, `human_output_requirements.md`, `human_open_questions.md`, `human_design_identity.md`, `inputs_human/`, `inputs_ai/`, `outputs_ai/`, `.harness-state.json`, and `change_logs/annotation_change_logs.md`.
   - Use this local implementation to learn the right workflow model before introducing framework abstractions.
   - Keep framework edits separate from project-specific experiments.

3. Build workflow surfaces instead of a file browser.
   - "Define what I want" for human-owned requirements.
   - "Customize this project's look" for `human_design_identity.md`.
   - "Add source material" for `inputs_human/`.
   - "Review AI research" for generated `inputs_ai/` and `outputs_ai/`.
   - "Annotate generated content" for AI-owned files that should be processed through Git diff.
   - "Resolve blockers" for caveats, unreadable files, or missing sources.
   - "Run rebuild" for the project build loop.
   - "Browse final outputs" for wiki pages, directed outputs, and dated reports.

4. Make annotations first-class.
   - Allow users to edit AI-owned files under `inputs_ai/` and `outputs_ai/`.
   - Visually label those edits as annotations, not direct source-of-truth edits.
   - Explain in plain language that annotation edits are detected through Git diff and processed during the next rebuild.
   - Show pending annotations before rebuild so users understand what guidance the agent will interpret.

5. Add project design identity early.
   - Create `human_design_identity.md` as a human-owned DESIGN.md-compatible file.
   - Use YAML front matter for design tokens and Markdown prose for design rationale.
   - Start with a conservative, readable default identity.
   - Let each project customize colors, typography, spacing, component feel, and do's and don'ts without modifying shared framework code.

6. Evolve through repeated rebuild cycles.
   - Load the existing project into the UI.
   - Edit human requirements.
   - Add or revise human inputs.
   - Annotate AI outputs.
   - Run annotation processing.
   - Surface and resolve at least one caveat or blocker.
   - Rebuild and inspect fresh versus stale outputs.
   - Repeat until the user workflow feels stable and understandable.

7. Extract stable primitives.
   - Project status reader.
   - Human file editor model.
   - Design identity loader and editor model.
   - AI annotation editor model.
   - Rebuild runner and status model.
   - Caveat and blocker model.
   - Human input inventory model.
   - Output browser model.

8. Backport into `kiss_ai`.
   - Move reusable primitives, templates, and documentation into the shared framework.
   - Keep project-specific requirements, source assumptions, output schemas, and domain examples inside their projects.
   - Make newly initialized projects inherit the UI experience after creation.
   - Preserve the local-first model and keep Git mostly invisible unless history, recovery, or annotation explanation requires it.

Backport rule:
- Prove the UI in a real project, but generalize from user workflows rather than from that project's domain.