# Architectural Review — kiss_ai

> **Purpose:** Reusable prompt for periodic architectural reviews of the `_kiss_ai` codebase. Run this prompt when the project needs a health check on boundaries, complexity, dead code, documentation drift, and design coherence.

## Instructions

You are performing an architectural review of the `_kiss_ai` project located at the project root. This is a multi-component system with a framework layer, a web application (Vite + React frontend, Node.js Express backend), and agent runtime prompts.

Read all relevant code. Do not skim. Your findings must cite specific files, line ranges, and concrete evidence. Do not report hypothetical issues — only report what you observe in the actual codebase.

## Review Scope

The review covers the entire `_kiss_ai` project:

```
_kiss_ai/
  .cursor/rules/             Cursor agent rule files (.mdc)
  development_prompts/       Prompts for development workflows (e.g., this file)
  docs/                      User-facing documentation and guides
  examples/                  Example research projects
    clinical_patient_engagement/
    simple_research_project/
  framework/
    commands/                Agent prompt files (see §4.2 for list)
    templates/
      project_template/      Template for new research projects
  scripts/                   Project-level scripts (install-mac.sh, restart.sh)
  web/
    server/
      adapters/              External service adapters (listen.js)
      agentRuntimes/         Cursor SDK wrappers (cursorSdk.js)
      agentRuns.js           Agent run tracking and lifecycle management
      contracts/             Server-side contracts (chatLimits.js)
      index.js               Express app setup and middleware
      middleware/             Express middleware (requireAuth.js)
      routes/                API route handlers (see §1.3 for list)
      services/              Business logic services (see §3.1 for inventory)
        pipelines/           Chat agent pipeline modules (chatPipelines, chatPromptBuilder, chatPromptHelpers, chatParsers)
      utils/                 Server utilities (sse.js)
    src/                     React frontend
      app/                   App shell, workspace orchestration
        contexts/            React contexts (BuildContext, RouteContext, ToastContext)
        hooks/               App-level hooks (21 hooks — see §3.1)
      contracts/             Shared API types (barrel api.ts + domain sub-modules)
      data/                  API transport helpers (15 files)
      domain/                Pure helpers — no React, no IO (19 files)
      editor/                CodeMirror wrapper and extensions (12 files)
      features/              Workflow components (15 feature directories)
      navigation/            Route and view models (4 files)
      shared/                App-neutral reusable components
        buildLog/            Build log workspace component
        chat/                Shared chat primitives (ChatComposer, ChatMessageBubble, ChatThread, chatRendering)
        conceptualDiff/      Conceptual diff review item component
        rightPanel/          Right panel mode switch component
        CompactModelPicker.tsx
        toast.ts
      styles/                CSS per feature (26 files)
    scripts/                 Build and boundary check scripts (check-boundaries.js)
    LAB_NOTES.md             Hub runtime settings, repo boundaries, project-root assumptions
```

---

## Phase 1: Boundary Integrity

### 1.1 Import Boundary Audit

Read `web/scripts/check-boundaries.js` to understand the enforced rules, then verify they match `web/src/ARCHITECTURE.md`.

Check for violations:

- **Feature isolation:** No feature directory (`features/X/`) imports from another feature (`features/Y/`). Features should only share code through `domain/`, `shared/`, `contracts/`, or `app/`-level composition.
  Exception: features may import from `app/contexts/` to consume shared React Contexts (e.g., toast, build state, route context).
- **Domain purity:** `domain/` modules must not import React, app components, feature components, editor modules, transport clients (`data/`), or Node.js APIs. They may import API contract types from `contracts/api.ts`.
- **Editor isolation:** `editor/` should not import `data/` clients or `app/` modules. App behavior arrives through callbacks. Editor may import domain helpers and contract types.
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
- `shared/` → `contracts/` (acceptable for type-only imports, but verify no side effects)

Are there any new uncontrolled edges that should be added to the boundary checker?

### 1.3 Server-Side Boundaries

