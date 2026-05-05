- Double pass inputs
  - Verify each input_file is beefy
  - remove dead input files & flatten the directory structure

- Each time a user does a project "Rebuild", we need to build a summary report of what changed.
  - These reports should be written to a directory: {project}/change_logs/summaries/
  - Each build summary file should be formatted with YYYY_MM_DD_build.md

- Global Level
  - Executive summary of what has changed, terse, punchy section explaining what changed.
  - Followed by bullet points of salient conceptual and informational changes (if any)

- Inputs Level
  - Human Inputs (if any)
    - Executive summary of what has changed, terse, punchy section explaining what changed.
    - Followed by bullet points of salient conceptual and informational changes (if any) with brief explanation of changes
      - Links to files changed related to each concept
  - AI Inputs (if any)
    - Executive summary of what has changed, terse, punchy section explaining what changed.
    - Followed by bullet points of salient conceptual and informational changes (if any) with brief explanation of changes
      - Links to files changed related to each concept

- Outputs Level
    - Executive summary of what has changed, terse, punchy section explaining what changed.
    - Followed by bullet points of salient conceptual and informational changes (if any) with brief explanation of changes
      - Links to files changed related to each concept



!!!
We need to implement a default project build-log page for the kiss_ai web app.

Context:
- Repo root: /opt/all_hail_ai/kiss_ai_projects/_kiss_ai
- Web app: /opt/all_hail_ai/kiss_ai_projects/_kiss_ai/web
- Framework outputs build summaries to:
  - `change_logs/summaries/YYYY_MM_DD_build.md`
- Aggregate logs live at:
  - `change_logs/change_logs.md`
- Human-attention queue lives at:
  - `change_logs/human_attention_queue.md`
- Current web app has a dashboard and rebuild page, but the default project landing page should become a build-log oriented page.

Goal:
Build a default page that shows the build log, prominently displays the latest build summary, and lets the user view older build summaries. This should be:
1. The default page after selecting/opening a project.
2. The page the user navigates to when clicking the top-left project name.

Requirements:
1. Create or adapt a “Build Log” page.
   - Prominently show the latest build summary from `change_logs/summaries/`.
   - Show recent aggregate build log entries from `change_logs/change_logs.md`.
   - Show current rebuild status and human-attention count if available.
2. Add “View older build summaries.”
   - List older summary files from `change_logs/summaries/`.
   - For files with multiple timestamped sections in the same date file, make those sections discoverable if practical.
   - User should be able to click an older summary and view it.
3. Default routing/navigation:
   - When a project is selected, land on this Build Log page by default.
   - Clicking the top-left project name should navigate to this Build Log page.
4. Keep non-technical UX in mind:
   - Latest summary first.
   - Clear labels: “Latest Build Summary,” “Older Build Summaries,” “Attention Needed,” “Build Log.”
   - Avoid requiring users to browse files manually.
5. Backend:
   - Add API endpoints as needed to return:
     - latest build summary
     - list of build summaries
     - selected build summary content
     - aggregate change log excerpt if useful
   - Read from project files safely using existing project path helpers.
6. Frontend:
   - Update routes/views/navigation to include Build Log as the default.
   - Add a page/component, likely under `web/src/features/rebuild/` or a new `web/src/features/buildLog/`.
   - Use existing styling patterns (`content-card`, `panel-stack`, etc.).
7. Validation:
   - `npm run check` in `/opt/all_hail_ai/kiss_ai_projects/_kiss_ai/web`
   - `git diff --check -- web`
   - read lints for edited files

Files to inspect first:
- `web/src/app/routes.ts`
- `web/src/app/views.ts`
- `web/src/app/App.tsx`
- `web/src/app/useProjectWorkspace.ts`
- `web/src/features/navigation/WorkflowMenus.tsx`
- `web/src/features/projectPicker/ProjectPicker.tsx`
- `web/server/index.js`
- `web/src/api.ts`
- Existing rebuild UI in `web/src/features/rebuild/RebuildWorkspace.tsx`

Do not commit changes unless explicitly asked.

!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
We need to implement human-attention resolution prompts for kiss_ai web-triggered rebuilds.

