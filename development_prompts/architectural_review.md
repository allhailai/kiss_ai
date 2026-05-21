# Architectural Review — kiss_ai

> **Purpose:** Reusable prompt for periodic architectural reviews of the `_kiss_ai` codebase. Run this prompt when the project needs a health check on boundaries, complexity, dead code, documentation drift, and design coherence.

## Instructions

You are performing an architectural review of the `_kiss_ai` project located at the project root. This is a multi-component system with a framework layer, a web application (Vite + React frontend, Node.js Express backend), and agent runtime prompts.

Read all relevant code. Do not skim. Your findings must cite specific files, line ranges, and concrete evidence. Do not report hypothetical issues — only report what you observe in the actual codebase.

## Review Scope

The review covers the entire `_kiss_ai` project:

```
_kiss_ai/
  framework/commands/    Agent prompt files (do_build.md, do_deepen.md, etc.)
  framework/templates/   Project templates
  web/
    server/              Node.js Express API server
      agentRuntimes/     Cursor SDK wrappers
      routes/            API route handlers
      services/          Business logic services
      contracts/         Server-side schemas
      adapters/          External service adapters
      utils/             Server utilities
    src/                 React frontend
      app/               App shell, workspace orchestration, hooks
      contracts/         Shared API types (api.ts)
      data/              API transport helpers
      domain/            Pure helpers (no React, no IO)
      editor/            CodeMirror wrapper and extensions
      features/          Workflow components (agents, chat, rebuild, topics, questions, etc.)
      navigation/        Route and view models
      shared/            App-neutral reusable components
      styles/            CSS per feature
    scripts/             Build and boundary check scripts
  docs/                  User-facing documentation
  scripts/               Project-level scripts
```

---

## Phase 1: Boundary Integrity

### 1.1 Import Boundary Audit

Read `web/scripts/check-boundaries.js` to understand the enforced rules, then verify they match `web/src/ARCHITECTURE.md`.

Check for violations:

- **Feature isolation:** No feature directory (`features/X/`) imports from another feature (`features/Y/`). Features should only share code through `domain/`, `shared/`, `contracts/`, or `app/`-level composition.
- **Domain purity:** `domain/` modules must not import React, app components, feature components, editor modules, transport clients (`data/`), or Node.js APIs.
- **Editor isolation:** `editor/` should not import `data/` clients or `app/` modules. App behavior arrives through callbacks.
- **Navigation purity:** `navigation/` owns route/view policy and should not import UI workflow components.
- **Shared neutrality:** `shared/` should not call APIs or import feature implementations.
- **Contracts isolation:** `contracts/` should only import other contract modules.
- **Server boundaries:** Server modules should not import frontend React components. Only approved modules should access the filesystem or Cursor SDK.
- **main.tsx thinness:** `main.tsx` should be a thin entrypoint — no business logic, no data loading.

Report each violation with file path, import statement, and recommended fix.

### 1.2 Boundary Rule Gaps

Identify edges that are currently **allowed but risky**:
- `app/` → `data/` (should be limited to workspace controllers/hooks)
- `data/` → `navigation/` (should be avoided)
- `domain/` → `navigation/` (should be avoided unless truly cross-cutting)

Are there any new uncontrolled edges that should be added to the boundary checker?

### 1.3 Server-Side Boundaries