- Services should not directly handle HTTP (that's for routes).
- Routes should be thin dispatchers to services.
- Agent runtimes should be isolated — only `agentJobs.js` and `chatAgent.js` should call into `agentRuntimes/cursorSdk.js`.
- `agentRuns.js` lives at the server root level (not in `services/`). Verify this is deliberate and its responsibilities don't overlap with service modules.
- Check for service functions that have grown to handle too many concerns. Known large services (line counts as of last audit):
  - `agentJobs.js` — 2300 lines
  - `projectFiles.js` — 1326 lines
  - `artifactService.js` — 1136 lines
  - `topicsService.js` — 920 lines
  - `webResearch.js` — 823 lines
  - `promptBuilders.js` — 659 lines
  - `conversations.js` — 534 lines
  - `pipelines/chatPipelines.js` — 531 lines
  - `wikiTriage.js` — 434 lines
  - `auth.js` — 349 lines
  - `pipelines/chatPromptBuilder.js` — 287 lines
  - `chatAgent.js` — 16 lines (thin facade over `pipelines/`)

Current route files:
  - `artifactRoutes.js` (321 lines) — largest route file, check for business logic leaks
  - `projectRoutes.js` (316 lines)
  - `fileRoutes.js`, `chatRoutes.js`, `rebuildRoutes.js`, `authRoutes.js`, `apiRoutes.js`, `systemRoutes.js`, `aiRoutes.js`

---

## Phase 2: Dead Code and Dead UI

### 2.1 Unreferenced Files

Identify files that are never imported by any other file:
- Check all `.ts`, `.tsx`, `.js`, `.css` files under `web/src/` and `web/server/`.
- A CSS file is dead if no component or `styles.css` imports it.
- A component is dead if no parent renders it.
- A service is dead if no route or other service calls it.
- A data transport helper is dead if no component or hook calls it.

Pay special attention to:
- `web/src/data/outputsApi.ts` — is this still used given the `features/outputs/` addition?
- `web/server/services/cursorAgentRun.js` — small file (844 bytes), may be a dead wrapper.
- `web/server/services/httpErrors.js` — is it imported?
- `web/server/routes/aiRoutes.js` — only 18 lines, may be vestigial.

### 2.2 Unreferenced Exports

Identify exported functions, types, or constants that are never imported anywhere. Focus on:
- `contracts/api.ts` (22 lines, barrel re-export) — verify all sub-module types are consumed
- `contracts/agents.ts` — verify all exported types are consumed
- Contract sub-modules (`contracts/rebuild.ts`, `contracts/chat.ts`, `contracts/topics.ts`, etc.) — types that no component or service uses
- `domain/` helpers that are exported but never called
- `data/` transport functions that are never called
- Server service functions that no route dispatches to

### 2.3 Dead Feature Remnants

Check for features that were removed but left remnants:
- `features/suggestions/` — was fully removed. Verify the only remaining reference is the documented legacy bookmark redirect in `navigation/views.ts` (line 6–8). Search for "suggestion" references in views, navigation, CSS, routes, and ARCHITECTURE.md to confirm nothing else lingers.
- Search the `styles/` directory for CSS files with no corresponding feature or component:
  - `feature-ai-workspace.css` — does a corresponding workspace component exist?
  - `feature-build-panel.css` — does this serve the `rebuild/` feature or is it separate?
  - `feature-proposal-review.css` — which component(s) consume this?
  - `feature-review.css` — which component(s) consume this?
  - `feature-login.css` — which component(s) consume this?
  - `feature-user-admin.css` — which component(s) consume this?
- Check `navigation/views.ts` for view IDs that are never rendered.

### 2.4 Dead CSS

For each CSS file in `styles/` (24 files currently):
- Verify the corresponding feature or component exists.
- Sample-check 3–5 class names to confirm they appear in a `.tsx` file.
- Report any CSS file that appears to have no active consumers.

Current CSS files to verify:
```
00-reset.css, 01-tokens.css, 99-responsive.css,
app-shell.css, app-topbar.css,
feature-agents.css, feature-ai-workspace.css, feature-artifacts.css,
feature-build-log.css, feature-build-panel.css, feature-chat.css,
feature-dashboard.css, feature-design.css, feature-files.css,
feature-login.css, feature-navigation.css, feature-outputs.css,
feature-project-picker.css, feature-proposal-review.css, feature-questions.css,
feature-review.css, feature-right-panel.css, feature-sidebar.css,
feature-toast.css, feature-topics.css, feature-user-admin.css
```

---

## Phase 3: Complexity and Simplification

### 3.1 Large Files

Report all files over 300 lines, sorted by size. As of last audit, the largest are:

**Server services:**
| File | Lines | Notes |
|------|-------|-------|
| `agentJobs.js` | 2300 | Rebuild, deepen, artifact build pipeline orchestration |
| `projectFiles.js` | 1326 | Project file management |
| `artifactService.js` | 1136 | Artifact spec CRUD, source resolution, prompt templates, auto-generation |
| `topicsService.js` | 920 | Topic lifecycle, reconciliation, deepen queue |
| `webResearch.js` | 823 | Web research pipeline |
| `promptBuilders.js` | 659 | Prompt assembly patterns |
| `conversations.js` | 534 | Conversation persistence |
| `pipelines/chatPipelines.js` | 531 | Chat/proposal lifecycle (extracted from chatAgent.js) |
| `wikiTriage.js` | 434 | Wiki triage logic |
| `auth.js` | 349 | Authentication service (server mode) |
| `outputRename.js` | 299 | Output rename pipeline |
| `pipelines/chatPromptBuilder.js` | 287 | Chat prompt construction |
| `chatAgent.js` | 16 | Thin facade over `pipelines/` |

**Frontend components:**
| File | Lines | Notes |
|------|-------|-------|
| `features/artifacts/ArtifactsView.tsx` | 1310 | Artifact list + detail editor |
| `editor/markdownTableExtension.ts` | 924 | Table editing extension |
| `features/outputs/OutputSection.tsx` | 869 | Output section view |
| `features/agents/RightPanelAgentChat.tsx` | 685 | Agent chat panel composition |
| `features/navigation/WorkflowSectionMenu.tsx` | 615 | Workflow section menu |
| `features/navigation/FileTreeNav.tsx` | 558 | Navigation tree |
| `features/questions/QuestionsWorkspace.tsx` | 517 | Question management |
| `editor/annotationExtension.ts` | 454 | Annotation markers |
| `features/topics/TopicCard.tsx` | 429 | Topic card component |
| `editor/livePreviewExtension.ts` | 429 | Live markdown preview |
| `shared/chat/ChatMessageBubble.tsx` | 425 | Chat message rendering |
| `app/useProjectWorkspace.ts` | 396 | Workspace orchestration |
| `features/design/DesignWorkspace.tsx` | 391 | Design identity form |
| `editor/wikiLinkExtension.ts` | 387 | Wiki link extension |
| `features/rebuild/BuildProjectRightPanel.tsx` | 382 | Rebuild right panel |
| `app/hooks/useProjectChat.ts` | 375 | Chat orchestration hook |
| `features/userAdmin/UserAdminPanel.tsx` | 366 | User admin panel (server mode) |
| `app/App.tsx` | 365 | App shell composition |
| `features/topics/TopicsWorkspace.tsx` | 351 | Topic management |
| `app/ReviewWorkspace.tsx` | 343 | Review workspace |
| `features/projectPicker/ProjectPicker.tsx` | 334 | Project picker |
| `editor/mermaidExtension.ts` | 303 | Mermaid diagram extension |
| `shared/chat/ChatComposer.tsx` | 302 | Chat composer |

**Server infrastructure:**
| File | Lines | Notes |
|------|-------|-------|
| `server/index.js` | 609 | Express app setup |
| `server/agentRuns.js` | 356 | Agent run tracking |
| `routes/artifactRoutes.js` | 321 | Artifact API routes |
| `routes/projectRoutes.js` | 316 | Project API routes |
| `routes/requestSchemas.js` | 315 | Request validation schemas |

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
- Similar prompt-building patterns in `agentJobs.js` and `promptBuilders.js`
- Copy-pasted event handling or state management across hooks in `app/hooks/`
- CSS patterns that could be shared tokens or utility classes
- Overlapping conceptual diff rendering between `shared/conceptualDiff/`, `features/agents/`, and `shared/chat/`
- Overlapping artifact handling between `features/artifacts/ArtifactsView.tsx`, `features/agents/ArtifactProposalCard.tsx`, and `data/artifactsApi.ts`

### 3.4 Over-Abstraction

Identify abstractions that add indirection without clear benefit:
- Wrapper functions that just forward to another function
- Generic utilities that have only one caller
- Service factories that produce a single implementation
- Type aliases that obscure rather than clarify
- `server/adapters/listen.js` — contains a single file; is this abstraction layer justified?
- `server/contracts/chatLimits.js` — only 2 lines; should this be inlined?

---

## Phase 4: Documentation Integrity

### 4.1 ARCHITECTURE.md Accuracy

Compare `web/src/ARCHITECTURE.md` against the actual codebase:

- **Module Map:** Does the directory listing match reality? Are there directories not documented?
- **Feature List:** Does the `Current features:` list match `features/*/`? Are there extra or missing entries? Current features directories are: `agents`, `artifacts`, `chat`, `dashboard`, `design`, `files`, `navigation`, `outputs`, `projectPicker`, `questions`, `rebuild`, `search`, `toast`, `topics`, `userAdmin`.
- **Import Boundary Rules:** Do the stated rules match what `check-boundaries.js` actually enforces?
- **Deferred Review Items:** Are the listed files still the right ones? Have any been resolved? Should new ones be added? Note especially:
  - `features/outputs/OutputSection.tsx` (864 lines) — not listed but appears to be a deferred-quality candidate
  - `editor/markdownTableExtension.ts` (924 lines) — not listed
  - `server/services/artifactService.js` (853 lines) — listed, still relevant?
  - `server/services/webResearch.js` (817 lines) — not listed
  - `server/services/conversations.js` (534 lines) — not listed
- **Conceptual Diff Protocol:** Is the described lifecycle still accurate?
- **Quality Gate:** Does `npm run check` still run the stated checks? Current scripts section says: `tsc -p tsconfig.app.json --noEmit && check:server && check:boundaries && vitest --run`.
- **App Layer Documentation:** Is the description of `app/ReviewWorkspace.tsx`, right panel behavior, and `useProjectWorkspace.ts` ownership still accurate?
- **Shared Component Documentation:** Does the ARCHITECTURE.md describe the `shared/` subdirectories (`buildLog/`, `chat/`, `conceptualDiff/`, `rightPanel/`)?

### 4.2 Framework Command Docs

Current framework command files:
- `do_assist.md`
- `do_build.md`
- `do_build_artifact.md`
- `do_build_file.md`
- `do_build_research.md`
- `do_build_wiki_page.md`
- `do_deepen.md`
- `do_init_project.md`
- `do_propose_output_artifacts.md`
- `do_resolve_human_attention_item.md`

For each:
- Does its described schema match what the pipeline actually sends/expects?
- Are there steps that reference removed features (e.g., `AI_SUGGESTION` markers)?
- Do the phase numbers align with the pipeline in `agentJobs.js`?
- Are there commands referenced by `agentJobs.js` or `chatAgent.js` that don't have a corresponding command file?
- Are there command files that are never referenced by any server code?

### 4.3 Framework README

- `framework/README.md` — does it accurately describe the framework directory contents and command files?

### 4.4 Cursor Rules

Current `.cursor/rules/` files:
- `karpathy-guidelines.mdc`
- `kiss-ai-project-ownership.mdc`
- `kiss-ai-web-architecture.mdc`

- Are these still accurate and aligned with current architecture?
- Do they reference removed features or stale file paths?

### 4.5 Other Documentation

- `README.md` — still accurate?
- `START_HERE.md` — does it point to the right starting points?
- `docs/` — do the how-to guides reflect current UI and behavior?
  - `create-new-research-project.md`
  - `documentation-map.md`
  - `glossary.md`
  - `how-to-create-a-project.md`
  - `how-to-run-a-rebuild.md`
  - `setup-mac.md`, `setup-windows.md`
  - `troubleshooting.md`
- `web/LAB_NOTES.md` — still relevant or stale?
- `web_build_design_principle.md` — still aligned with implementation?
- `migration.md` — still needed or historical artifact?
- `feature_ideas.md` — should any completed items be removed?

---

## Phase 5: Type Safety and API Contracts

### 5.1 Contract Drift

Compare `web/src/contracts/api.ts` (758 lines) and `web/src/contracts/agents.ts` types against:
- What the server actually sends (check route handlers and services)
- What the frontend actually reads (check components and hooks)
- Are there fields in the type that the server never sends?
- Are there fields the server sends that aren't in the type?

### 5.2 Schema Validation

- Do server route handlers validate incoming request bodies against `requestSchemas.js` (284 lines)?
- Are there routes that accept arbitrary payloads without validation?
- Does `requestSchemas.js` match the TypeScript contract types?
- Are all route files using schema validation consistently? Check each route file:
  - `projectRoutes.js` (376 lines — largest route file, highest risk)
  - `chatRoutes.js`
  - `fileRoutes.js`
  - `artifactRoutes.js`
  - `rebuildRoutes.js`
  - `apiRoutes.js`
  - `systemRoutes.js`
  - `aiRoutes.js`

### 5.3 Server Contract Modules

- `server/contracts/chatLimits.js` — is this used? Does it match frontend expectations?
- `server/search-allowed-paths.json` — is this used and up to date?

---

## Phase 6: Test Coverage Gaps

### 6.1 Server Services

Services **with** test files (20):
`agentJobs`, `buildScope`, `chatAgent`, `chatContext`, `conceptualDiffMemory`, `conceptualDiffs`, `conversations`, `designIdentity`, `gitDiffPrompt`, `harnessState`, `kissAiUpdate`, `outputArtifacts` (shared), `outputRename`, `projectFiles`, `projects`, `questionsService`, `secretStore`, `sourceMapping`, `systemSettings`, `topicsService`, `topicReconciliation` (shared), `webResearch`

Services **without** test files (22):
`annotationScript`, `annotationService`, `artifactService`, `auth`, `buildLogs`, `contentLedger`, `cursorAgentRun`, `cursorModels`, `fetchAndDigestPhases`, `fileChanges`, `httpErrors`, `projectAgentLock`, `projectStatus`, `projectUiState`, `promptBuilders`, `questionAiAssist`, `serverValidation`, `wikiTriage`, `pipelines/chatParsers`, `pipelines/chatPipelines`, `pipelines/chatPromptBuilder`, `pipelines/chatPromptHelpers`

Also untested:
- `server/agentRuns.js` has `agentRuns.test.js` — verify coverage is meaningful.
- `server/index.js` — no tests (acceptable for app setup, but verify middleware config is covered elsewhere).

For each tested service, spot-check whether the tests cover the primary public functions or just trivial cases.

### 6.2 Frontend Tests

Current frontend test files (14):
- `app/chatFileEdits.test.ts`
- `data/chatApi.test.ts`, `data/filesApi.test.ts`, `data/rebuildApi.test.ts`, `data/request.test.ts`
- `domain/conversation.test.ts`, `domain/designIdentity.test.ts`, `domain/diffs.test.ts`, `domain/files.test.ts`, `domain/formatters.test.ts`, `domain/humanAttention.test.ts`, `domain/links.test.ts`, `domain/rebuild.test.ts`
- `navigation/routes.test.ts`

Notable untested frontend modules:
- `data/artifactsApi.ts`, `data/outputsApi.ts`, `data/projectsApi.ts`, `data/systemApi.ts`, `data/topicsApi.ts`, `data/downloadFile.ts`
- `domain/modelLabels.ts`, `domain/projectPaths.ts`, `domain/errors.ts`
- All `app/hooks/` (21 hooks, 0 tests)
- No feature component tests

### 6.3 Critical Path Coverage

The most critical paths to test are:
- Build pipeline phases (`agentJobs.js`) — has tests, verify depth
- Artifact build pipeline (`artifactService.js`) — **no tests**
- Question lifecycle (`questionsService.js`) — has tests
- Topic deepen lifecycle (`topicsService.js`) — has tests
- Chat/proposal lifecycle (`chatAgent.js`) — has tests, verify depth
- Web research pipeline (`webResearch.js`) — has tests
- Output rename pipeline (`outputRename.js`) — has tests
- Wiki triage (`wikiTriage.js`) — **no tests**
- Content ledger (`contentLedger.js`) — **no tests**
- Prompt builders (`promptBuilders.js`) — **no tests**

Are these adequately tested or are they relying on integration-by-deployment?

### 6.4 Route and Schema Tests

- `apiRoutes.test.js` (517 lines) and `requestSchemas.test.js` (191 lines) exist. Do they cover all routes and schemas?
- Are there routes added since these tests were written that lack coverage?

---

## Phase 7: New Component Audit

### 7.1 Recent Additions

The following components and services appear to be recent additions. Verify they follow established patterns:

- `features/outputs/OutputSection.tsx` (869 lines) + `OutputSectionPage.tsx` — follows feature isolation rules?
- `features/agents/ArtifactProposalCard.tsx` — follows feature isolation?
- `features/userAdmin/UserAdminPanel.tsx` — follows feature isolation?
- `features/topics/TopicCard.tsx` — follows feature isolation?
- `server/services/artifactService.js` (1136 lines) — follows service patterns?
- `server/services/annotationService.js` — follows service patterns?
- `server/services/annotationScript.js` — follows service patterns?
- `server/services/auth.js` — follows service patterns?
- `server/services/wikiTriage.js` — follows service patterns?
- `server/services/outputRename.js` — follows service patterns?
- `server/services/contentLedger.js` — follows service patterns?
- `server/services/fetchAndDigestPhases.js` — follows service patterns?
- `server/services/projectStatus.js` — follows service patterns?
- `server/services/fileChanges.js` — follows service patterns?
- `server/services/pipelines/chatPipelines.js` (531 lines) — follows service patterns?
- `server/services/pipelines/chatPromptBuilder.js` — follows service patterns?
- `server/routes/artifactRoutes.js` (321 lines) — routes through to services correctly?
- `server/routes/authRoutes.js` — routes through to services correctly?
- `data/artifactsApi.ts` — follows transport helper patterns?
- `data/outputsApi.ts` — follows transport helper patterns?
- `data/topicsApi.ts` — follows transport helper patterns?
- `data/downloadFile.ts` — follows transport helper patterns?
- `shared/buildLog/BuildLogWorkspace.tsx` — belongs in `shared/` or should it be a feature?
- `shared/chat/chatRendering.tsx` — follows shared component patterns?

### 7.2 Feature-to-Style Alignment

For each feature directory, verify there's a corresponding CSS file in `styles/`:
- `features/outputs/` → `styles/feature-outputs.css` ✓ (verify)
- `features/artifacts/` → `styles/feature-artifacts.css` ✓ (verify)

Are there CSS files that map to non-existent features, or features with no CSS?

---

## Output Format

Produce a structured report with these sections:

1. **Executive Summary** — 3–5 bullet health assessment
2. **Critical Issues** — Must-fix boundary violations, dead code causing confusion, or stale documentation that will mislead future agents
3. **Simplification Opportunities** — Files or patterns that can be split, deduplicated, or removed
4. **ARCHITECTURE.md Updates** — Specific text changes needed to bring the doc in line with reality
5. **Dead Code Removal List** — Files and exports safe to delete
6. **Deferred Items Update** — Updates to the deferred review items list
7. **Test Coverage Priorities** — Most impactful untested modules to address first
8. **Documentation Updates** — Specific docs that need refreshing
9. **Recommended Follow-Up Tasks** — Prioritized list of cleanup work

For each finding, include:
- **File(s):** exact path(s)
- **Evidence:** what you observed (line numbers, import statements, missing references)
- **Recommendation:** concrete action
- **Risk:** low / medium / high if left unaddressed
