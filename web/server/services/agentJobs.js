import fs from "node:fs/promises";
import path from "node:path";
import { computeBuildScope } from "./buildScope.js";
import { buildSourceMapping, writeSourceMapping } from "./sourceMapping.js";
import { extractAllBuildQuestions, readQuestions } from "./questionsService.js";
import { createPromptBuilders } from "./promptBuilders.js";
import { readArtifactSpec, resolveArtifactSources, discoverRelevantSources, ensureArtifactDirs, listArtifactSpecs, findDirectedOutputsWithoutArtifacts, discoverSections, extractSection, replaceSection, insertSectionAfter, updateNavText, checkStyleFragmentation, createSectionBackup, updateManifestForRegeneration, stampManifestAfterBuild, readArtifactPreviewHtml, getArtifactBuildPath, createBuildSnapshot } from "./artifactService.js";
import { runFetchPhase, runDigestPhase } from "./fetchAndDigestPhases.js";
import { getDeepenQueue, clearDeepenQueue, readTopics, writeTopics, reconcileTopicSources, computeWikiMetrics, autoAdvanceTopicStates } from "./topicsService.js";
import { computeWikiTriage, updateWikiPageTracker, resetWikiPageTracker, regenerateWikiIndex } from "./wikiTriage.js";
import { getPendingAnnotations, markApplied, markFailed } from "./annotationService.js";
import { validateFileExistence, readManifest, writeManifest, prependBuildLogEntry, gitSnapshot, recordBuildFileChanges } from "./serverValidation.js";
import { readLedger, buildSnapshot, diffSnapshot, writeLedger, recordKnowledgeBuild, recordOutputBuild } from "./contentLedger.js";

