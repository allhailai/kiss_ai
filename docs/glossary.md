# Glossary

This page explains common `kiss_ai` terms in plain language.

## Core Terms

**Research project**  
A local project managed through the web app. Behind the scenes, each project is stored as a folder with requirements, inputs, generated outputs, change logs, and Git history.

**`_kiss_ai/`**  
The shared folder that contains the web application, reusable framework, docs, and examples. Your research projects should be siblings of `_kiss_ai/`, not inside it.

**Web app**  
The primary way to use `kiss_ai`. It lets you create projects, define goals and outputs, run builds, review source data, inspect generated outputs, and chat with the project from a browser.

**Cursor CLI agent runtime**  
The behind-the-scenes runner used by the web app to perform AI work. Users normally trigger it through web app buttons and API routes, not by working directly in Cursor.

**Human-owned files**  
Behind-the-scenes files that store what the human wants. The web app edits these through the Define screens. They include `human_goal_requirements.md`, `human_input_requirements.md`, `human_output_requirements.md`, `human_open_questions.md`, `human_design_identity.md`, and files under `inputs_human/`.

**AI-managed files**  
Files the agent creates or refreshes. These live mainly under `inputs_ai/`, `outputs_ai/`, `change_logs/`, and `.harness-state.json`.

**Rebuild**  
The normal build/update cycle launched from the web app. The agent reads the project definition and sources, refreshes AI-managed source notes, rebuilds outputs, runs checks, writes summaries, and records a project snapshot when possible.

**Inputs**  
The information the project uses. Human-provided inputs go in `inputs_human/`; agent-created source notes go in `inputs_ai/`.

**Outputs**  
The generated research results under `outputs_ai/`, such as wiki pages, briefs, matrices, or other deliverables requested in `human_output_requirements.md`.

**Open questions**  
Items needing human judgment. The web app shows these as review questions; they are stored in `human_open_questions.md`.

**Human attention item**  
A non-blocking issue the agent could not safely decide by itself. These items appear in `change_logs/human_attention_queue.md` and are summarized after rebuilds.

**Annotation**  
A human edit made inside an AI-managed folder. During the next rebuild, the agent treats that edit as guidance and logs it instead of assuming it is permanent source-of-truth text.

**Git snapshot**  
A saved project checkpoint. The agent uses snapshots to compare changes, detect annotations, and make rebuilds easier to review. You do not need to use command-line Git for the normal workflow.

**Direct file access**  
An advanced fallback for maintainers or debugging. Normal users should work through the web app rather than editing project files directly.
