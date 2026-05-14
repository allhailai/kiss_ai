# Simple Research Project

This is a tiny `kiss_ai` example showing the basic project shape before a rebuild has generated AI-managed outputs.

This folder is a static example only. It is not intended to run builds directly.

## How To Use This Example

Open or recreate a real project in the `kiss_ai` web app, then use the browser workflow:

1. **Define the requirements** in the web app.
2. **Build the project** when the definition is ready.
3. **Source data view** shows source material and AI-prepared source notes.
4. **Outputs Built** shows generated outputs after a build.

## Behind-The-Scenes Files

These files show how the web app stores a simple project:

- `human_*.md` files store the project definition.
- `inputs_human/` stores optional human-provided context.
- `inputs_ai/` and `outputs_ai/` are AI-managed.
- `change_logs/` records build and annotation history.