- Services should not directly handle HTTP (that's for routes).
- Routes should be thin dispatchers to services.
- Agent runtimes should be isolated — only `agentJobs.js` and `chatAgent.js` should call them.
- Check for service functions that have grown to handle too many concerns (e.g., `agentJobs.js` is a known large file — report its line count and major concern clusters).

---

## Phase 2: Dead Code and Dead UI

### 2.1 Unreferenced Files

Identify files that are never imported by any other file:
- Check all `.ts`, `.tsx`, `.js`, `.css` files under `web/src/` and `web/server/`.
- A CSS file is dead if no component or `styles.css` imports it.
- A component is dead if no parent renders it.
- A service is dead if no route or other service calls it.
- A data transport helper is dead if no component or hook calls it.

### 2.2 Unreferenced Exports

Identify exported functions, types, or constants that are never imported anywhere. Focus on:
- `contracts/api.ts` — types that no component or service uses
- `domain/` helpers that are exported but never called
- `data/` transport functions that are never called
- Server service functions that no route dispatches to

### 2.3 Dead Feature Remnants

Check for features that were removed but left remnants:
- `features/suggestions/` — was this fully removed or do orphan files remain?
- Search for "suggestion" references in views, navigation, CSS, routes, and ARCHITECTURE.md
- Check the styles directory for CSS files with no corresponding component
- Check navigation/views.ts for view IDs that are never rendered

### 2.4 Dead CSS

For each CSS file in `styles/`:
- Verify the corresponding feature or component exists
- Sample-check 3–5 class names to confirm they appear in a `.tsx` file
- Report any CSS file that appears to have no active consumers

---

## Phase 3: Complexity and Simplification

### 3.1 Large Files

Report all files over 500 lines, sorted by size:
- `web/server/services/agentJobs.js`
- `web/server/services/chatAgent.js`
- `web/server/services/projectFiles.js`
- `web/src/app/hooks/useProjectChat.ts`
- `web/src/features/agents/RightPanelAgentChat.tsx`
- `web/src/features/rebuild/RebuildWorkspace.tsx`
- `web/src/contracts/api.ts`

For each, identify:
- How many distinct responsibilities it handles
- Whether any sub-responsibility could be extracted into a focused module
- Whether the file is in the "Deferred Architecture Review Items" list in ARCHITECTURE.md

### 3.2 God Functions

Identify functions over 100 lines. For each:
- What does it do?
- Could it be split into smaller composable functions?
- Does it mix concerns (e.g., data fetching + DOM rendering + state mutation)?

### 3.3 Duplicated Patterns

Look for duplicated logic across files:
- Similar fetch/poll/stream patterns in different features
- Similar prompt-building patterns in agentJobs.js
- Copy-pasted event handling or state management
- CSS patterns that could be shared tokens or utility classes

### 3.4 Over-Abstraction

Identify abstractions that add indirection without clear benefit:
- Wrapper functions that just forward to another function
- Generic utilities that have only one caller
- Service factories that produce a single implementation
- Type aliases that obscure rather than clarify

---

## Phase 4: Documentation Integrity

### 4.1 ARCHITECTURE.md Accuracy

Compare `web/src/ARCHITECTURE.md` against the actual codebase:

- **Module Map:** Does the directory listing match reality? Are there directories not documented?
- **Feature List:** Does the `Current features:` list match `features/*/`? Are there extra or missing entries?
- **Import Boundary Rules:** Do the stated rules match what `check-boundaries.js` actually enforces?
- **Deferred Review Items:** Are the listed files still the right ones? Have any been resolved? Should new ones be added?
- **Conceptual Diff Protocol:** Is the described lifecycle still accurate?
- **Quality Gate:** Does `npm run check` still run the stated checks?

### 4.2 Framework Command Docs

For each file in `framework/commands/`:
- Does its described schema match what the pipeline actually sends/expects?
- Are there steps that reference removed features (e.g., `AI_SUGGESTION` markers)?
- Do the phase numbers align with the pipeline in `agentJobs.js`?

### 4.3 Other Documentation

- `README.md` — still accurate?
- `docs/` — do the how-to guides reflect current UI and behavior?
- `LAB_NOTES.md` — still relevant or stale?
- `web_build_design_principle.md` — still aligned with implementation?
- `migration.md` — still needed or historical artifact?
- `feature_ideas.md` — should any completed items be removed?

---

## Phase 5: Type Safety and API Contracts

### 5.1 Contract Drift

Compare `web/src/contracts/api.ts` types against:
- What the server actually sends (check route handlers and services)
- What the frontend actually reads (check components and hooks)
- Are there fields in the type that the server never sends?
- Are there fields the server sends that aren't in the type?

### 5.2 Schema Validation

- Do server route handlers validate incoming request bodies against `requestSchemas.js`?
- Are there routes that accept arbitrary payloads without validation?
- Does `requestSchemas.js` match the TypeScript contract types?

---

## Phase 6: Test Coverage Gaps

### 6.1 Untested Services

For each service in `server/services/`:
- Does it have a corresponding `.test.js` file?
- If yes, does the test cover the primary public functions?
- Identify services with no test file at all.

### 6.2 Critical Path Coverage

The most critical paths to test are:
- Build pipeline phases (agentJobs.js)
- Question lifecycle (questionsService.js)
- Topic deepen lifecycle (topicsService.js)
- Chat/proposal lifecycle (chatAgent.js)
- Web research pipeline (webResearch.js)

Are these adequately tested or are they relying on integration-by-deployment?

---

## Output Format

Produce a structured report with these sections:

1. **Executive Summary** — 3–5 bullet health assessment
2. **Critical Issues** — Must-fix boundary violations, dead code causing confusion, or stale documentation that will mislead future agents
3. **Simplification Opportunities** — Files or patterns that can be split, deduplicated, or removed
4. **ARCHITECTURE.md Updates** — Specific text changes needed to bring the doc in line with reality
5. **Dead Code Removal List** — Files and exports safe to delete
6. **Deferred Items Update** — Updates to the deferred review items list
7. **Recommended Follow-Up Tasks** — Prioritized list of cleanup work

For each finding, include:
- **File(s):** exact path(s)
- **Evidence:** what you observed (line numbers, import statements, missing references)
- **Recommendation:** concrete action
- **Risk:** low / medium / high if left unaddressed