Context:
- Repo root: /opt/all_hail_ai/kiss_ai_projects/_kiss_ai
- Framework: /opt/all_hail_ai/kiss_ai_projects/_kiss_ai/framework
- Web app: /opt/all_hail_ai/kiss_ai_projects/_kiss_ai/web
- Rebuilds are launched from the web UI via Cursor SDK.
- Rebuilds are now non-interactive and can finish as `finished_with_attention`.
- Human-attention items are stored in:
  - `.harness-state.json.extensions.human_attention.open_items`
  - `change_logs/human_attention_queue.md`
- The web API exposes:
  - `humanAttentionItems`
  - `humanAttentionCount`
- The web UI currently shows attention items, but the human user has no way to resolve them.

Goal:
Build a UX + agent workflow that lets a non-technical human resolve human-attention items from the browser.

Requirements:
1. For each human-attention item, the agent/framework should provide suggested resolution prompts.
   - Usually suggest the best 1 or 2 actions.
   - Allow more options when genuinely useful.
   - Always include a “Manual resolution prompt” option where the user can write custom instructions.
2. Suggested resolution options must persist across page refreshes.
   - Store them in rebuild state and/or harness state, not only React component state.
3. The user should be able to click a suggested option.
   - Clicking starts an agent run that attempts that resolution.
   - The prompt sent to the agent should include the selected attention item, selected resolution action, project path, and instruction to update state/logs after completion.
4. The user should be able to choose “Manual resolution prompt.”
   - Show a text box.
   - Submit starts an agent run with the custom prompt.
5. If the agent succeeds:
   - Mark that attention item resolved.
   - Update `.harness-state.json.extensions.human_attention.open_items`.
   - Update `change_logs/human_attention_queue.md`.
   - Refresh project status in the UI.
   - If all attention items are resolved, the build status should become successful/clean where appropriate.
6. If the agent fails or cannot resolve:
   - Keep the item open.
   - Add the failure details.
   - Generate updated suggested resolution options.
   - Show those options in the UI.
7. The flow should continue until the issue is resolved.
8. Avoid interactive prompts inside the agent run. Any unresolved choice must return as new resolution options.

Implementation guidance:
- Inspect current web rebuild runtime in:
  - `web/server/index.js`
  - `web/server/agentRuns.js`
  - `web/src/api.ts`
  - `web/src/features/rebuild/RebuildWorkspace.tsx`
- Add backend endpoints as needed, likely something like:
  - `POST /api/projects/:projectSlug/human-attention/:itemId/resolve`
  - or a simpler route under `/rebuild/attention/resolve`
- Add persistent fields for resolution options. Prefer a structured schema like:
  - `id`
  - `attentionItemId`
  - `label`
  - `prompt`
  - `description`
  - `riskLevel`
  - `recommended`
  - `createdAt`
- If current human-attention items do not have stable IDs, add them.
- Update framework docs/commands so future rebuilds include suggested resolution prompts in human-attention items.
- Update web UI with clickable recommended options and manual prompt entry.
- Run validation:
  - `npm run check` in `/opt/all_hail_ai/kiss_ai_projects/_kiss_ai/web`
  - JSON validation for edited framework template/schema files
  - `git diff --check -- framework web`
  - read lints for edited files

Do not commit changes unless explicitly asked.

-----------------------------------------------------
-- Small: -------------------------------------------
-----------------------------------------------------
- Revert files at a line level

-----------------------------------------------------
-- Large: -------------------------------------------
-----------------------------------------------------

- Curated Outputs
  - Webpages
  - PDFs
  - PPT

- AnnotationFlow: Gitflow
  - Requirement files & all other files are annotations only
    - annotations can be scoped by the user to specific things
    - Can queueu annotations so that teams can work together
      - Annotations are FIFO -> agent -> modify files
      - Annotations are just FIFO applied to the scope (default:all)
      - Agents can synthesize (merge them) annotation into scoped contexts

- Goals, Inputs, Outputs => JSON:Topics+Concepts
  - Allows apply all or to a specifc

----------
Fun ------
----------

- Soul file