import fs from "node:fs/promises";
import path from "node:path";
import { parseResearchPlan, executeResearchPlan, generateSourceDigests } from "./webResearch.js";
import { computeBuildScope } from "./buildScope.js";
import { buildSourceMapping, writeSourceMapping } from "./sourceMapping.js";
import { extractAllBuildQuestions, readQuestions } from "./questionsService.js";
import { createPromptBuilders } from "./promptBuilders.js";
import { readArtifactSpec, resolveArtifactSources, ensureArtifactDirs, listArtifactSpecs } from "./artifactService.js";

import { readTopics, getDeepenQueue, clearDeepenQueue } from "./topicsService.js";

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

  const {
    createArtifactPrompt,
    createAutoAnswerPrompt,
    createBatchDeepenResearchPrompt,
    createBatchDeepenSynthesisPrompt,
    createFilePrompt,
    createResearchPrompt,
    createSynthesisPrompt,
    createValidationPrompt,
    createWikiOnlyPrompt,
  } = createPromptBuilders(FRAMEWORK_ROOT);

  async function appendRunLog(projectSlug, message) {
    await appendRunEvent(projectSlug, {
      type: "system",
      title: message,
      text: message,
      runtime: "cursor",
    });
  }

  const MAX_FILE_CONCURRENCY = 3;

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

        await appendRunEvent(project.slug, {
          type: "system",
          title: `Phase 3b: Building ${outputFile}`,
          text: `Synthesizing directed output with ${sourceMap[outputFile]?.wikiPages?.length || 0} wiki pages, ${sourceMap[outputFile]?.sourceFiles?.length || 0} full sources, ${sourceMap[outputFile]?.digestFiles?.length || 0} digests.`,
          status: "file_synthesis",
          runtime: "cursor",
          metadata: { outputFile, phase: "3b" },
        });

        const result = await runSingleAgentPhase({
          project,
          apiKey,
          modelId,
          prompt: filePrompt,
          phaseName: `File: ${outputFile}`,
        });

        completed++;

        await appendRunEvent(project.slug, {
          type: "system",
          title: `Phase 3b: ${outputFile} complete (${completed}/${outputFiles.length})`,
          text: result.status === "finished" ? `Successfully built ${outputFile}` : `${outputFile} ended with status: ${result.status}`,
          status: result.status === "finished" ? "file_complete" : "file_error",
          runtime: "cursor",
          metadata: { outputFile, completed, total: outputFiles.length, phase: "3b" },
        });

        return { file: outputFile, result };
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
    deepenContext = null,
    startMessage,
    noApiKeyMessage,
    noModelsMessage,
    jobName,
    prompt,
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
      deepenContext,
      startMessage,
      noApiKeyMessage,
      noModelsMessage,
      jobName,
      prompt,
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
    deepenContext,
    startMessage,
    noApiKeyMessage,
    noModelsMessage,
    jobName,
    prompt,
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
      });

      await appendRunLog(project.slug, `Using Cursor API key from ${cursorApiKey.source}.`);
      await appendRunLog(project.slug, `Using Cursor model: ${modelId}.`);

      runAgentJob({ project, apiKey: cursorApiKey.apiKey, modelId, prompt, jobName, runKind, deepenContext, releaseProjectAgent }).catch((error) => {
        void (async () => {
          const current = await getRebuildState(project.slug);
          await setRebuildState(project.slug, {
            ...current,
            running: false,
            status: "error",
            finishedAt: new Date().toISOString(),
            message: error instanceof Error ? error.message : `Unknown ${jobName.toLowerCase()} error.`,
          });
          await appendRunLog(project.slug, (await getRebuildState(project.slug)).message);
        })();
      });

      return await getRebuildState(project.slug);
    } catch (error) {
      releaseProjectAgent();
      throw error;
    }
  }

  async function startRebuild(project, requestedModelId) {
    return await startAgentJob({
      project,
      requestedModelId,
      runKind: "rebuild",
      startMessage: "Starting multi-phase research build (research → fetch → wiki → per-file outputs → validation).",
      noApiKeyMessage:
        "No Cursor API key found in CURSOR_API_KEY, web/.env, or macOS Keychain item cursor_api_key. Rebuilds are unavailable from the UI.",
      noModelsMessage: "No Cursor models remain after excluding MAX mode models. Add a non-MAX model to your account catalog or relax filters.",
      jobName: "Rebuild run",
      prompt: createResearchPrompt(project),
    });
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
        "No Cursor API key found in CURSOR_API_KEY, web/.env, or macOS Keychain item cursor_api_key. Human-attention resolution is unavailable from the UI.",
      noModelsMessage: "No Cursor models remain after excluding MAX mode models. Add a non-MAX model to your account catalog or relax filters.",
      jobName: "Human-attention resolution",
      prompt,
    });
  }

  async function startBatchDeepen(project, requestedModelId) {
    const queue = await getDeepenQueue(project.path);

    if (queue.length === 0) {
      throw httpError("No topics queued for deepening. Queue topics first.", 400, "empty_deepen_queue");
    }

    // Validate all queued topics
    for (const topic of queue) {
      if (topic.state === "deprecated") {
        throw httpError(`Topic '${topic.id}' is deprecated and cannot be deepened.`, 400, "topic_deprecated");
      }
      if (topic.disposition === "parked" || topic.disposition === "settled") {
        throw httpError(`Topic '${topic.id}' is ${topic.disposition}. Resume it first.`, 400, "topic_disposition_blocks");
      }
      if (topic.state === "seed") {
        throw httpError(`Topic '${topic.id}' is a seed. Accept it first.`, 400, "topic_is_seed");
      }
    }

    const topicLabels = queue.map((t) => t.label).join(", ");

    return await startAgentJob({
      project,
      requestedModelId,
      runKind: "batch_deepen",
      deepenContext: queue,
      startMessage: `Deepening ${queue.length} topic(s): ${topicLabels}`,
      noApiKeyMessage:
        "No Cursor API key found in CURSOR_API_KEY, web/.env, or macOS Keychain item cursor_api_key. Topic deepening is unavailable from the UI.",
      noModelsMessage: "No Cursor models remain after excluding MAX mode models. Add a non-MAX model to your account catalog or relax filters.",
      jobName: `Deepen (${queue.length} topics)`,
      prompt: createBatchDeepenResearchPrompt(project, queue),
    });
  }

  async function runSingleAgentPhase({ project, apiKey, modelId, prompt, phaseName }) {
    const result = await runCursorAgent({
      project,
      apiKey,
      modelId,
      prompt,
      onEvent: async (event) => {
        if (event.type === "assistant_delta") {
          await appendAssistantDelta(project.slug, event.text, event.metadata);
          return;
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

  async function runAgentJob({ project, apiKey, modelId, prompt, jobName, runKind, deepenContext, releaseProjectAgent }) {
    // Batch deepen jobs get their own pipeline
    if (runKind === "batch_deepen" && Array.isArray(deepenContext)) {
      return await runBatchDeepenJob({ project, apiKey, modelId, prompt, jobName, topics: deepenContext, releaseProjectAgent });
    }

    // Artifact builds get their own simple pipeline
    if (runKind === "artifact_build") {
      return await runArtifactBuildJob({ project, apiKey, modelId, prompt, jobName, releaseProjectAgent });
    }

    activeRebuilds.add(project.slug);
    const buildStartTime = Date.now();

    try {
      // ── Compute build scope ──
      const scope = await computeBuildScope(project.path);

      await appendRunEvent(project.slug, {
        type: "system",
        title: scope.isFirstBuild
          ? "Build scope: first build (full)"
          : scope.sourcesChanged
            ? "Build scope: sources changed"
            : scope.projectMdChanged
              ? "Build scope: project.md changed"
              : scope.feedbackMarkers.length > 0
                ? `Build scope: ${scope.feedbackMarkers.length} FEEDBACK marker(s)`
                : "Build scope: no changes detected",
        text: scope.isFirstBuild
          ? "No previous build manifest found. Running full build."
          : scope.sourcesChanged
            ? `Source inventory changed (${scope.sourceCount} sources). All wiki pages and directed outputs will be regenerated.`
            : scope.projectMdChanged
              ? `project.md hash changed. Affected outputs: ${scope.affectedOutputs.length > 0 ? scope.affectedOutputs.join(", ") : "all directed outputs"}.`
              : scope.feedbackMarkers.length > 0
                ? `FEEDBACK markers in: ${scope.feedbackMarkers.join(", ")}`
                : "No changes detected. Refreshing dated reports only.",
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
        await appendRunEvent(project.slug, {
          type: "system",
          title: "Phase 1: Skipped (no project changes)",
          text: "project.md unchanged, no FEEDBACK markers, no new inputs. Keeping existing research plan.",
          status: "research_plan_skipped",
          runtime: "server",
        });
      } else {
        await appendRunEvent(project.slug, {
          type: "system",
          title: "Phase 1: Generating research plan",
          text: scope.isFirstBuild
            ? "Agent is searching the web and producing a research plan."
            : "Agent is updating the research plan based on project changes.",
          status: "research_plan",
          runtime: "cursor",
        });

        const researchResult = await runSingleAgentPhase({
          project,
          apiKey,
          modelId,
          prompt, // This is the research prompt
          phaseName: "Research Plan",
        });

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

      let fetchResults;
      try {
        const plan = await parseResearchPlan(project.path);
        const totalUrls = plan.queries.reduce((sum, q) => sum + q.urls.length, 0);

        await appendRunEvent(project.slug, {
          type: "system",
          title: `Fetching ${totalUrls} URLs`,
          text: `Research plan contains ${plan.queries.length} topics with ${totalUrls} URLs to fetch.`,
          status: "fetching_sources",
          runtime: "server",
        });

        let lastReportedPercent = -1;
        const failedUrls = [];

        fetchResults = await executeResearchPlan(project.path, plan, async (progress) => {
          // Track failed URLs for the completion summary
          if (progress.lastStatus === "failed") {
            failedUrls.push(progress.lastUrl);
          }

          // Only emit at 10% thresholds
          const percent = Math.floor((progress.completed / progress.total) * 10) * 10;
          if (percent <= lastReportedPercent) return;
          lastReportedPercent = percent;

          await appendRunEvent(project.slug, {
            type: "system",
            title: `Fetching sources... ${progress.completed}/${progress.total} (${percent}%)`,
            text: `Processing research plan URLs.`,
            status: "fetching_sources",
            runtime: "server",
          });
        });

        const failedDetail = failedUrls.length > 0
          ? ` Failed: ${failedUrls.map((u) => new URL(u).hostname).join(", ")}`
          : "";

        await appendRunEvent(project.slug, {
          type: "system",
          title: `Fetch complete: ${fetchResults.fetched} new, ${fetchResults.skipped} cached, ${fetchResults.failed} failed`,
          text: `Server-side fetch finished. ${fetchResults.fetched} newly fetched, ${fetchResults.skipped} skipped (already current), ${fetchResults.failed} failed.${failedDetail}`,
          status: "fetch_complete",
          runtime: "server",
        });
      } catch (fetchError) {
        // If research_plan.json doesn't exist or is malformed, log and continue
        // The synthesis agent will work with whatever sources exist
        const errorMsg = fetchError instanceof Error ? fetchError.message : "Unknown fetch error";
        await appendRunEvent(project.slug, {
          type: "system",
          title: "Phase 2: Fetch skipped or failed",
          text: `Server-side fetch could not run: ${errorMsg}. The synthesis agent will proceed with any existing sources.`,
          status: "fetch_skipped",
          runtime: "server",
        });
        fetchResults = { fetched: 0, failed: 0, skipped: 0, total: 0 };
      }

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

      try {
        let lastDigestPercent = -1;
        let digestGenerated = 0;
        let digestCached = 0;

        const digestResults = await generateSourceDigests(project.path, async (progress) => {
          // Track generated vs cached from the progress status
          if (progress.lastStatus === "generated") digestGenerated++;
          else digestCached++;

          // Only emit at 10% thresholds
          const percent = Math.floor((progress.completed / progress.total) * 10) * 10;
          if (percent <= lastDigestPercent) return;
          lastDigestPercent = percent;

          await appendRunEvent(project.slug, {
            type: "system",
            title: `Digesting sources... ${progress.completed}/${progress.total} (${digestGenerated} generated, ${digestCached} cached)`,
            text: `Processing source digests (${percent}% complete).`,
            status: "generating_digests",
            runtime: "server",
          });
        });

        await appendRunEvent(project.slug, {
          type: "system",
          title: `Digests complete: ${digestResults.generated} generated, ${digestResults.skipped} cached`,
          text: `Source digests ready in sources/digests/. ${digestResults.generated} newly generated, ${digestResults.skipped} already current.`,
          status: "digests_complete",
          runtime: "server",
        });
      } catch (digestError) {
        const errorMsg = digestError instanceof Error ? digestError.message : "Unknown digest error";
        await appendRunEvent(project.slug, {
          type: "system",
          title: "Digest generation skipped",
          text: `Could not generate source digests: ${errorMsg}. The synthesis agent will read full sources.`,
          status: "digests_skipped",
          runtime: "server",
        });
      }

      // ── Phase 3a: Wiki Synthesis (agent builds wiki pages only) ──
      await appendRunEvent(project.slug, {
        type: "system",
        title: "Phase 3a: Building wiki pages",
        text: "Agent is synthesizing wiki pages from source digests. Directed outputs will be built in a separate focused pass.",
        status: "wiki_synthesis",
        runtime: "cursor",
        metadata: { phase: "3a" },
      });

      // Update rebuild state with phase tracking
      const stateBeforeWiki = await getRebuildState(project.slug);
      await setRebuildState(project.slug, {
        ...stateBeforeWiki,
        buildPhase: "wiki",
        buildPhaseDetail: "Building wiki pages from source digests",
      });

      const wikiPrompt = createWikiOnlyPrompt(project, scope);
      const wikiResult = await runSingleAgentPhase({
        project,
        apiKey,
        modelId,
        prompt: wikiPrompt,
        phaseName: "Wiki Synthesis",
      });

      if (wikiResult.status !== "finished") {
        throw new Error(`Wiki synthesis phase failed: ${wikiResult.result || "unknown error"}`);
      }

      // ── Phase 3b: Per-File Strategy Synthesis ──
      await appendRunEvent(project.slug, {
        type: "system",
        title: "Phase 3b: Building source mapping",
        text: "Server is mapping sources to directed outputs for focused synthesis.",
        status: "source_mapping",
        runtime: "server",
        metadata: { phase: "3b" },
      });

      const { mapping: sourceMap, discoverySource } = await buildSourceMapping(project.path);
      await writeSourceMapping(project.path, sourceMap);
      const outputFileCount = Object.keys(sourceMap).length;

      const discoveryLabel = discoverySource === "manifest" ? "manifest" : discoverySource === "topics" ? "topics.json" : "disk scan";
      await appendRunEvent(project.slug, {
        type: "system",
        title: `Phase 3b: Discovered ${outputFileCount} directed output(s) via ${discoveryLabel}`,
        text: outputFileCount > 0
          ? `Outputs: ${Object.keys(sourceMap).join(", ")}`
          : "No directed outputs found. Skipping per-file synthesis.",
        status: outputFileCount > 0 ? "source_mapping_complete" : "source_mapping_empty",
        runtime: "server",
        metadata: { phase: "3b", outputFileCount, discoverySource },
      });

      if (outputFileCount > 0) {
        const stateBeforeFiles = await getRebuildState(project.slug);
        await setRebuildState(project.slug, {
          ...stateBeforeFiles,
          buildPhase: "directed_outputs",
          buildPhaseDetail: `Building ${outputFileCount} directed outputs (max ${MAX_FILE_CONCURRENCY} concurrent)`,
        });

        await appendRunEvent(project.slug, {
          type: "system",
          title: `Phase 3b: Building ${outputFileCount} directed outputs`,
          text: `Each output file gets its own agent call with focused context (wiki pages + full source files). Max ${MAX_FILE_CONCURRENCY} concurrent.`,
          status: "file_synthesis_start",
          runtime: "server",
          metadata: { outputFileCount, phase: "3b" },
        });

        const fileResults = await runFileSynthesisPhase({
          project,
          apiKey,
          modelId,
          sourceMap,
        });

        const succeededFiles = fileResults.filter((r) => r.result.status === "finished").length;
        const failedFiles = fileResults.filter((r) => r.result.status !== "finished").length;

        await appendRunEvent(project.slug, {
          type: "system",
          title: `Phase 3b complete: ${succeededFiles} succeeded, ${failedFiles} failed`,
          text: failedFiles > 0
            ? `Failed files: ${fileResults.filter((r) => r.result.status !== "finished").map((r) => r.file).join(", ")}`
            : `All ${succeededFiles} directed outputs built successfully.`,
          status: failedFiles > 0 ? "file_synthesis_partial" : "file_synthesis_complete",
          runtime: "server",
          metadata: { succeededFiles, failedFiles, phase: "3b" },
        });
      }

      // ── Phase 3b.5: Extract BUILD_QUESTION markers from output files ──
      let rawBuildQuestions = [];
      try {
        const outputFiles = Object.keys(sourceMap);
        rawBuildQuestions = await extractAllBuildQuestions(project.path, outputFiles, {
          phase: "3b",
          buildId: (await getRebuildState(project.slug))?.runId?.slice(0, 8) || null,
          modelId,
        });

        if (rawBuildQuestions.length > 0) {
          await appendRunEvent(project.slug, {
            type: "system",
            title: `Extracted ${rawBuildQuestions.length} question(s) from output files`,
            text: `Raw questions will be consolidated during validation.`,
            status: "questions_extracted",
            runtime: "server",
            metadata: { phase: "3b.5", questionCount: rawBuildQuestions.length },
          });
        }
      } catch (extractError) {
        // Non-fatal — continue without questions
        console.error("Question extraction failed:", extractError);
      }



      // ── Phase 3c: Validation Pass ──
      const stateBeforeValidation = await getRebuildState(project.slug);
      await setRebuildState(project.slug, {
        ...stateBeforeValidation,
        buildPhase: "validation",
        buildPhaseDetail: "Validating outputs, acting on gaps, recording snapshot",
      });

      await appendRunEvent(project.slug, {
        type: "system",
        title: "Phase 3c: Validating and recording",
        text: "Agent is validating outputs, acting on gaps, updating manifest, and creating git snapshot.",
        status: "validation",
        runtime: "cursor",
        metadata: { phase: "3c" },
      });

      const validationPrompt = createValidationPrompt(project, modelId, rawBuildQuestions);
      const synthesisResult = await runSingleAgentPhase({
        project,
        apiKey,
        modelId,
        prompt: validationPrompt,
        phaseName: "Validation",
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
          await runSingleAgentPhase({
            project,
            apiKey,
            modelId,
            prompt: autoAnswerPrompt,
            phaseName: "Auto-Answer Questions",
          });

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

      // ── Phase 4: Drain Deepen Queue (if any topics are queued) ──
      const deepenQueue = await getDeepenQueue(project.path);
      if (deepenQueue.length > 0) {
        const dqLabels = deepenQueue.map((t) => t.label);

        await appendRunEvent(project.slug, {
          type: "system",
          title: `Phase 4: Deepening ${deepenQueue.length} queued topic(s)`,
          text: `Full build will now deepen: ${dqLabels.join(", ")}`,
          status: "deepen_research",
          runtime: "server",
          metadata: { topicIds: deepenQueue.map((t) => t.id), topicLabels: dqLabels },
        });

        // Phase 4a: Deepen Research
        const stateBeforeDeepenResearch = await getRebuildState(project.slug);
        await setRebuildState(project.slug, {
          ...stateBeforeDeepenResearch,
          buildPhase: "deepen_research",
          buildPhaseDetail: `Researching deeper evidence for ${deepenQueue.length} topic(s)`,
        });

        const deepenResearchPrompt = createBatchDeepenResearchPrompt(project, deepenQueue);
        const deepenResearchResult = await runSingleAgentPhase({
          project, apiKey, modelId,
          prompt: deepenResearchPrompt,
          phaseName: `Build Deepen Research (${deepenQueue.length} topics)`,
        });

        if (deepenResearchResult.status === "finished") {
          // Phase 4b: Fetch
          const stateBeforeDeepenFetch = await getRebuildState(project.slug);
          await setRebuildState(project.slug, {
            ...stateBeforeDeepenFetch,
            buildPhase: "deepen_fetching",
            buildPhaseDetail: `Fetching deepen sources for ${deepenQueue.length} topic(s)`,
          });

          try {
            const deepenPlan = await parseResearchPlan(project.path);
            await executeResearchPlan(project.path, deepenPlan, async () => {});
          } catch { /* non-fatal */ }

          // Phase 4c: Digests
          try {
            await generateSourceDigests(project.path, async () => {});
          } catch { /* non-fatal */ }

          // Phase 4d: Synthesis
          const stateBeforeDeepenSynthesis = await getRebuildState(project.slug);
          await setRebuildState(project.slug, {
            ...stateBeforeDeepenSynthesis,
            buildPhase: "deepen_synthesis",
            buildPhaseDetail: `Synthesizing deeper evidence for ${deepenQueue.length} topic(s)`,
          });

          const deepenSynthesisPrompt = createBatchDeepenSynthesisPrompt(project, deepenQueue);
          await runSingleAgentPhase({
            project, apiKey, modelId,
            prompt: deepenSynthesisPrompt,
            phaseName: `Build Deepen Synthesis (${deepenQueue.length} topics)`,
          });
        }

        // Clear the queue regardless of success
        await clearDeepenQueue(project.path);

        await appendRunEvent(project.slug, {
          type: "system",
          title: `Deepen queue cleared (${deepenQueue.length} topic(s) processed)`,
          text: dqLabels.join(", "),
          status: "deepen_complete",
          runtime: "server",
        });
      }

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
        },
      });
    } catch (error) {
      await finishAssistantMessage(project.slug);
      const message = error instanceof Error ? error.message : `Unknown Cursor SDK ${jobName.toLowerCase()} failure.`;

      const current = await getRebuildState(project.slug);
      await setRebuildState(project.slug, {
        ...current,
        running: false,
        status: "error",
        finishedAt: new Date().toISOString(),
        message,
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

  async function runBatchDeepenJob({ project, apiKey, modelId, prompt, jobName, topics, releaseProjectAgent }) {
    activeRebuilds.add(project.slug);
    const buildStartTime = Date.now();
    const topicLabels = topics.map((t) => t.label);

    try {
      // ── Emit batch start ──
      await appendRunEvent(project.slug, {
        type: "system",
        title: `Batch deepening ${topics.length} topic(s)`,
        text: topicLabels.join(", "),
        status: "batch_deepen_start",
        runtime: "server",
        metadata: { topicIds: topics.map((t) => t.id), topicLabels },
      });

      // ── Phase 1: Batch Research (agent searches web for ALL topics) ──
      const stateBeforeResearch = await getRebuildState(project.slug);
      await setRebuildState(project.slug, {
        ...stateBeforeResearch,
        buildPhase: "deepen_research",
        buildPhaseDetail: `Researching deeper evidence for ${topics.length} topic(s)`,
      });

      await appendRunEvent(project.slug, {
        type: "system",
        title: `Deepen Phase 1: Researching ${topics.length} topic(s)`,
        text: `Agent is searching the web for deeper evidence. Topics: ${topicLabels.join(", ")}`,
        status: "deepen_research",
        runtime: "cursor",
      });

      const researchResult = await runSingleAgentPhase({
        project,
        apiKey,
        modelId,
        prompt,
        phaseName: `Batch Deepen Research (${topics.length} topics)`,
      });

      if (researchResult.status !== "finished") {
        throw new Error(`Deepen research phase failed: ${researchResult.result || "unknown error"}`);
      }

      // ── Phase 2: Server-Side Fetch ──
      const stateBeforeFetch = await getRebuildState(project.slug);
      await setRebuildState(project.slug, {
        ...stateBeforeFetch,
        buildPhase: "deepen_fetching",
        buildPhaseDetail: `Fetching new sources for ${topics.length} topic(s)`,
      });

      await appendRunEvent(project.slug, {
        type: "system",
        title: "Deepen Phase 2: Fetching sources",
        text: "Server is fetching and extracting content from URLs in the research plan.",
        status: "fetching_sources",
        runtime: "server",
      });

      let fetchResults;
      try {
        const plan = await parseResearchPlan(project.path);
        const totalUrls = plan.queries.reduce((sum, q) => sum + q.urls.length, 0);

        await appendRunEvent(project.slug, {
          type: "system",
          title: `Fetching ${totalUrls} URLs`,
          text: `Research plan contains ${plan.queries.length} topic(s) with ${totalUrls} URLs to fetch.`,
          status: "fetching_sources",
          runtime: "server",
        });

        let lastReportedPercent = -1;
        fetchResults = await executeResearchPlan(project.path, plan, async (progress) => {
          const percent = Math.floor((progress.completed / progress.total) * 10) * 10;
          if (percent <= lastReportedPercent) return;
          lastReportedPercent = percent;

          await appendRunEvent(project.slug, {
            type: "system",
            title: `Fetching sources... ${progress.completed}/${progress.total} (${percent}%)`,
            text: "Processing research plan URLs.",
            status: "fetching_sources",
            runtime: "server",
          });
        });

        await appendRunEvent(project.slug, {
          type: "system",
          title: `Fetch complete: ${fetchResults.fetched} new, ${fetchResults.skipped} cached, ${fetchResults.failed} failed`,
          text: `Server-side fetch finished for batch deepen pass.`,
          status: "fetch_complete",
          runtime: "server",
        });
      } catch (fetchError) {
        const errorMsg = fetchError instanceof Error ? fetchError.message : "Unknown fetch error";
        await appendRunEvent(project.slug, {
          type: "system",
          title: "Deepen Phase 2: Fetch skipped or failed",
          text: `Server-side fetch could not run: ${errorMsg}. The synthesis agent will proceed with any existing sources.`,
          status: "fetch_skipped",
          runtime: "server",
        });
        fetchResults = { fetched: 0, failed: 0, skipped: 0, total: 0 };
      }

      // ── Phase 2.5: Generate Source Digests ──
      const stateBeforeDigests = await getRebuildState(project.slug);
      await setRebuildState(project.slug, {
        ...stateBeforeDigests,
        buildPhase: "deepen_digests",
        buildPhaseDetail: `Generating digests for ${topics.length} topic(s)`,
      });

      try {
        const digestResults = await generateSourceDigests(project.path, async () => {});
        await appendRunEvent(project.slug, {
          type: "system",
          title: `Digests complete: ${digestResults.generated} generated, ${digestResults.skipped} cached`,
          text: `Source digests ready for batch deepen synthesis.`,
          status: "digests_complete",
          runtime: "server",
        });
      } catch (digestError) {
        const errorMsg = digestError instanceof Error ? digestError.message : "Unknown digest error";
        await appendRunEvent(project.slug, {
          type: "system",
          title: "Digest generation skipped",
          text: `Could not generate source digests: ${errorMsg}.`,
          status: "digests_skipped",
          runtime: "server",
        });
      }

      // ── Phase 3: Batch Synthesis (agent updates ALL topics' wiki pages + outputs) ──
      const stateBeforeSynthesis = await getRebuildState(project.slug);
      await setRebuildState(project.slug, {
        ...stateBeforeSynthesis,
        buildPhase: "deepen_synthesis",
        buildPhaseDetail: `Synthesizing deeper evidence for ${topics.length} topic(s)`,
      });

      await appendRunEvent(project.slug, {
        type: "system",
        title: `Deepen Phase 3: Synthesizing ${topics.length} topic(s)`,
        text: `Agent is updating wiki pages and related outputs for: ${topicLabels.join(", ")}`,
        status: "deepen_synthesis",
        runtime: "cursor",
      });

      const synthesisPrompt = createBatchDeepenSynthesisPrompt(project, topics);
      const synthesisResult = await runSingleAgentPhase({
        project,
        apiKey,
        modelId,
        prompt: synthesisPrompt,
        phaseName: `Batch Deepen Synthesis (${topics.length} topics)`,
      });

      // ── Clear the deepen queue ──
      await clearDeepenQueue(project.path);

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
        title: synthesisResult.status === "finished" ? `${jobName} finished (${buildDurationSeconds}s)` : `${jobName} stopped before finishing`,
        text: message,
        status,
        runtime: "cursor",
        metadata: {
          resultStatus: synthesisResult.status,
          attentionCount,
          fetchResults,
          buildDurationSeconds,
          modelId,
          topicIds: topics.map((t) => t.id),
          topicCount: topics.length,
        },
      });
    } catch (error) {
      await finishAssistantMessage(project.slug);
      const message = error instanceof Error ? error.message : `Unknown batch deepen failure.`;

      // Clear queue even on failure so user doesn't get stuck
      await clearDeepenQueue(project.path).catch(() => {});

      const current = await getRebuildState(project.slug);
      await setRebuildState(project.slug, {
        ...current,
        running: false,
        status: "error",
        finishedAt: new Date().toISOString(),
        message,
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

  async function runArtifactBuildJob({ project, apiKey, modelId, prompt, jobName, releaseProjectAgent }) {
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
      });

      const buildCompletion = createAgentJobCompletionMessage(jobName);
      const { message, status } = await buildCompletion({ project, result });

      const current = await getRebuildState(project.slug);
      await setRebuildState(project.slug, {
        ...current,
        running: false,
        status,
        finishedAt: new Date().toISOString(),
        message,
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

  async function startArtifactBuild(project, artifactSlug, requestedModelId) {
    const spec = await readArtifactSpec(project.path, artifactSlug);
    const sourceGlobs = spec.frontmatter.sources?.length ? spec.frontmatter.sources : ["all"];
    const resolvedSources = await resolveArtifactSources(project.path, sourceGlobs);
    await ensureArtifactDirs(project.path);

    // Delete old build output so the agent starts fresh (prevents incremental edits on stale HTML)
    const buildDir = path.join(project.path, "artifacts/builds", artifactSlug);
    try {
      await fs.rm(buildDir, { recursive: true, force: true });
      await fs.mkdir(buildDir, { recursive: true });
    } catch {
      // Ignore — directory may not exist yet
    }

    const prompt = await createArtifactPrompt(project, spec, resolvedSources);

    return await startAgentJob({
      project,
      requestedModelId,
      runKind: "artifact_build",
      startMessage: `Building artifact: ${spec.frontmatter.name || artifactSlug}`,
      noApiKeyMessage:
        "No Cursor API key found in CURSOR_API_KEY, web/.env, or macOS Keychain item cursor_api_key. Artifact builds are unavailable from the UI.",
      noModelsMessage: "No Cursor models remain after excluding MAX mode models. Add a non-MAX model to your account catalog or relax filters.",
      jobName: `Artifact: ${spec.frontmatter.name || artifactSlug}`,
      prompt,
    });
  }

  return { startArtifactBuild, startBatchDeepen, startHumanAttentionResolution, startRebuild };
}