export function createAgentJobService({
  FRAMEWORK_ROOT,
  activeRebuilds,
  appendAssistantDelta,
  appendRunEvent,
  finishAssistantMessage,
  getHumanAttentionItems,
  getRebuildState,
  httpError,
  listCursorModels,
  pickRebuildModelId,
  projectAgentLock,
  readProjectHarness,
  resolveCursorApiKey,
  runCursorAgent,
  setRebuildState,
}) {
  const startLocks = new Map();
  const activeAbortControllers = new Map();

  const {
    createAddSectionPrompt,
    createArtifactPrompt,
    createAutoAnswerPrompt,
    createFilePrompt,
    createProposeOutputArtifactsPrompt,
    createResearchPrompt,
    createSectionRegenerationPrompt,
    createSynthesisPrompt,
    createWikiOnlyPrompt,
    createWikiPagePrompt,
  } = createPromptBuilders(FRAMEWORK_ROOT);

  async function appendRunLog(projectSlug, message) {
    await appendRunEvent(projectSlug, {
      type: "system",
      title: message,
      text: message,
      runtime: "cursor",
    });
  }

  const MAX_FILE_CONCURRENCY = 5;
  const MAX_WIKI_CONCURRENCY = 5;

  async function runWikiPagePhase({ project, apiKey, modelId, affectedPages }) {
    const results = [];
    let completed = 0;

    for (let i = 0; i < affectedPages.length; i += MAX_WIKI_CONCURRENCY) {
      const batch = affectedPages.slice(i, i + MAX_WIKI_CONCURRENCY);

      const batchPromises = batch.map(async (pageInfo) => {
        const prompt = createWikiPagePrompt(project, pageInfo);

        await appendRunEvent(project.slug, {
          type: "system",
          title: `Phase 3a: ${pageInfo.mode === "full_rewrite" ? "Rebuilding" : "Updating"} ${pageInfo.page}`,
          text: `${pageInfo.reason}. ${pageInfo.newDigests.length} new digest(s).`,
          status: "wiki_page_synthesis",
          runtime: "cursor",
          metadata: { page: pageInfo.page, mode: pageInfo.mode, phase: "3a" },
        });

        const pageStart = Date.now();
        const result = await runSingleAgentPhase({
          project,
          apiKey,
          modelId,
          prompt,
          phaseName: `Wiki: ${pageInfo.page}`,
          signal: undefined,
        });
        const pageDurationSeconds = Math.round((Date.now() - pageStart) / 1000);

        completed++;

        await appendRunEvent(project.slug, {
          type: "system",
          title: `Phase 3a: ${pageInfo.page} complete (${completed}/${affectedPages.length}, ${pageDurationSeconds}s)`,
          text: result.status === "finished" ? `Successfully ${pageInfo.mode === "full_rewrite" ? "rebuilt" : "updated"} ${pageInfo.page}` : `${pageInfo.page} ended with status: ${result.status}`,
          status: result.status === "finished" ? "wiki_page_complete" : "wiki_page_error",
          runtime: "cursor",
          metadata: { page: pageInfo.page, completed, total: affectedPages.length, phase: "3a", durationSeconds: pageDurationSeconds },
        });

        return { page: pageInfo.page, mode: pageInfo.mode, result, durationSeconds: pageDurationSeconds };
      });

      results.push(...(await Promise.all(batchPromises)));
    }

    return results;
  }

  async function runFileSynthesisPhase({ project, apiKey, modelId, sourceMap }) {
    const outputFiles = Object.keys(sourceMap);
    if (outputFiles.length === 0) return [];

    const results = [];
    let completed = 0;

    // Process in batches of MAX_FILE_CONCURRENCY
    for (let i = 0; i < outputFiles.length; i += MAX_FILE_CONCURRENCY) {
      const batch = outputFiles.slice(i, i + MAX_FILE_CONCURRENCY);

      const batchPromises = batch.map(async (outputFile) => {
        const filePrompt = await createFilePrompt(project, outputFile, sourceMap);
        const fileMapping = sourceMap[outputFile] || {};
        const topicInfo = fileMapping.topicCount ? ` (${fileMapping.topicCount} topic${fileMapping.topicCount === 1 ? "" : "s"})` : "";

        await appendRunEvent(project.slug, {
          type: "system",
          title: `Phase 3b: Building ${outputFile}`,
          text: `Synthesizing directed output with ${fileMapping.wikiPages?.length || 0} wiki pages, ${fileMapping.digestFiles?.length || 0} digests${topicInfo}.`,
          status: "file_synthesis",
          runtime: "cursor",
          metadata: { outputFile, phase: "3b", topicCount: fileMapping.topicCount || null, topicIds: fileMapping.topicIds || null },
        });

        const fileStart = Date.now();
        const result = await runSingleAgentPhase({
          project,
          apiKey,
          modelId,
          prompt: filePrompt,
          phaseName: `File: ${outputFile}`,
          signal: undefined,
        });
        const fileDurationSeconds = Math.round((Date.now() - fileStart) / 1000);

        completed++;

        await appendRunEvent(project.slug, {
          type: "system",
          title: `Phase 3b: ${outputFile} complete (${completed}/${outputFiles.length}, ${fileDurationSeconds}s)`,
          text: result.status === "finished" ? `Successfully built ${outputFile}` : `${outputFile} ended with status: ${result.status}`,
          status: result.status === "finished" ? "file_complete" : "file_error",
          runtime: "cursor",
          metadata: { outputFile, completed, total: outputFiles.length, phase: "3b", durationSeconds: fileDurationSeconds },
        });

        return { file: outputFile, result, durationSeconds: fileDurationSeconds };
      });

      results.push(...(await Promise.all(batchPromises)));
    }

    return results;
  }

  function getResolutionOption(item, resolutionOptionId) {
    const options = Array.isArray(item.resolution_options) ? item.resolution_options : [];
    return options.find((option) => option && typeof option === "object" && option.id === resolutionOptionId) ?? null;
  }

  function requireResolutionRequest(body) {
    const itemId = String(body?.itemId ?? "").trim();
    const resolutionOptionId = String(body?.resolutionOptionId ?? "").trim();
    const manualPrompt = String(body?.manualPrompt ?? "").trim();

    if (!itemId) throw httpError("A review note id is required.");
    if (resolutionOptionId && manualPrompt) throw httpError("Choose either a suggested option or a manual prompt, not both.");
    if (!resolutionOptionId && !manualPrompt) throw httpError("Choose a suggested option or provide a manual prompt.");

    return { itemId, resolutionOptionId: resolutionOptionId || null, manualPrompt: manualPrompt || null };
  }

  async function createHumanAttentionResolutionPrompt(project, requestBody) {
    const { itemId, resolutionOptionId, manualPrompt } = requireResolutionRequest(requestBody);
    const harness = await readProjectHarness(project.path);
    const item = getHumanAttentionItems(harness).find((candidate) => candidate.id === itemId);

    if (!item) {
      throw httpError("Human-attention item was not found or is no longer open.", 404, "human_attention_item_not_found");
    }

    const selectedOption = resolutionOptionId ? getResolutionOption(item, resolutionOptionId) : null;
    if (resolutionOptionId && !selectedOption) {
      throw httpError("Selected resolution option was not found on this review note.", 404, "resolution_option_not_found");
    }

    const selectedResolution = selectedOption
      ? {
          type: "suggested_option",
          id: selectedOption.id,
          label: selectedOption.label,
          prompt: selectedOption.prompt,
        }
      : {
          type: "manual_prompt",
          prompt: manualPrompt,
        };

    return {
      item,
      selectedOption,
      prompt: [
        "Resolve one kiss_ai human-attention item for this project.",
        "",
        `Project root: ${project.path}`,
        `Framework root: ${FRAMEWORK_ROOT}`,
        `Follow ${path.join(FRAMEWORK_ROOT, "commands/do_resolve_human_attention_item.md")} exactly.`,
        "",
        "This is a non-interactive web-triggered resolution run. Never ask the user for confirmation or wait for input mid-run.",
        "If the selected action cannot safely resolve the issue, keep the item open, record failure details, and generate updated resolution_options instead of asking a question.",
        "Do not operate outside this project root.",
        "",
        `attention_item_id: ${item.id}`,
        "",
        "Serialized attention item:",
        JSON.stringify(item, null, 2),
        "",
        "Selected resolution action:",
        JSON.stringify(selectedResolution, null, 2),
        "",
        "After completion, update .harness-state.json.extensions.human_attention.open_items and change_logs/human_attention_queue.md consistently.",
        "If all human-attention items are resolved, leave the project in a clean successful state where the existing harness status permits it.",
      ].join("\n"),
      context: {
        itemId: item.id,
        resolutionOptionId: selectedOption?.id ?? null,
        manual: Boolean(manualPrompt),
      },
    };
  }

  function createAgentJobCompletionMessage(jobName) {
    return async ({ project, result }) => {
      const harness = await readProjectHarness(project.path);
      const attentionCount = getHumanAttentionItems(harness).length;
      const finishedWithAttention = result.status === "finished" && attentionCount > 0;
      const status = result.status === "finished" ? (finishedWithAttention ? "finished_with_attention" : "finished") : "error";
      const resultDetail = typeof result.result === "string" ? result.result.trim() : "";
      const message =
        result.status === "finished"
          ? finishedWithAttention
            ? `${jobName} finished. Review notes are available if you want to improve source confidence or project settings.`
            : `${jobName} finished.`
          : resultDetail || `${jobName} stopped before finishing.`;

      return { attentionCount, finishedWithAttention, message, status };
    };
  }

  async function startAgentJob({
    project,
    requestedModelId,
    runKind,
    attentionContext = null,
    startMessage,
    noApiKeyMessage,
    noModelsMessage,
    jobName,
    prompt,
    jobContext = null,
  }) {
    const existingStart = startLocks.get(project.slug);
    if (existingStart) {
      await existingStart.catch(() => undefined);
      return await getRebuildState(project.slug);
    }

    const startPromise = startAgentJobUnlocked({
      project,
      requestedModelId,
      runKind,
      attentionContext,
      startMessage,
      noApiKeyMessage,
      noModelsMessage,
      jobName,
      prompt,
      jobContext,
    });
    startLocks.set(project.slug, startPromise);

    try {
      return await startPromise;
    } finally {
      startLocks.delete(project.slug);
    }
  }

  async function startAgentJobUnlocked({
    project,
    requestedModelId,
    runKind,
    attentionContext,
    startMessage,
    noApiKeyMessage,
    noModelsMessage,
    jobName,
    prompt,
    jobContext = null,
  }) {
    const rebuildState = await getRebuildState(project.slug);

    if (rebuildState.running) {
      return rebuildState;
    }

    const releaseProjectAgent = projectAgentLock.acquire(project, runKind);

    try {
      const cursorApiKey = await resolveCursorApiKey();

      if (!cursorApiKey.available) {
        await setRebuildState(project.slug, {
          ...rebuildState,
          running: false,
          status: "blocked",
          message: noApiKeyMessage,
          finishedAt: new Date().toISOString(),
          runKind,
          attentionContext,
        });
        await appendRunEvent(project.slug, {
          type: "error",
          title: `${jobName} blocked`,
          text: (await getRebuildState(project.slug)).message,
          status: "blocked",
          runtime: "cursor",
        });
        releaseProjectAgent();
        return await getRebuildState(project.slug);
      }

      const models = await listCursorModels(cursorApiKey.apiKey);

      if (!models.length) {
        await setRebuildState(project.slug, {
          ...rebuildState,
          running: false,
          status: "blocked",
          message: noModelsMessage,
          finishedAt: new Date().toISOString(),
          runKind,
          attentionContext,
        });
        await appendRunEvent(project.slug, {
          type: "error",
          title: `${jobName} blocked`,
          text: (await getRebuildState(project.slug)).message,
          status: "blocked",
          runtime: "cursor",
        });
        releaseProjectAgent();
        return await getRebuildState(project.slug);
      }

      const modelId = pickRebuildModelId(models, requestedModelId);

      const abortController = new AbortController();
      activeAbortControllers.set(project.slug, abortController);

      await setRebuildState(project.slug, {
        running: true,
        runId: null,
        agentId: null,
        runtime: "cursor",
        status: "running",
        startedAt: new Date().toISOString(),
        finishedAt: null,
        modelId,
        message: startMessage,
        activeAssistantMessageId: null,
        events: [],
        log: [],
        runKind,
        attentionContext,
        buildPhase: null,
        buildPhaseDetail: null,
        buildQueue: jobContext?.artifactSlugs || null,
      });

      await appendRunLog(project.slug, `Using Cursor API key from ${cursorApiKey.source}.`);
      await appendRunLog(project.slug, `Using Cursor model: ${modelId}.`);

      runAgentJob({ project, apiKey: cursorApiKey.apiKey, modelId, prompt, jobName, runKind, releaseProjectAgent, signal: activeAbortControllers.get(project.slug)?.signal, jobContext }).catch(async (error) => {
        try {
          const message = error instanceof Error ? error.message : `Unknown ${jobName.toLowerCase()} error.`;
          const current = await getRebuildState(project.slug);
          await setRebuildState(project.slug, {
            ...current,
            running: false,
            status: "error",
            finishedAt: new Date().toISOString(),
            message,
          });
          await appendRunLog(project.slug, message);
        } catch (cleanupError) {
          console.error(`[kiss_ai] Failed to record ${jobName} error state:`, cleanupError);
        }
      });

      return await getRebuildState(project.slug);
    } catch (error) {
      releaseProjectAgent();
      throw error;
    }
  }

  async function startKnowledgeBuild(project, requestedModelId) {
    return await startAgentJob({
      project,
      requestedModelId,
      runKind: "rebuild",
      startMessage: "Starting knowledge build (research → fetch → digest → wiki → questions → recording).",
      noApiKeyMessage:
        "No Cursor API key found in CURSOR_API_KEY, web/.env, or OS credential store. Knowledge builds are unavailable from the UI.",
      noModelsMessage: "No Cursor models remain after excluding MAX mode models. Add a non-MAX model to your account catalog or relax filters.",
      jobName: "Knowledge build",
      prompt: createResearchPrompt(project),
    });
  }

  /** @deprecated Use startKnowledgeBuild */
  async function startRebuild(project, requestedModelId) {
    return await startKnowledgeBuild(project, requestedModelId);
  }

  async function startHumanAttentionResolution(project, requestBody) {
    const { prompt, context } = await createHumanAttentionResolutionPrompt(project, requestBody);

    return await startAgentJob({
      project,
      requestedModelId: requestBody?.modelId,
      runKind: "human_attention_resolve",
      attentionContext: context,
      startMessage: "Starting review-note resolution.",
      noApiKeyMessage:
        "No Cursor API key found in CURSOR_API_KEY, web/.env, or OS credential store. Human-attention resolution is unavailable from the UI.",
      noModelsMessage: "No Cursor models remain after excluding MAX mode models. Add a non-MAX model to your account catalog or relax filters.",
      jobName: "Human-attention resolution",
      prompt,
    });
  }

  async function startFullRebuild(project, requestedModelId) {
    return await startAgentJob({
      project,
      requestedModelId,
      runKind: "full_rebuild",
      startMessage: "Starting full knowledge rebuild (all wiki pages will be regenerated).",
      noApiKeyMessage:
        "No Cursor API key found in CURSOR_API_KEY, web/.env, or OS credential store. Rebuilds are unavailable from the UI.",
      noModelsMessage: "No Cursor models remain after excluding MAX mode models. Add a non-MAX model to your account catalog or relax filters.",
      jobName: "Full rebuild",
      prompt: createResearchPrompt(project),
    });
  }

  /**
   * Build selected output files (reports or artifacts) on demand.
   * Called from the Reports/Artifacts page when the user selects files and clicks "Build".
   */
  async function startOutputBuild(project, requestedModelId, files, outputType) {
    const typeLabel = outputType === "artifact" ? "artifact" : "report";
    const pluralLabel = files.length === 1 ? typeLabel : `${typeLabel}s`;

    // For artifacts, delegate to existing artifact build (single at a time for now)
    if (outputType === "artifact") {
      if (files.length === 1) {
        return await startArtifactBuild(project, files[0], requestedModelId);
      }
      // Batch artifact builds — queue all slugs, run sequentially inside one agent job
      return await startBatchArtifactBuild(project, files, requestedModelId);
    }

    // For reports: use a custom runKind and build the prompt inline
    return await startAgentJob({
      project,
      requestedModelId,
      runKind: "output_build",
      startMessage: `Building ${files.length} ${pluralLabel} from current wiki and sources.`,
      noApiKeyMessage:
        "No Cursor API key found. Output builds are unavailable from the UI.",
      noModelsMessage: "No Cursor models remain after excluding MAX mode models.",
      jobName: `Build ${files.length} ${pluralLabel}`,
      prompt: `Building ${files.length} reports. This is handled by the output build pipeline.`,
      // Note: The actual per-file prompts are built inside runOutputBuildJob.
      // The prompt above is a placeholder — runAgentJob routes to runOutputBuildJob for output_build runKind.
    });
  }

  async function runSingleAgentPhase({ project, apiKey, modelId, prompt, phaseName, signal }) {
    const promptBytes = Buffer.byteLength(prompt, "utf8");
    const result = await runCursorAgent({
      project,
      apiKey,
      modelId,
      prompt,
      signal,
      onEvent: async (event) => {
        if (event.type === "assistant_delta") {
          await appendAssistantDelta(project.slug, event.text, event.metadata);
          return;
        }

        // Attach prompt size to the run_started event
        if (event.status === "run_started") {
          event = { ...event, metadata: { ...event.metadata, promptBytes, phaseName } };
        }

        const current = await getRebuildState(project.slug);
        await setRebuildState(project.slug, {
          ...current,
          agentId: typeof event.metadata?.agentId === "string" ? event.metadata.agentId : current.agentId,
          runId: typeof event.metadata?.runId === "string" ? event.metadata.runId : current.runId,
        });
        await appendRunEvent(project.slug, event);
      },
    });

    await finishAssistantMessage(project.slug);
    return result;
  }

  async function runAgentJob({ project, apiKey, modelId, prompt, jobName, runKind, releaseProjectAgent, signal, jobContext }) {
    // Artifact builds get their own simple pipeline
    if (runKind === "artifact_build") {
      return await runArtifactBuildJob({ project, apiKey, modelId, prompt, jobName, releaseProjectAgent, jobContext });
    }

    // Batch artifact builds — run each artifact sequentially
    if (runKind === "artifact_batch_build") {
      return await runBatchArtifactBuildJob({ project, apiKey, modelId, jobName, releaseProjectAgent, artifactSlugs: jobContext?.artifactSlugs || [] });
    }

    // Section regeneration — rebuild a single section of a built artifact
    if (runKind === "section_regeneration") {
      return await runSectionRegenerationJob({ project, apiKey, modelId, prompt, jobName, releaseProjectAgent, jobContext });
    }

    // Batch section regeneration — multiple sections from annotation queue
    if (runKind === "batch_section_regeneration") {
      return await runBatchSectionRegenerationJob({ project, apiKey, modelId, jobName, releaseProjectAgent, jobContext });
    }

    // Output builds (reports) get their own pipeline
    if (runKind === "output_build") {
      return await runOutputBuildJob({ project, apiKey, modelId, jobName, releaseProjectAgent, signal });
    }

    const isFullRebuild = runKind === "full_rebuild";

    activeRebuilds.add(project.slug);
    const buildStartTime = Date.now();
    const phaseTimings = {};

    try {
      // ── Compute build scope ──
      const scope = await computeBuildScope(project.path);

      // Read deepen queue and find unsourced topics early (used in skip decision + prompt injection)
      const deepenQueue = await getDeepenQueue(project.path);
      let unsourcedTopics = [];
      try {
        const topicsData = await readTopics(project.path);
        unsourcedTopics = topicsData.topics.filter(
          (t) => t.state !== "deprecated" && t.state !== "seed"
            && (!Array.isArray(t.sources) || t.sources.length === 0),
        );
      } catch {
        // topics.json doesn't exist yet
      }

      // Build a human-readable scope summary
      const scopeReasons = [];
      if (scope.isFirstBuild) scopeReasons.push("first build");
      if (scope.projectMdChanged) scopeReasons.push("project.md changed");
      if (scope.feedbackMarkers.length > 0) scopeReasons.push(`${scope.feedbackMarkers.length} FEEDBACK marker(s)`);
      if (unsourcedTopics.length > 0) scopeReasons.push(`${unsourcedTopics.length} unsourced topic(s)`);
      if (deepenQueue.length > 0) scopeReasons.push(`${deepenQueue.length} deepen-queued topic(s)`);

      await appendRunEvent(project.slug, {
        type: "system",
        title: scopeReasons.length > 0
          ? `Build scope: ${scopeReasons.join(", ")}`
          : "Build scope: no changes detected",
        text: scopeReasons.length > 0
          ? scopeReasons.join("; ")
          : "No input changes detected. Change detection deferred to content-hash ledger after fetch + digest.",
        status: "scope_computed",
        runtime: "server",
      });

      // ── Phase 1: Research Plan (conditionally skip) ──
      const stateBeforeResearch = await getRebuildState(project.slug);
      await setRebuildState(project.slug, {
        ...stateBeforeResearch,
        buildPhase: "research",
        buildPhaseDetail: scope.skipResearchPlan ? "Skipping research (no changes)" : "Generating research plan",
      });

      if (scope.skipResearchPlan) {
        phaseTimings.research = 0;
        await appendRunEvent(project.slug, {
          type: "system",
          title: "Phase 1: Skipped (no project changes)",
          text: "project.md unchanged, no FEEDBACK markers, no unsourced topics, no deepen queue. Keeping existing research plan.",
          status: "research_plan_skipped",
          runtime: "server",
        });
      } else {
        let researchPrompt = prompt; // base research prompt

        // Inject UNSOURCED TOPICS directive
        if (unsourcedTopics.length > 0) {
          const unsourcedLines = [
            "",
            `UNSOURCED TOPICS: ${unsourcedTopics.length} topic(s) have zero sources and need initial research.`,
            "For each of these topics, generate 2–4 search queries with diverse source types (primary, secondary, contrarian):",
            "",
          ];
          for (const t of unsourcedTopics) {
            unsourcedLines.push(`- ${t.label} (${t.id})`);
            if (t.details) {
              unsourcedLines.push(`  Details: ${t.details}`);
            }
          }
          researchPrompt += unsourcedLines.join("\n");
        }

        // Inject DEEPEN DIRECTIVE
        if (deepenQueue.length > 0) {
          const deepenLines = [
            "",
            `DEEPEN DIRECTIVE: ${deepenQueue.length} topic(s) need deeper research.`,
            "For these topics, search more aggressively (see do_build_research.md Deepen Directives section):",
            "",
          ];
          for (const t of deepenQueue) {
            deepenLines.push(`- ${t.label} (${t.id})`);
            if (t.details) {
              deepenLines.push(`  User context: ${t.details}`);
            }
            if (t.coverage_gaps?.length > 0) {
              deepenLines.push(`  Coverage gaps: ${t.coverage_gaps.map((g) => typeof g === "string" ? g : g.description).join("; ")}`);
            }
          }
          researchPrompt += deepenLines.join("\n");
        }

        // Build Phase 1 title
        const phase1Parts = [];
        if (unsourcedTopics.length > 0) phase1Parts.push(`${unsourcedTopics.length} unsourced`);
        if (deepenQueue.length > 0) phase1Parts.push(`${deepenQueue.length} deepen`);
        const phase1Suffix = phase1Parts.length > 0 ? ` (${phase1Parts.join(" + ")})` : "";

        await appendRunEvent(project.slug, {
          type: "system",
          title: `Phase 1: Generating research plan${phase1Suffix}`,
          text: scope.isFirstBuild
            ? "Agent is searching the web and producing a research plan."
            : "Agent is updating the research plan based on project changes.",
          status: "research_plan",
          runtime: "cursor",
        });

        const researchStart = Date.now();
        const researchResult = await runSingleAgentPhase({
          project,
          apiKey,
          modelId,
          prompt: researchPrompt,
          phaseName: "Research Plan",
          signal,
        });
        phaseTimings.research = Math.round((Date.now() - researchStart) / 1000);

        if (researchResult.status !== "finished") {
          throw new Error(`Research plan phase failed: ${researchResult.result || "unknown error"}`);
        }
      }

      // ── Phase 2: Server-Side Fetch ──
      const stateBeforeFetch = await getRebuildState(project.slug);
      await setRebuildState(project.slug, {
        ...stateBeforeFetch,
        buildPhase: "fetching",
        buildPhaseDetail: "Fetching web sources from research plan",
      });

      await appendRunEvent(project.slug, {
        type: "system",
        title: "Phase 2: Fetching web sources",
        text: "Server is fetching and extracting content from URLs in the research plan.",
        status: "fetching_sources",
        runtime: "server",
      });

      const fetchStart = Date.now();
      const fetchResults = await runFetchPhase(project.path, {
        appendRunEvent,
        projectSlug: project.slug,
        phaseLabel: "Phase 2",
      });
      phaseTimings.fetch = Math.round((Date.now() - fetchStart) / 1000);

      // ── Phase 2.5: Generate Source Digests ──
      const stateBeforeDigests = await getRebuildState(project.slug);
      await setRebuildState(project.slug, {
        ...stateBeforeDigests,
        buildPhase: "digests",
        buildPhaseDetail: "Generating source digests for progressive discovery",
      });

      await appendRunEvent(project.slug, {
        type: "system",
        title: "Generating source digests",
        text: "Compacting full source articles into key-claim digests for progressive discovery.",
        status: "generating_digests",
        runtime: "server",
      });

      const digestStart = Date.now();
      await runDigestPhase(project.path, { appendRunEvent, projectSlug: project.slug });
      phaseTimings.digests = Math.round((Date.now() - digestStart) / 1000);

      // ── Content-hash ledger: compute what actually changed ──
      const previousLedger = await readLedger(project.path);
      const currentSnapshot = await buildSnapshot(project.path);
      const ledgerDiff = diffSnapshot(currentSnapshot, previousLedger);

      // Build a decision trace for the build log
      const decisionTrace = [];
      decisionTrace.push(`Phase 1: ${scope.skipResearchPlan ? "SKIPPED" : "ran"}`);
      decisionTrace.push(`Phase 2: ${fetchResults.fetched} fetched, ${fetchResults.skipped} cached`);
      decisionTrace.push(`Ledger: ${ledgerDiff.changedDigests.length} digest(s) changed, projectMd=${ledgerDiff.projectMdChanged}, humanInputs=${ledgerDiff.humanInputsChanged}`);

      await appendRunEvent(project.slug, {
        type: "system",
        title: `Content ledger: ${ledgerDiff.changedDigests.length} digest(s) changed`,
        text: ledgerDiff.changedDigests.length > 0
          ? `Changed: ${ledgerDiff.changedDigests.map((d) => path.basename(d)).slice(0, 10).join(", ")}${ledgerDiff.changedDigests.length > 10 ? ` (+${ledgerDiff.changedDigests.length - 10} more)` : ""}`
          : "All digest content hashes match previous build. No source material changes.",
        status: "ledger_computed",
        runtime: "server",
      });

      // Merge ledger diff into scope for triage (ledger is authoritative)
      scope.humanInputsChanged = ledgerDiff.humanInputsChanged;

      // ── Phase 3a: Wiki Synthesis (triage-based) ──
      const triage = await computeWikiTriage(project.path, scope, ledgerDiff.changedDigests, isFullRebuild);

      if (triage.action === "skip") {
        phaseTimings.wiki = 0;
        await appendRunEvent(project.slug, {
          type: "system",
          title: "Phase 3a: Skipped (no new inputs)",
          text: "No new sources, feedback, answered questions, or deepen-queued topics. Wiki pages unchanged.",
          status: "wiki_skipped",
          runtime: "server",
          metadata: { phase: "3a" },
        });

      } else if (triage.action === "targeted") {
        await appendRunEvent(project.slug, {
          type: "system",
          title: `Phase 3a: Updating ${triage.affectedPages.length} wiki page(s)`,
          text: `Pages: ${triage.affectedPages.map((p) => p.page).join(", ")}. Unchanged: ${triage.unchangedPages.length} page(s).`,
          status: "wiki_targeted",
          runtime: "server",
          metadata: { phase: "3a", affectedCount: triage.affectedPages.length, unchangedCount: triage.unchangedPages.length },
        });

        const stateBeforeWiki = await getRebuildState(project.slug);
        await setRebuildState(project.slug, {
          ...stateBeforeWiki,
          buildPhase: "wiki",
          buildPhaseDetail: `Updating ${triage.affectedPages.length} wiki page(s) (max ${MAX_WIKI_CONCURRENCY} concurrent)`,
        });

        const wikiStart = Date.now();
        const pageResults = await runWikiPagePhase({
          project, apiKey, modelId,
          affectedPages: triage.affectedPages,
        });
        phaseTimings.wiki = Math.round((Date.now() - wikiStart) / 1000);

        // Update per-page edit tracker
        await updateWikiPageTracker(project.path, pageResults);

        // Server-side: regenerate _index.md
        await regenerateWikiIndex(project.path);

        const wikiSucceeded = pageResults.filter((r) => r.result.status === "finished").length;
        const wikiFailed = pageResults.filter((r) => r.result.status !== "finished").length;

        await appendRunEvent(project.slug, {
          type: "system",
          title: `Phase 3a complete: ${wikiSucceeded} succeeded, ${wikiFailed} failed`,
          text: wikiFailed > 0
            ? `Failed: ${pageResults.filter((r) => r.result.status !== "finished").map((r) => r.page).join(", ")}`
            : `All ${wikiSucceeded} wiki pages updated successfully.`,
          status: wikiFailed > 0 ? "wiki_partial" : "wiki_complete",
          runtime: "server",
          metadata: { phase: "3a", succeeded: wikiSucceeded, failed: wikiFailed },
        });

      } else {
        // Full wiki rebuild (first build, project.md changed, or user-requested)
        await appendRunEvent(project.slug, {
          type: "system",
          title: `Phase 3a: Full wiki rebuild${triage.fullRebuildReason ? ` (${triage.fullRebuildReason})` : ""}`,
          text: "Agent is synthesizing all wiki pages from source digests.",
          status: "wiki_synthesis",
          runtime: "cursor",
          metadata: { phase: "3a", reason: triage.fullRebuildReason },
        });

        const stateBeforeWiki = await getRebuildState(project.slug);
        await setRebuildState(project.slug, {
          ...stateBeforeWiki,
          buildPhase: "wiki",
          buildPhaseDetail: "Full wiki rebuild from source digests",
        });

        const wikiPrompt = createWikiOnlyPrompt(project, scope);
        const wikiStart = Date.now();
        const wikiResult = await runSingleAgentPhase({
          project,
          apiKey,
          modelId,
          prompt: wikiPrompt,
          phaseName: "Wiki Synthesis",
          signal,
        });
        phaseTimings.wiki = Math.round((Date.now() - wikiStart) / 1000);

        if (wikiResult.status !== "finished") {
          throw new Error(`Wiki synthesis phase failed: ${wikiResult.result || "unknown error"}`);
        }

        // Reset all page edit counts after full rebuild
        await resetWikiPageTracker(project.path);
      }

      // NOTE: Phase 3b (directed outputs) and Phase 3c (validation) are removed.
      // Reports are built on-demand from the Reports page via startOutputBuild().
      // Validation is folded into wiki synthesis (do_build.md Phase 7).

      // For knowledge pipeline result tracking
      let synthesisResult = { status: "finished", result: "wiki complete" };

      // ── Server-Side File Validation (lightweight) ──
      const currentManifest = await readManifest(project.path);
      const validationResults = await validateFileExistence(project.path, currentManifest ?? {});

      await appendRunEvent(project.slug, {
        type: "system",
        title: validationResults.passed
          ? "File validation passed"
          : `File validation found ${validationResults.issues.length} issue(s)`,
        text: validationResults.issues.join("\n") || "All expected files exist with content.",
        status: validationResults.passed ? "validation_passed" : "validation_issues",
        runtime: "server",
      });

      // ── Phase 3d: Auto-answer open questions from evidence ──
      try {
        const questionsData = await readQuestions(project.path);
        const openQuestions = questionsData.questions.filter((q) => q.status === "open");

        if (openQuestions.length > 0) {
          await appendRunEvent(project.slug, {
            type: "system",
            title: `Phase 3d: Auto-answering ${openQuestions.length} open question(s)`,
            text: "Agent is reviewing open questions against gathered sources and digests.",
            status: "auto_answer",
            runtime: "cursor",
            metadata: { phase: "3d", openQuestionCount: openQuestions.length },
          });

          const stateBeforeAutoAnswer = await getRebuildState(project.slug);
          await setRebuildState(project.slug, {
            ...stateBeforeAutoAnswer,
            buildPhase: "auto_answer",
            buildPhaseDetail: `Reviewing ${openQuestions.length} open question(s) against evidence`,
          });

          const autoAnswerPrompt = createAutoAnswerPrompt(project, openQuestions);
          const autoAnswerStart = Date.now();
          await runSingleAgentPhase({
            project,
            apiKey,
            modelId,
            prompt: autoAnswerPrompt,
            phaseName: "Auto-Answer Questions",
            signal,
          });
          phaseTimings.autoAnswer = Math.round((Date.now() - autoAnswerStart) / 1000);

          // Check results
          const updatedQuestions = await readQuestions(project.path);
          const answeredCount = updatedQuestions.questions.filter(
            (q) => q.status === "answered" && q.answeredBy === "ai_auto"
          ).length;

          if (answeredCount > 0) {
            await appendRunEvent(project.slug, {
              type: "system",
              title: `Auto-answered ${answeredCount} question(s)`,
              text: `${answeredCount} of ${openQuestions.length} open questions were answered from gathered evidence.`,
              status: "auto_answer_complete",
              runtime: "server",
              metadata: { phase: "3d", answeredCount, totalOpen: openQuestions.length },
            });
          } else {
            await appendRunEvent(project.slug, {
              type: "system",
              title: "No questions auto-answered",
              text: "None of the open questions could be conclusively answered from current evidence.",
              status: "auto_answer_complete",
              runtime: "server",
              metadata: { phase: "3d", answeredCount: 0, totalOpen: openQuestions.length },
            });
          }
        }
      } catch (autoAnswerError) {
        // Non-fatal — continue build even if auto-answer fails
        console.error("Auto-answer phase failed:", autoAnswerError);
        await appendRunEvent(project.slug, {
          type: "system",
          title: "Auto-answer phase skipped",
          text: `Error: ${autoAnswerError.message}`,
          status: "auto_answer_error",
          runtime: "server",
          metadata: { phase: "3d", error: autoAnswerError.message },
        });
      }

      // ── Phase 3c.3: Server-Side Recording ──
      const stateBeforeRecording = await getRebuildState(project.slug);
      await setRebuildState(project.slug, {
        ...stateBeforeRecording,
        buildPhase: "recording",
        buildPhaseDetail: "Writing manifest, build log, and git snapshot",
      });

      // deepenQueue was already read at the top of this try block (before Phase 1)

      // Collect the full set of wiki pages for the manifest
      const allWikiPages = triage.action === "skip"
        ? (currentManifest?.wiki_pages ?? [])
        : triage.action === "targeted"
          ? [...new Set([...(currentManifest?.wiki_pages ?? []), ...triage.affectedPages.map((p) => p.page)])]
          : triage.affectedPages?.map((p) => p.page) ?? [];

      // Write manifest (metadata only — change detection is in content_ledger.json)
      await writeManifest(project.path, {
        version: 2,
        project_name: project.name,
        last_build: new Date().toISOString(),
        project_md_hash: scope.projectMdHash,
        scope: scope.isFirstBuild ? "full" : scope.projectMdChanged ? "targeted" : "refresh",
        wiki_pages: allWikiPages,
        sources_gathered: fetchResults.fetched,
        sources_refreshed: fetchResults.skipped,
        feedback_applied: scope.feedbackMarkers.length,
        topics_deepened: deepenQueue.length,
        build_notes: `${triage.action} wiki (knowledge build)`,
        build_type: "knowledge",
        decision_trace: decisionTrace,
      });

      // Write content-hash ledger (authoritative change detection for next build)
      await writeLedger(project.path, currentSnapshot);

      // Record knowledge build timestamp (for stale detection in Reports/Artifacts pages)
      await recordKnowledgeBuild(project.path);

      // Write build log
      await prependBuildLogEntry(project.path, {
        timestamp: new Date().toISOString(),
        scope: scope.isFirstBuild ? "full" : scope.projectMdChanged ? "targeted" : "refresh",
        buildType: "knowledge",
        modelId,
        durationSeconds: Math.round((Date.now() - buildStartTime) / 1000),
        wikiPagesUpdated: triage.action === "skip" ? 0
          : triage.action === "targeted" ? triage.affectedPages.length : "all",
        sourcesFetched: fetchResults.fetched,
        feedbackApplied: scope.feedbackMarkers.length,
        topicsDeepened: deepenQueue.length,
        notes: null,
      });

      // Git snapshot
      const gitResult = await gitSnapshot(project.path,
        `kiss_ai build: ${project.name} (${new Date().toISOString().slice(0, 10)})`,
      );

      await appendRunEvent(project.slug, {
        type: "system",
        title: gitResult.success ? `Git snapshot: ${gitResult.commitHash}` : "Git snapshot failed",
        text: gitResult.success ? `Committed as ${gitResult.commitHash}` : gitResult.error,
        status: gitResult.success ? "git_committed" : "git_failed",
        runtime: "server",
        metadata: { phase: "3c.3", commitHash: gitResult.commitHash },
      });

      // Record file changes for sidebar badges
      if (gitResult.success && gitResult.commitHash !== "no-changes") {
        await recordBuildFileChanges(project.path);
      }

      // Post-build: reconcile sources from research plan → topics.json
      // This runs on every build to catch sources the agent missed,
      // but is especially critical for deepen passes where the wiki page
      // agent is explicitly told not to update topics.json.
      try {
        const reconciliation = await reconcileTopicSources(project.path);
        if (reconciliation.newSourcesAdded > 0) {
          await appendRunEvent(project.slug, {
            type: "system",
            title: `Source reconciliation: ${reconciliation.newSourcesAdded} new source(s) linked to ${reconciliation.reconciledTopics} topic(s)`,
            text: reconciliation.details
              .map((d) => `${d.topicLabel}: +${d.sourcesAdded} (${d.totalSources} total, types: ${d.sourceTypes.join(", ")})`)
              .join("; "),
            status: "sources_reconciled",
            runtime: "server",
          });
        }
      } catch (reconcileError) {
        // Non-fatal — log and continue
        await appendRunEvent(project.slug, {
          type: "system",
          title: "Source reconciliation skipped",
          text: reconcileError instanceof Error ? reconcileError.message : "Unknown error",
          status: "reconciliation_skipped",
          runtime: "server",
        });
      }

      // Post-build: compute wiki-content-based metrics (data points, cross-refs, contrarian evidence)
      try {
        const wikiMetrics = await computeWikiMetrics(project.path);
        if (wikiMetrics.updated > 0) {
          await appendRunEvent(project.slug, {
            type: "system",
            title: `Wiki metrics: ${wikiMetrics.updated} topic(s) updated`,
            text: wikiMetrics.details
              .map((d) => `${d.topicLabel}: ${d.metrics.data_point_count} data pts, ${d.metrics.cross_references} cross-refs, contrarian: ${d.metrics.has_contrarian_evidence ? "yes" : "no"}`)
              .join("; "),
            status: "wiki_metrics_computed",
            runtime: "server",
          });
        }
      } catch (metricsError) {
        // Non-fatal — log and continue
        await appendRunEvent(project.slug, {
          type: "system",
          title: "Wiki metrics computation skipped",
          text: metricsError instanceof Error ? metricsError.message : "Unknown error",
          status: "wiki_metrics_skipped",
          runtime: "server",
        });
      }

      // Post-build: auto-advance topic states based on metrics (shallow→deep, deep→saturated)
      try {
        const advancement = await autoAdvanceTopicStates(project.path);
        if (advancement.advanced > 0) {
          await appendRunEvent(project.slug, {
            type: "system",
            title: `Topic state advancement: ${advancement.advanced} topic(s) advanced`,
            text: advancement.details
              .map((d) => `${d.topicLabel}: ${d.from} → ${d.to}`)
              .join("; "),
            status: "topics_advanced",
            runtime: "server",
          });
        }
      } catch (advanceError) {
        await appendRunEvent(project.slug, {
          type: "system",
          title: "Topic state advancement skipped",
          text: advanceError instanceof Error ? advanceError.message : "Unknown error",
          status: "advancement_skipped",
          runtime: "server",
        });
      }

      // Post-build: update deepen state and write deepen_log entries
      if (deepenQueue.length > 0) {
        const topicsData = await readTopics(project.path);
        const now = new Date().toISOString();
        for (const topic of topicsData.topics) {
          if (topic.queued_for_deepen) {
            const stateBefore = topic.state;
            const sourcesBefore = (topic.sources ?? []).length;

            topic.queued_for_deepen = false;
            topic.discovery = topic.discovery || {};
            topic.discovery.deepening_count = (topic.discovery.deepening_count || 0) + 1;
            topic.discovery.last_deepened = now;

            // Write a deepen_log entry so the user can track what each deepen accomplished
            if (!Array.isArray(topic.deepen_log)) {
              topic.deepen_log = [];
            }
            topic.deepen_log.unshift({
              deepened_at: now,
              sources_added: (topic.sources ?? []).length - sourcesBefore,
              sources_total: (topic.sources ?? []).length,
              state_before: stateBefore,
              state_after: topic.state,
              source_types: topic.metrics?.source_types ?? [],
            });
          }
        }
        await writeTopics(project.path, topicsData.topics, topicsData.clusters);

        await appendRunEvent(project.slug, {
          type: "system",
          title: `Deepen queue cleared (${deepenQueue.length} topic(s) processed)`,
          text: deepenQueue.map((t) => t.label).join(", "),
          status: "deepen_complete",
          runtime: "server",
        });
      }

      // NOTE: Auto-artifact phase is removed from knowledge pipeline.
      // Artifacts are now built on-demand from the Artifacts page.

      // ── Completion ──
      const completedState = await getRebuildState(project.slug);
      const buildDurationSeconds = Math.round((Date.now() - buildStartTime) / 1000);
      const { attentionCount, finishedWithAttention, message, status } = await createAgentJobCompletionMessage(jobName)({ project, result: synthesisResult });
      await setRebuildState(project.slug, {
        ...completedState,
        running: false,
        status,
        finishedAt: new Date().toISOString(),
        message,
        buildPhase: "complete",
        buildPhaseDetail: null,
      });
      await appendRunEvent(project.slug, {
        type: synthesisResult.status === "finished" ? "run_status" : "error",
        title: finishedWithAttention ? `${jobName} complete (${buildDurationSeconds}s)` : synthesisResult.status === "finished" ? `${jobName} finished (${buildDurationSeconds}s)` : `${jobName} stopped before finishing`,
        text: message,
        status,
        runtime: "cursor",
        metadata: {
          resultStatus: synthesisResult.status,
          attentionCount,
          resultDetail: typeof synthesisResult.result === "string" ? synthesisResult.result.trim() : "",
          fetchResults,
          buildDurationSeconds,
          modelId,
          phaseTimings,
        },
      });
    } catch (error) {
      await finishAssistantMessage(project.slug);
      const isCancelled = error?.name === "AbortError";
      const status = isCancelled ? "interrupted" : "error";
      const message = isCancelled
        ? "Cancelled by user."
        : (error instanceof Error ? error.message : `Unknown Cursor SDK ${jobName.toLowerCase()} failure.`);

      const current = await getRebuildState(project.slug);
      await setRebuildState(project.slug, {
        ...current,
        running: false,
        status,
        finishedAt: new Date().toISOString(),
        message,
      });
      await appendRunEvent(project.slug, {
        type: isCancelled ? "run_status" : "error",
        title: isCancelled ? `${jobName} cancelled` : `${jobName} failed`,
        text: message,
        status,
        runtime: "cursor",
      });
    } finally {
      activeRebuilds.delete(project.slug);
      activeAbortControllers.delete(project.slug);
      releaseProjectAgent();
    }
  }

  async function runAutoArtifactPhase({ project, apiKey, modelId }) {
    // ── Step 1: Propose artifact specs for outputs that have NO spec at all (initial creation only) ──
    const outputsNeedingSpecs = await findDirectedOutputsWithoutArtifacts(project.path);

    if (outputsNeedingSpecs.length > 0) {
      await appendRunEvent(project.slug, {
        type: "system",
        title: `Phase 5: Proposing artifact designs for ${outputsNeedingSpecs.length} directed output(s)`,
        text: `Outputs: ${outputsNeedingSpecs.map((o) => o.outputFile).join(", ")}`,
        status: "auto_artifact_proposing",
        runtime: "cursor",
        metadata: { phase: "5", outputCount: outputsNeedingSpecs.length },
      });

      // Snapshot existing specs before the agent writes new ones
      const specsBefore = await listArtifactSpecs(project.path);
      const slugsBefore = new Set(specsBefore.map((s) => s.slug));

      // Run the agent to propose and write .artifact.md files
      const proposalPrompt = await createProposeOutputArtifactsPrompt(
        project, outputsNeedingSpecs, specsBefore, modelId,
      );

      const proposalResult = await runSingleAgentPhase({
        project,
        apiKey,
        modelId,
        prompt: proposalPrompt,
        phaseName: "Propose Output Artifact Specs",
        signal: undefined,
      });

      if (proposalResult.status === "finished") {
        // Detect which new specs the agent created
        const specsAfter = await listArtifactSpecs(project.path);
        const newOutputSpecSlugs = specsAfter
          .filter((s) => !slugsBefore.has(s.slug))
          .map((s) => s.slug);

        if (newOutputSpecSlugs.length > 0) {
          await appendRunEvent(project.slug, {
            type: "system",
            title: `Phase 5: Agent created ${newOutputSpecSlugs.length} output artifact spec(s)`,
            text: `New specs: ${newOutputSpecSlugs.join(", ")}`,
            status: "auto_artifact_output_specs_created",
            runtime: "server",
            metadata: { phase: "5", created: newOutputSpecSlugs },
          });
        }
      } else {
        // Non-fatal — continue even if proposal failed
        console.error("Output artifact proposal phase did not finish:", proposalResult.result);
        await appendRunEvent(project.slug, {
          type: "system",
          title: "Phase 5: Output artifact proposal did not complete",
          text: `Status: ${proposalResult.status}`,
          status: "auto_artifact_proposal_warning",
          runtime: "server",
          metadata: { phase: "5", proposalStatus: proposalResult.status },
        });
      }
    }

    // NOTE: Per-topic artifact specs are NOT auto-generated during builds.
    // Topic artifacts can be created manually from the Artifacts UI.
    // Only directed output artifact specs are proposed and built automatically.

    // ── Step 2: Build artifacts with lifecycle = "on_build" ──
    const allSpecs = await listArtifactSpecs(project.path);
    const onBuildSpecs = allSpecs.filter((s) => s.lifecycle === "on_build");

    if (onBuildSpecs.length === 0) {
      // No on_build artifacts — nothing to do
      const manualCount = allSpecs.filter((s) => s.lifecycle === "manual" || !s.lifecycle).length;
      await appendRunEvent(project.slug, {
        type: "system",
        title: "Phase 5: No on_build artifacts to update",
        text: manualCount > 0
          ? `${manualCount} artifact(s) have lifecycle=manual. Build them on-demand from the Artifacts UI.`
          : "No artifact specs found.",
        status: "auto_artifact_skipped",
        runtime: "server",
        metadata: { phase: "5", manualCount },
      });
      return;
    }

    // For on_build specs: update spec + build HTML
    await appendRunEvent(project.slug, {
      type: "system",
      title: `Phase 5: Building ${onBuildSpecs.length} on_build artifact(s)`,
      text: `Artifacts: ${onBuildSpecs.map((s) => s.name).join(", ")}`,
      status: "auto_artifact_build_start",
      runtime: "server",
      metadata: { phase: "5", totalArtifacts: onBuildSpecs.length },
    });

    const stateBeforeArtifacts = await getRebuildState(project.slug);
    await setRebuildState(project.slug, {
      ...stateBeforeArtifacts,
      buildPhase: "auto_artifacts",
      buildPhaseDetail: `Building ${onBuildSpecs.length} on_build artifact(s)`,
    });

    let completed = 0;
    let succeeded = 0;
    let failed = 0;

    for (const spec of onBuildSpecs) {
      try {
        const fullSpec = await readArtifactSpec(project.path, spec.slug);
        const sourceGlobs = Array.isArray(fullSpec.frontmatter.sources) ? fullSpec.frontmatter.sources : [];
        const resolvedSources = await resolveArtifactSources(project.path, sourceGlobs);
        const explicitPaths = resolvedSources.map((s) => s.relativePath);
        const discoveryInventory = await discoverRelevantSources(project.path, explicitPaths);

        // Clear and recreate build directory
        const buildDir = path.join(project.path, "artifacts/builds", spec.slug);
        try {
          await fs.rm(buildDir, { recursive: true, force: true });
          await fs.mkdir(buildDir, { recursive: true });
        } catch { /* directory may not exist yet */ }

        const crypto = await import("node:crypto");
        const specHash = crypto.createHash("sha256").update(fullSpec.rawContent).digest("hex");

        const artifactPrompt = await createArtifactPrompt(project, fullSpec, resolvedSources, discoveryInventory, specHash);

        await appendRunEvent(project.slug, {
          type: "system",
          title: `Phase 5: Building "${spec.name}" (on_build)`,
          text: `Agent is generating HTML artifact with ${resolvedSources.length} source(s).`,
          status: "auto_artifact_building",
          runtime: "cursor",
          metadata: { phase: "5", artifactSlug: spec.slug },
        });

        const result = await runSingleAgentPhase({
          project,
          apiKey,
          modelId,
          prompt: artifactPrompt,
          phaseName: `Artifact: ${spec.name}`,
          signal: undefined,
        });

        completed++;
        if (result.status === "finished") {
          succeeded++;
        } else {
          failed++;
        }

        await appendRunEvent(project.slug, {
          type: "system",
          title: `Phase 5: "${spec.name}" ${result.status === "finished" ? "complete" : "failed"} (${completed}/${onBuildSpecs.length})`,
          text: result.status === "finished"
            ? `Successfully built artifact.`
            : `Artifact build ended with status: ${result.status}`,
          status: result.status === "finished" ? "auto_artifact_complete" : "auto_artifact_error",
          runtime: "cursor",
          metadata: { phase: "5", artifactSlug: spec.slug, completed, total: onBuildSpecs.length },
        });
      } catch (buildError) {
        completed++;
        failed++;
        console.error(`Auto-artifact build failed for ${spec.slug}:`, buildError);

        await appendRunEvent(project.slug, {
          type: "system",
          title: `Phase 5: "${spec.slug}" failed (${completed}/${onBuildSpecs.length})`,
          text: buildError instanceof Error ? buildError.message : "Unknown build error",
          status: "auto_artifact_error",
          runtime: "server",
          metadata: { phase: "5", artifactSlug: spec.slug, completed, total: onBuildSpecs.length },
        });
      }
    }

    if (onBuildSpecs.length > 0) {
      await appendRunEvent(project.slug, {
        type: "system",
        title: `Phase 5 complete: ${succeeded} succeeded, ${failed} failed`,
        text: failed > 0
          ? `${succeeded} on_build artifacts built, ${failed} failed.`
          : `All ${succeeded} on_build artifacts built successfully.`,
        status: failed > 0 ? "auto_artifact_partial" : "auto_artifact_all_complete",
        runtime: "server",
        metadata: { phase: "5", succeeded, failed, total: onBuildSpecs.length },
      });
    }
  }


  /**
   * Build selected report files on demand.
   * This is the output build pipeline — no research, no fetch, no wiki.
   * Just generates reports from current wiki + sources.
   */
  async function runOutputBuildJob({ project, apiKey, modelId, jobName, releaseProjectAgent, signal }) {
    activeRebuilds.add(project.slug);
    const buildStartTime = Date.now();

    try {
      // Read the output build request from state (files were stored when startOutputBuild was called)
      // For now, build the source mapping and use it to find which files to build
      const { mapping: sourceMap } = await buildSourceMapping(project.path);
      const outputFiles = Object.keys(sourceMap);

      if (outputFiles.length === 0) {
        const current = await getRebuildState(project.slug);
        await setRebuildState(project.slug, {
          ...current,
          running: false,
          status: "finished",
          finishedAt: new Date().toISOString(),
          message: "No report files found to build.",
          buildPhase: "complete",
        });
        return;
      }

      await appendRunEvent(project.slug, {
        type: "system",
        title: `Building ${outputFiles.length} report(s)`,
        text: `Each report gets its own agent call with focused context (wiki pages + source files). Max ${MAX_FILE_CONCURRENCY} concurrent.`,
        status: "output_build_start",
        runtime: "server",
      });

      const stateBeforeFiles = await getRebuildState(project.slug);
      await setRebuildState(project.slug, {
        ...stateBeforeFiles,
        buildPhase: "output_build",
        buildPhaseDetail: `Building ${outputFiles.length} report(s) (max ${MAX_FILE_CONCURRENCY} concurrent)`,
      });

      const fileResults = await runFileSynthesisPhase({
        project,
        apiKey,
        modelId,
        sourceMap,
      });

      // Record per-file build timestamps
      for (const result of fileResults) {
        if (result.result.status === "finished") {
          await recordOutputBuild(project.path, result.file);
        }
      }

      const succeededFiles = fileResults.filter((r) => r.result.status === "finished").length;
      const failedFiles = fileResults.filter((r) => r.result.status !== "finished").length;
      const buildDurationSeconds = Math.round((Date.now() - buildStartTime) / 1000);

      await appendRunEvent(project.slug, {
        type: "system",
        title: `Output build complete: ${succeededFiles} succeeded, ${failedFiles} failed (${buildDurationSeconds}s)`,
        text: failedFiles > 0
          ? `Failed: ${fileResults.filter((r) => r.result.status !== "finished").map((r) => r.file).join(", ")}`
          : `All ${succeededFiles} report(s) built successfully.`,
        status: failedFiles > 0 ? "output_build_partial" : "output_build_complete",
        runtime: "server",
      });

      // Git snapshot after output build
      const gitResult = await gitSnapshot(project.path,
        `kiss_ai output build: ${project.name} (${new Date().toISOString().slice(0, 10)})`,
      );

      // Record file changes for sidebar badges
      if (gitResult.success && gitResult.commitHash !== "no-changes") {
        await recordBuildFileChanges(project.path);
      }

      const current = await getRebuildState(project.slug);
      await setRebuildState(project.slug, {
        ...current,
        running: false,
        status: failedFiles > 0 ? "finished_with_attention" : "finished",
        finishedAt: new Date().toISOString(),
        message: `Built ${succeededFiles} report(s)${failedFiles > 0 ? `, ${failedFiles} failed` : ""}.`,
        buildPhase: "complete",
        buildPhaseDetail: null,
      });
    } catch (error) {
      await finishAssistantMessage(project.slug);
      const isCancelled = error?.name === "AbortError";
      const status = isCancelled ? "interrupted" : "error";
      const message = isCancelled
        ? "Cancelled by user."
        : (error instanceof Error ? error.message : "Unknown output build failure.");

      const current = await getRebuildState(project.slug);
      await setRebuildState(project.slug, {
        ...current,
        running: false,
        status,
        finishedAt: new Date().toISOString(),
        message,
      });
      await appendRunEvent(project.slug, {
        type: isCancelled ? "run_status" : "error",
        title: isCancelled ? `${jobName} cancelled` : `${jobName} failed`,
        text: message,
        status,
        runtime: "cursor",
      });
    } finally {
      activeRebuilds.delete(project.slug);
      activeAbortControllers.delete(project.slug);
      releaseProjectAgent();
    }
  }

  async function runArtifactBuildJob({ project, apiKey, modelId, prompt, jobName, releaseProjectAgent, jobContext }) {
    activeRebuilds.add(project.slug);

    try {
      await appendRunEvent(project.slug, {
        type: "system",
        title: `Building artifact`,
        text: "Agent is generating the HTML artifact from research data.",
        status: "artifact_build",
        runtime: "cursor",
      });

      const stateBeforeBuild = await getRebuildState(project.slug);
      await setRebuildState(project.slug, {
        ...stateBeforeBuild,
        buildPhase: "artifact_build",
        buildPhaseDetail: "Generating HTML artifact",
      });

      const result = await runSingleAgentPhase({
        project,
        apiKey,
        modelId,
        prompt,
        phaseName: "Artifact Build",
        signal: undefined,
      });

      const buildCompletion = createAgentJobCompletionMessage(jobName);
      const { message, status } = await buildCompletion({ project, result });

      // Stamp contractVersion into the manifest so the UI knows section editing is safe
      if (status === "finished" || status === "finished_with_attention") {
        const artifactSlug = jobContext?.artifactSlugs?.[0];
        if (artifactSlug) {
          try { await stampManifestAfterBuild(project.path, artifactSlug); } catch { /* non-fatal */ }
        }
      }

      const current = await getRebuildState(project.slug);
      await setRebuildState(project.slug, {
        ...current,
        running: false,
        status,
        finishedAt: new Date().toISOString(),
        message,
        buildQueue: null,
      });

      await appendRunEvent(project.slug, {
        type: status === "finished" ? "system" : "error",
        title: `${jobName} ${status}`,
        text: message,
        status,
        runtime: "cursor",
      });
    } catch (error) {
      await finishAssistantMessage(project.slug);
      const message = error instanceof Error ? error.message : `Unknown artifact build failure.`;

      const current = await getRebuildState(project.slug);
      await setRebuildState(project.slug, {
        ...current,
        running: false,
        status: "error",
        finishedAt: new Date().toISOString(),
        message,
        buildQueue: null,
      });
      await appendRunEvent(project.slug, {
        type: "error",
        title: `${jobName} failed`,
        text: message,
        status: "error",
        runtime: "cursor",
      });
    } finally {
      activeRebuilds.delete(project.slug);
      releaseProjectAgent();
    }
  }

  async function runSectionRegenerationJob({ project, apiKey, modelId, prompt, jobName, releaseProjectAgent, jobContext }) {
    const { artifactSlug, sectionId } = jobContext;
    activeRebuilds.add(project.slug);

    try {
      const buildDir = getArtifactBuildPath(project.path, artifactSlug);
      const indexPath = path.join(buildDir, 'index.html');
      const backupsDir = path.join(buildDir, '.backups');
      const fragmentPath = path.join(buildDir, '.section-fragment.html');

      // Create backup — abort if this fails
      await createSectionBackup(indexPath, backupsDir);

      await appendRunEvent(project.slug, {
        type: "system",
        title: `Regenerating section: ${sectionId}`,
        text: `Agent is regenerating the "${sectionId}" section.`,
        status: "section_regeneration",
        runtime: "cursor",
      });

      const stateBeforeRegen = await getRebuildState(project.slug);
      await setRebuildState(project.slug, {
        ...stateBeforeRegen,
        buildPhase: "section_regeneration",
        buildPhaseDetail: `Regenerating section: ${sectionId}`,
      });

      // The agent writes the fragment to .section-fragment.html
      // Add a directive to the prompt telling the agent where to write
      const fullPrompt = prompt + `\n\nWrite your output to: artifacts/builds/${artifactSlug}/.section-fragment.html\nWrite ONLY the inner HTML content for this section — no surrounding document tags.`;

      const result = await runSingleAgentPhase({
        project,
        apiKey,
        modelId,
        prompt: fullPrompt,
        phaseName: `Section: ${sectionId}`,
        signal: undefined,
      });

      if (result.status !== 'finished') {
        const buildCompletion = createAgentJobCompletionMessage(jobName);
        const { message, status } = await buildCompletion({ project, result });

        const current = await getRebuildState(project.slug);
        await setRebuildState(project.slug, {
          ...current,
          running: false,
          status,
          finishedAt: new Date().toISOString(),
          message,
          buildQueue: null,
        });
        return;
      }

      // Read the fragment the agent wrote
      let rawFragment;
      try {
        rawFragment = await fs.readFile(fragmentPath, 'utf8');
      } catch {
        throw new Error(`Agent did not write the section fragment to ${fragmentPath}. Regeneration failed.`);
      }

      // Clean up the fragment file
      try { await fs.unlink(fragmentPath); } catch { /* ignore */ }

      // Read current HTML and splice
      const currentHtml = await fs.readFile(indexPath, 'utf8');
      let updatedHtml = replaceSection(currentHtml, sectionId, rawFragment);

      if (!updatedHtml) {
        throw new Error(`Failed to splice regenerated section "${sectionId}" — sanitization or tag balance check failed. Backup preserved.`);
      }

      // Update nav text if heading changed
      const section = extractSection(updatedHtml, sectionId);
      if (section) {
        updatedHtml = updateNavText(updatedHtml, sectionId, section.innerHTML);
      }

      // Validate: the section ID must still be present
      if (!updatedHtml.includes(`id="${sectionId}"`)) {
        throw new Error(`Section "${sectionId}" not found in spliced HTML — validation failed. Restoring backup.`);
      }

      // Write the updated HTML
      await fs.writeFile(indexPath, updatedHtml, 'utf8');

      // Update manifest
      const manifest = await updateManifestForRegeneration(project.path, artifactSlug, sectionId);

      // Check style fragmentation
      const fragmentation = checkStyleFragmentation(updatedHtml);

      const successMessage = fragmentation.suggestRebuild
        ? `Section "${sectionId}" regenerated. Note: ${fragmentation.withScopedStyles}/${fragmentation.total} sections have scoped styles — consider a full rebuild.`
        : `Section "${sectionId}" regenerated successfully.`;

      const current = await getRebuildState(project.slug);
      await setRebuildState(project.slug, {
        ...current,
        running: false,
        status: 'finished',
        finishedAt: new Date().toISOString(),
        message: successMessage,
        buildQueue: null,
      });

      await appendRunEvent(project.slug, {
        type: "system",
        title: `Section "${sectionId}" regenerated`,
        text: successMessage,
        status: "finished",
        runtime: "server",
        metadata: {
          sectionId,
          artifactSlug,
          regenerationCount: manifest.regenerationCount,
          fragmentation,
        },
      });
    } catch (error) {
      await finishAssistantMessage(project.slug);
      const message = error instanceof Error ? error.message : `Unknown section regeneration failure.`;

      const current = await getRebuildState(project.slug);
      await setRebuildState(project.slug, {
        ...current,
        running: false,
        status: "error",
        finishedAt: new Date().toISOString(),
        message,
        buildQueue: null,
      });
      await appendRunEvent(project.slug, {
        type: "error",
        title: `${jobName} failed`,
        text: message,
        status: "error",
        runtime: "server",
      });
    } finally {
      activeRebuilds.delete(project.slug);
      releaseProjectAgent();
    }
  }

  async function runBatchSectionRegenerationJob({ project, apiKey, modelId, jobName, releaseProjectAgent, jobContext }) {
    activeRebuilds.add(project.slug);
    const { artifactSlug, sectionJobs } = jobContext;
    const totalCount = sectionJobs.length;
    let completed = 0;
    let failed = 0;

    try {
      for (const job of sectionJobs) {
        completed++;
        const progressLabel = `(${completed}/${totalCount})`;
        const isAddSection = job.type === 'add_section';

        try {
          await appendRunEvent(project.slug, {
            type: "system",
            title: isAddSection
              ? `Adding new section ${progressLabel}`
              : `Regenerating section ${progressLabel}: ${job.sectionTitle}`,
            text: isAddSection
              ? `Creating a new section based on the user's description.`
              : `Applying ${job.annotationIds.length} annotation(s) to section "${job.sectionId}".`,
            status: "section_regeneration",
            runtime: "server",
          });

          const stateBeforeBuild = await getRebuildState(project.slug);
          await setRebuildState(project.slug, {
            ...stateBeforeBuild,
            buildPhase: "section_regeneration",
            buildPhaseDetail: isAddSection
              ? `Adding new section ${progressLabel}`
              : `Regenerating ${job.sectionTitle} ${progressLabel}`,
          });

          const buildDir = getArtifactBuildPath(project.path, artifactSlug);
          const fragmentPath = path.join(buildDir, '.section-fragment.html');
          const indexPath = path.join(buildDir, 'index.html');

          // Build the file-write directive based on job type
          const writeDirective = isAddSection
            ? `\n\nWrite your output to: artifacts/builds/${artifactSlug}/.section-fragment.html\nWrite the COMPLETE <section id="...">...</section> block including the opening and closing section tags.`
            : `\n\nWrite your output to: artifacts/builds/${artifactSlug}/.section-fragment.html\nWrite ONLY the inner HTML content for this section — no surrounding document tags.`;

          const fullPrompt = job.prompt + writeDirective;

          const result = await runSingleAgentPhase({
            project,
            apiKey,
            modelId,
            prompt: fullPrompt,
            phaseName: isAddSection ? `New Section` : `Section: ${job.sectionTitle}`,
            signal: undefined,
          });

          if (result.status !== "finished") {
            failed++;
            try { await markFailed(project.path, artifactSlug, job.annotationIds); } catch { /* non-fatal */ }
            continue;
          }

          // Read the fragment the agent wrote
          let rawFragment;
          try {
            rawFragment = await fs.readFile(fragmentPath, 'utf8');
          } catch {
            failed++;
            try { await markFailed(project.path, artifactSlug, job.annotationIds); } catch { /* non-fatal */ }
            continue;
          }

          // Clean up the fragment file
          try { await fs.unlink(fragmentPath); } catch { /* ignore */ }

          // Read current HTML and splice
          const currentHtml = await fs.readFile(indexPath, 'utf8');

          await createSectionBackup(indexPath, path.join(buildDir, '.backups'));

          let updatedHtml;

          if (isAddSection) {
            // Insert a new section block into the HTML
            updatedHtml = insertSectionAfter(currentHtml, job.afterSectionId, rawFragment);
            if (!updatedHtml) {
              failed++;
              try { await markFailed(project.path, artifactSlug, job.annotationIds); } catch { /* non-fatal */ }
              continue;
            }
          } else {
            // Replace existing section's inner HTML
            updatedHtml = replaceSection(currentHtml, job.sectionId, rawFragment);
            if (!updatedHtml) {
              failed++;
              try { await markFailed(project.path, artifactSlug, job.annotationIds); } catch { /* non-fatal */ }
              continue;
            }

            // Update nav text if heading changed
            const section = extractSection(updatedHtml, job.sectionId);
            if (section) {
              updatedHtml = updateNavText(updatedHtml, job.sectionId, section.innerHTML);
            }
          }

          await fs.writeFile(indexPath, updatedHtml, 'utf8');

          if (!isAddSection) {
            await updateManifestForRegeneration(project.path, artifactSlug, job.sectionId);
          }

          // Mark annotations as applied
          try { await markApplied(project.path, artifactSlug, job.annotationIds); } catch { /* non-fatal */ }

          await appendRunEvent(project.slug, {
            type: "system",
            title: isAddSection
              ? `New section added ${progressLabel}`
              : `Section ${progressLabel}: ${job.sectionTitle} regenerated`,
            text: isAddSection
              ? `Successfully created and inserted a new section.`
              : `Successfully applied ${job.annotationIds.length} annotation(s).`,
            status: "section_complete",
            runtime: "server",
          });
        } catch (err) {
          failed++;
          await finishAssistantMessage(project.slug);
          try { await markFailed(project.path, artifactSlug, job.annotationIds); } catch { /* non-fatal */ }
          await appendRunEvent(project.slug, {
            type: "error",
            title: isAddSection
              ? `New section failed ${progressLabel}`
              : `Section ${progressLabel}: ${job.sectionTitle} failed`,
            text: err instanceof Error ? err.message : `Unknown error processing ${job.sectionId}`,
            status: "section_error",
            runtime: "server",
          });
        }
      }

      // Final summary
      const succeeded = totalCount - failed;
      const message = failed > 0
        ? `Processed ${succeeded} of ${totalCount} section(s) (${failed} failed).`
        : `All ${totalCount} section(s) processed successfully.`;
      const status = failed > 0 ? (succeeded > 0 ? "finished" : "error") : "finished";

      const current = await getRebuildState(project.slug);
      await setRebuildState(project.slug, {
        ...current,
        running: false,
        status,
        finishedAt: new Date().toISOString(),
        message,
        buildQueue: null,
      });

      await appendRunEvent(project.slug, {
        type: status === "finished" ? "system" : "error",
        title: `Batch section regeneration ${status}`,
        text: message,
        status,
        runtime: "server",
      });
    } catch (error) {
      await finishAssistantMessage(project.slug);
      const message = error instanceof Error ? error.message : `Unknown batch regeneration failure.`;
      const current = await getRebuildState(project.slug);
      await setRebuildState(project.slug, {
        ...current,
        running: false,
        status: "error",
        finishedAt: new Date().toISOString(),
        message,
        buildQueue: null,
      });
    } finally {
      activeRebuilds.delete(project.slug);
      releaseProjectAgent();
    }
  }

  /**
   * Wipe the build directory for a fresh agent build while preserving
   * the .versions/ directory through the process. Uses try/finally so
   * restoration happens even if rm/mkdir throw.
   */
  async function wipeBuildDirPreservingVersions(projectPath, artifactSlug) {
    const buildDir = path.join(projectPath, "artifacts/builds", artifactSlug);
    const versionsDir = path.join(buildDir, '.versions');
    const tempVersionsDir = path.join(projectPath, "artifacts/builds", `.versions-temp-${artifactSlug}`);
    let hasVersions = false;
    try {
      await fs.access(versionsDir);
      await fs.rename(versionsDir, tempVersionsDir);
      hasVersions = true;
    } catch { /* no versions dir yet */ }

    try {
      await fs.rm(buildDir, { recursive: true, force: true });
      await fs.mkdir(buildDir, { recursive: true });
    } catch {
      // Directory may not exist yet
    } finally {
      // Always restore .versions/ from temp (even if rm/mkdir failed)
      if (hasVersions) {
        try {
          await fs.mkdir(buildDir, { recursive: true });
          await fs.rename(tempVersionsDir, versionsDir);
        } catch (restoreErr) {
          console.error(`[versions] Failed to restore versions dir: ${restoreErr.message}`);
          try { await fs.rm(tempVersionsDir, { recursive: true, force: true }); } catch { /* best effort */ }
        }
      }
    }
  }

  async function runBatchArtifactBuildJob({ project, apiKey, modelId, jobName, releaseProjectAgent, artifactSlugs }) {
    activeRebuilds.add(project.slug);
    const totalCount = artifactSlugs.length;
    let completed = 0;
    let failed = 0;

    try {
      for (const artifactSlug of artifactSlugs) {
        completed++;
        const progressLabel = `(${completed}/${totalCount})`;

        try {
          // Prepare this artifact's prompt (same as startArtifactBuild)
          const spec = await readArtifactSpec(project.path, artifactSlug);
          const sourceGlobs = Array.isArray(spec.frontmatter.sources) ? spec.frontmatter.sources : [];
          const resolvedSources = await resolveArtifactSources(project.path, sourceGlobs);
          const explicitPaths = resolvedSources.map((s) => s.relativePath);
          const discoveryInventory = await discoverRelevantSources(project.path, explicitPaths);
          await ensureArtifactDirs(project.path);

          const crypto = await import("node:crypto");
          const specHash = crypto.createHash("sha256").update(spec.rawContent).digest("hex");

          // Read pending annotations before wiping the build dir (they live in the build dir)
          let pendingAnnotations = [];
          try {
            pendingAnnotations = await getPendingAnnotations(project.path, artifactSlug);
          } catch { /* non-fatal — no annotations file yet */ }

          // Snapshot the current build before wiping (so user can revert)
          try {
            await createBuildSnapshot(project.path, artifactSlug);
          } catch (snapErr) {
            console.error(`[batch-build] Failed to snapshot before rebuild: ${snapErr.message}`);
          }

          // Delete old build output — preserve .versions/ through the rebuild
          await wipeBuildDirPreservingVersions(project.path, artifactSlug);

          const prompt = await createArtifactPrompt(project, spec, resolvedSources, discoveryInventory, specHash, pendingAnnotations);
          const artifactName = spec.frontmatter.name || artifactSlug;

          await appendRunEvent(project.slug, {
            type: "system",
            title: `Building artifact ${progressLabel}: ${artifactName}`,
            text: `Agent is generating the HTML artifact from research data.`,
            status: "artifact_build",
            runtime: "cursor",
          });

          const stateBeforeBuild = await getRebuildState(project.slug);
          await setRebuildState(project.slug, {
            ...stateBeforeBuild,
            buildPhase: "artifact_build",
            buildPhaseDetail: `Building ${artifactName} ${progressLabel}`,
            message: `Building artifact ${progressLabel}: ${artifactName}`,
          });

          const result = await runSingleAgentPhase({
            project,
            apiKey,
            modelId,
            prompt,
            phaseName: `Artifact: ${artifactName}`,
            signal: undefined,
          });

          if (result.status === "finished") {
            // Stamp contractVersion so section editing works for this artifact
            try { await stampManifestAfterBuild(project.path, artifactSlug); } catch { /* non-fatal */ }
            await appendRunEvent(project.slug, {
              type: "system",
              title: `Artifact ${progressLabel}: ${artifactName} finished`,
              text: `Successfully built ${artifactName}.`,
              status: "artifact_complete",
              runtime: "cursor",
            });
          } else {
            failed++;
            await appendRunEvent(project.slug, {
              type: "error",
              title: `Artifact ${progressLabel}: ${artifactName} failed`,
              text: result.result || `${artifactName} ended with status: ${result.status}`,
              status: "artifact_error",
              runtime: "cursor",
            });
          }
        } catch (err) {
          failed++;
          await finishAssistantMessage(project.slug);
          await appendRunEvent(project.slug, {
            type: "error",
            title: `Artifact ${progressLabel}: ${artifactSlug} failed`,
            text: err instanceof Error ? err.message : `Unknown error building ${artifactSlug}`,
            status: "artifact_error",
            runtime: "cursor",
          });
        }
      }

      // Final summary
      const succeeded = totalCount - failed;
      const message = failed > 0
        ? `Built ${succeeded} of ${totalCount} artifacts (${failed} failed).`
        : `All ${totalCount} artifacts built successfully.`;
      const status = failed > 0 ? (succeeded > 0 ? "finished" : "error") : "finished";

      const current = await getRebuildState(project.slug);
      await setRebuildState(project.slug, {
        ...current,
        running: false,
        status,
        finishedAt: new Date().toISOString(),
        message,
        buildQueue: null,
      });
      await appendRunEvent(project.slug, {
        type: failed > 0 ? "error" : "system",
        title: message,
        text: message,
        status,
        runtime: "cursor",
      });
    } catch (error) {
      await finishAssistantMessage(project.slug);
      const message = error instanceof Error ? error.message : `Unknown batch artifact build failure.`;
      const current = await getRebuildState(project.slug);
      await setRebuildState(project.slug, {
        ...current,
        running: false,
        status: "error",
        finishedAt: new Date().toISOString(),
        message,
        buildQueue: null,
      });
      await appendRunEvent(project.slug, {
        type: "error",
        title: `${jobName} failed`,
        text: message,
        status: "error",
        runtime: "cursor",
      });
    } finally {
      activeRebuilds.delete(project.slug);
      releaseProjectAgent();
    }
  }

  async function startBatchArtifactBuild(project, artifactSlugs, requestedModelId) {
    const pluralLabel = artifactSlugs.length === 1 ? "artifact" : "artifacts";
    return await startAgentJob({
      project,
      requestedModelId,
      runKind: "artifact_batch_build",
      startMessage: `Building ${artifactSlugs.length} ${pluralLabel}.`,
      noApiKeyMessage:
        "No Cursor API key found in CURSOR_API_KEY, web/.env, or OS credential store. Artifact builds are unavailable from the UI.",
      noModelsMessage: "No Cursor models remain after excluding MAX mode models. Add a non-MAX model to your account catalog or relax filters.",
      jobName: `Build ${artifactSlugs.length} ${pluralLabel}`,
      prompt: `Building ${artifactSlugs.length} artifacts sequentially.`,
      jobContext: { artifactSlugs },
    });
  }

  async function startArtifactBuild(project, artifactSlug, requestedModelId) {
    const spec = await readArtifactSpec(project.path, artifactSlug);
    const sourceGlobs = Array.isArray(spec.frontmatter.sources) ? spec.frontmatter.sources : [];
    const resolvedSources = await resolveArtifactSources(project.path, sourceGlobs);
    const explicitPaths = resolvedSources.map((s) => s.relativePath);
    const discoveryInventory = await discoverRelevantSources(project.path, explicitPaths);
    await ensureArtifactDirs(project.path);

    // Compute the spec hash server-side so the agent writes the correct value
    // into the manifest (LLMs unreliably compute SHA-256 themselves).
    const crypto = await import("node:crypto");
    const specHash = crypto.createHash("sha256").update(spec.rawContent).digest("hex");

    // Read pending annotations before wiping the build dir (they live in the build dir)
    let pendingAnnotations = [];
    try {
      pendingAnnotations = await getPendingAnnotations(project.path, artifactSlug);
    } catch { /* non-fatal — no annotations file yet */ }

    // Snapshot the current build before wiping (so user can revert)
    try {
      await createBuildSnapshot(project.path, artifactSlug);
    } catch (snapErr) {
      console.error(`[versions] Failed to snapshot before rebuild: ${snapErr.message}`);
      // Non-fatal — continue with rebuild even if snapshot fails
    }

    // Delete old build output so the agent starts fresh (prevents incremental edits on stale HTML).
    // Preserve .versions/ directory through the rebuild.
    await wipeBuildDirPreservingVersions(project.path, artifactSlug);

    const prompt = await createArtifactPrompt(project, spec, resolvedSources, discoveryInventory, specHash, pendingAnnotations);

    return await startAgentJob({
      project,
      requestedModelId,
      runKind: "artifact_build",
      startMessage: `Building artifact: ${artifactSlug}`,
      noApiKeyMessage:
        "No Cursor API key found in CURSOR_API_KEY, web/.env, or OS credential store. Artifact builds are unavailable from the UI.",
      noModelsMessage: "No Cursor models remain after excluding MAX mode models. Add a non-MAX model to your account catalog or relax filters.",
      jobName: `Artifact: ${artifactSlug}`,
      prompt,
      jobContext: { artifactSlugs: [artifactSlug] },
    });
  }

  async function cancelAgentJob(projectSlug) {
    const controller = activeAbortControllers.get(projectSlug);
    if (!controller) {
      // No live abort controller — if state is stuck on running (orphaned from a crash),
      // force-clear it so the user can retry without restarting the server.
      const state = await getRebuildState(projectSlug);
      if (state.running) {
        const finishedAt = new Date().toISOString();
        const cleared = await setRebuildState(projectSlug, {
          ...state,
          running: false,
          status: "interrupted",
          finishedAt,
          message: "Cleared orphaned running state (no active process found).",
          activeAssistantMessageId: null,
        });
        await appendRunEvent(projectSlug, {
          type: "error",
          title: "Run interrupted (orphan cleared)",
          text: "The previous run was stuck. State has been reset so you can retry.",
          status: "interrupted",
          runtime: "server",
        });
        return cleared;
      }
      return state;
    }

    controller.abort();
    // The abort triggers the catch block in runAgentJob which sets interrupted state.
    // Wait a beat for the state to settle, then return the latest.
    await new Promise((resolve) => setTimeout(resolve, 200));
    return await getRebuildState(projectSlug);
  }

  async function startSectionRegeneration(project, artifactSlug, sectionId, instruction, requestedModelId, elementContext) {
    const spec = await readArtifactSpec(project.path, artifactSlug);
    const html = await readArtifactPreviewHtml(project.path, artifactSlug);

    // Discover all sections for context
    const allSections = discoverSections(html);
    const targetSection = allSections.find(s => s.id === sectionId);
    if (!targetSection) {
      throw httpError(`Section "${sectionId}" not found in artifact "${artifactSlug}".`, 404, 'section_not_found');
    }

    // Extract the current section's inner HTML
    const extracted = extractSection(html, sectionId);
    if (!extracted) {
      throw httpError(`Could not extract section "${sectionId}".`, 500, 'section_extraction_failed');
    }

    // Extract global stylesheet from <head>
    const styleMatch = html.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
    const globalStylesheet = styleMatch ? styleMatch[1] : '';

    // Extract CDN dependencies from <head>
    const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
    const cdnDependencies = [];
    if (headMatch) {
      const headContent = headMatch[1];
      const cdnRegex = /<(?:script|link)\s[^>]*(?:src|href)="(https?:\/\/[^"]+)"[^>]*>/gi;
      let cdnMatch;
      while ((cdnMatch = cdnRegex.exec(headContent)) !== null) {
        cdnDependencies.push(cdnMatch[0]);
      }
    }

    // Build other section summaries (~200 chars each)
    const otherSections = allSections
      .filter(s => s.id !== sectionId)
      .map(s => {
        const sectionContent = html.slice(s.startIdx, s.endIdx);
        // Strip tags for a text-only snippet
        const textOnly = sectionContent.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        return { id: s.id, title: s.title, snippet: textOnly.slice(0, 200) };
      });

    // Resolve source data
    const sourceGlobs = Array.isArray(spec.frontmatter.sources) ? spec.frontmatter.sources : [];
    const resolvedSources = await resolveArtifactSources(project.path, sourceGlobs);

    const prompt = await createSectionRegenerationPrompt({
      project,
      artifactSpec: spec,
      sectionId,
      sectionTitle: targetSection.title,
      currentSectionHTML: extracted.innerHTML,
      globalStylesheet,
      otherSections,
      resolvedSources,
      userInstruction: instruction,
      cdnDependencies,
      elementContext,
    });

    return await startAgentJob({
      project,
      requestedModelId,
      runKind: 'section_regeneration',
      startMessage: `Regenerating section: ${sectionId}`,
      noApiKeyMessage: 'No Cursor API key found. Section regeneration is unavailable from the UI.',
      noModelsMessage: 'No Cursor models available for section regeneration.',
      jobName: `Section: ${sectionId}`,
      prompt,
      jobContext: { artifactSlug, sectionId },
    });
  }

  /**
   * Batch-regenerate multiple sections based on queued annotations.
   * @param {object} project
   * @param {string} artifactSlug
   * @param {Array} sectionGroups - [{ sectionId, annotations[] }]
   * @param {string|null} requestedModelId
   */
  async function startBatchSectionRegeneration(project, artifactSlug, sectionGroups, requestedModelId) {
    const spec = await readArtifactSpec(project.path, artifactSlug);
    const html = await readArtifactPreviewHtml(project.path, artifactSlug);
    const allSections = discoverSections(html);

    // Extract shared context once
    const styleMatch = html.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
    const globalStylesheet = styleMatch ? styleMatch[1] : '';

    const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
    const cdnDependencies = [];
    if (headMatch) {
      const cdnRegex = /<(?:script|link)\s[^>]*(?:src|href)="(https?:\/\/[^"]+)"[^>]*>/gi;
      let cdnMatch;
      while ((cdnMatch = cdnRegex.exec(headMatch[1])) !== null) {
        cdnDependencies.push(cdnMatch[0]);
      }
    }

    const sourceGlobs = Array.isArray(spec.frontmatter.sources) ? spec.frontmatter.sources : [];
    const resolvedSources = await resolveArtifactSources(project.path, sourceGlobs);

    // Build prompts for each section group
    const sectionJobs = [];
    for (const { sectionId, annotations } of sectionGroups) {
      // Handle add_section annotations separately
      const addSectionAnns = annotations.filter(a => a.type === 'add_section');
      const regularAnns = annotations.filter(a => a.type !== 'add_section');

      // Process regular annotations (existing section regeneration)
      if (regularAnns.length > 0) {
        const targetSection = allSections.find(s => s.id === sectionId);
        if (!targetSection) continue;

        const extracted = extractSection(html, sectionId);
        if (!extracted) continue;

        const otherSections = allSections
          .filter(s => s.id !== sectionId)
          .map(s => {
            const sectionContent = html.slice(s.startIdx, s.endIdx);
            const textOnly = sectionContent.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
            return { id: s.id, title: s.title, snippet: textOnly.slice(0, 200) };
          });

        const prompt = await createSectionRegenerationPrompt({
          project,
          artifactSpec: spec,
          sectionId,
          sectionTitle: targetSection.title,
          currentSectionHTML: extracted.innerHTML,
          globalStylesheet,
          otherSections,
          resolvedSources,
          userInstruction: regularAnns[0]?.instruction || '',
          cdnDependencies,
          annotations: regularAnns.map(a => ({ instruction: a.instruction, elementContext: a.elementContext })),
        });

        sectionJobs.push({
          type: 'regenerate',
          sectionId,
          sectionTitle: targetSection.title,
          prompt,
          annotationIds: regularAnns.map(a => a.id),
        });
      }

      // Process add_section annotations (new section creation)
      for (const ann of addSectionAnns) {
        const existingSections = allSections
          .map(s => {
            const sectionContent = html.slice(s.startIdx, s.endIdx);
            const textOnly = sectionContent.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
            return { id: s.id, title: s.title, snippet: textOnly.slice(0, 200) };
          });

        // Extract full HTML of the adjacent section so the agent can avoid duplicating content.
        // If afterSectionId is set, the adjacent section is that one.
        // If null (insert at beginning), the adjacent section is the first one.
        let adjacentSectionHTML = '';
        const adjacentId = ann.afterSectionId || (allSections.length > 0 ? allSections[0].id : null);
        if (adjacentId) {
          const adjSection = allSections.find(s => s.id === adjacentId);
          if (adjSection) {
            adjacentSectionHTML = html.slice(adjSection.startIdx, adjSection.endIdx);
          }
        }

        const prompt = await createAddSectionPrompt({
          project,
          artifactSpec: spec,
          description: ann.instruction,
          afterSectionId: ann.afterSectionId || null,
          globalStylesheet,
          existingSections,
          resolvedSources,
          cdnDependencies,
          adjacentSectionHTML,
        });

        sectionJobs.push({
          type: 'add_section',
          sectionId: '__new_section__',
          sectionTitle: 'New Section',
          afterSectionId: ann.afterSectionId || null,
          prompt,
          annotationIds: [ann.id],
        });
      }
    }

    if (sectionJobs.length === 0) {
      throw httpError('No valid sections found for the queued annotations.', 422, 'no_valid_sections');
    }

    return await startAgentJob({
      project,
      requestedModelId,
      runKind: 'batch_section_regeneration',
      startMessage: `Batch regenerating ${sectionJobs.length} section(s) of ${artifactSlug}`,
      noApiKeyMessage: 'No Cursor API key found. Batch section regeneration is unavailable.',
      noModelsMessage: 'No Cursor models available for batch section regeneration.',
      jobName: `Batch Sections: ${artifactSlug}`,
      prompt: sectionJobs[0].prompt, // first prompt — rest handled in the job runner
      jobContext: { artifactSlug, sectionJobs },
    });
  }

  return {
    cancelAgentJob,
    startArtifactBuild,
    startBatchSectionRegeneration,
    startFullRebuild,
    startHumanAttentionResolution,
    startKnowledgeBuild,
    startOutputBuild,
    startRebuild, // deprecated alias for startKnowledgeBuild
    startSectionRegeneration,
  };
}
