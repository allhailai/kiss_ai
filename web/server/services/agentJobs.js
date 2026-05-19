import fs from "node:fs/promises";
import path from "node:path";
import { parseResearchPlan, executeResearchPlan, generateSourceDigests } from "./webResearch.js";
import { computeBuildScope } from "./buildScope.js";
import { buildSourceMapping, writeSourceMapping } from "./sourceMapping.js";

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

  async function appendRunLog(projectSlug, message) {
    await appendRunEvent(projectSlug, {
      type: "system",
      title: message,
      text: message,
      runtime: "cursor",
    });
  }

  function createResearchPrompt(project) {
    return [
      "Generate a research plan for this kiss_ai project.",
      "",
      `Follow ${path.join(FRAMEWORK_ROOT, "commands/do_build_research.md")} exactly.`,
      "This is a non-interactive web-triggered research run. Never ask the user for confirmation or wait for input mid-run.",
      `Use ${FRAMEWORK_ROOT} as the canonical framework root.`,
      "Do not create or depend on a project-local framework/ folder.",
      "Do not operate outside this project root.",
      `Project root: ${project.path}`,
    ].join("\n");
  }

  function createSynthesisPrompt(project, scope) {
    const lines = [
      "Run the kiss_ai build for this project.",
      "",
      `Follow ${path.join(FRAMEWORK_ROOT, "commands/do_build.md")} exactly.`,
      "This is a non-interactive web-triggered build. Never ask the user for confirmation or wait for input mid-run.",
      "When a decision is needed, choose the conservative default, leave an AI_SUGGESTION marker in the relevant output file, and continue.",
      `Use ${FRAMEWORK_ROOT} as the canonical framework root.`,
      "Do not create or depend on a project-local framework/ folder.",
      "Do not operate outside this project root.",
      `Project root: ${project.path}`,
      "",
      "IMPORTANT: Source files have already been fetched and written to sources/web_research/ by the build pipeline.",
      "Source digests have been generated in sources/digests/ — these are compact key-claim summaries (~200 words each).",
      "Do NOT search the web. Use only the pre-fetched sources.",
      "Read sources/digests/ FIRST to understand the evidence landscape.",
      "Read full source files from sources/web_research/ ONLY when actively writing a specific wiki page or directed output that needs detailed evidence from that source.",
      "Read sources/source_log.md for the full inventory of what was fetched.",
    ];

    if (scope && !scope.isFirstBuild) {
      lines.push("");

      if (scope.projectMdChanged && scope.projectMdDiff) {
        lines.push(
          "BUILD SCOPE: project.md changed. Here is the diff:",
          "```diff",
          scope.projectMdDiff.slice(0, 3000),
          "```",
          "",
          "Update only the outputs affected by this change.",
          "Do not regenerate unchanged wiki pages or outputs.",
        );

        if (scope.affectedOutputs.length > 0) {
          lines.push(`Affected outputs: ${scope.affectedOutputs.join(", ")}`);
        }
      } else if (scope.sourcesChanged) {
        lines.push(
          `BUILD SCOPE: Source inventory changed. ${scope.sourceCount} sources now available (previously ${scope.affectedOutputs.length} outputs depend on these sources).`,
          "New or updated source files have been fetched since the last build.",
          "Regenerate all wiki pages and directed outputs using the enriched source base.",
          "Read all source digests in sources/digests/ to incorporate newly available evidence.",
        );

        if (scope.affectedOutputs.length > 0) {
          lines.push(`Affected outputs: ${scope.affectedOutputs.join(", ")}`);
        }
      } else if (!scope.projectMdChanged) {
        lines.push(
          "BUILD SCOPE: project.md has NOT changed since last build.",
          "Only process FEEDBACK markers, accepted AI_SUGGESTION markers, and refresh dated reports.",
          "Do not regenerate wiki pages or directed outputs that have no pending markers.",
        );
      }

      if (scope.feedbackMarkers.length > 0) {
        lines.push("", `FEEDBACK markers found in: ${scope.feedbackMarkers.join(", ")}`, "Apply feedback to these files and their downstream dependents only.");
      }

      if (scope.acceptedSuggestions.length > 0) {
        lines.push("", `Accepted AI_SUGGESTION markers in: ${scope.acceptedSuggestions.join(", ")}`, "Execute these accepted suggestions.");
      }
    }

    return lines.join("\n");
  }

  function createWikiOnlyPrompt(project, scope) {
    const lines = [
      "Run the kiss_ai wiki build for this project.",
      "",
      `Follow ${path.join(FRAMEWORK_ROOT, "commands/do_build.md")} exactly.`,
      "This is a non-interactive web-triggered build. Never ask the user for confirmation or wait for input mid-run.",
      "When a decision is needed, choose the conservative default, leave an AI_SUGGESTION marker in the relevant output file, and continue.",
      `Use ${FRAMEWORK_ROOT} as the canonical framework root.`,
      "Do not create or depend on a project-local framework/ folder.",
      "Do not operate outside this project root.",
      `Project root: ${project.path}`,
      "",
      "IMPORTANT: Source files have already been fetched and written to sources/web_research/ by the build pipeline.",
      "Source digests have been generated in sources/digests/ — these are compact key-claim summaries (~200 words each).",
      "Do NOT search the web. Use only the pre-fetched sources.",
      "Read sources/digests/ FIRST to understand the evidence landscape.",
      "Read full source files from sources/web_research/ ONLY when actively writing a specific wiki page that needs detailed evidence from that source.",
      "Read sources/source_log.md for the full inventory of what was fetched.",
      "",
      "WIKI_ONLY: Build wiki pages ONLY (Phase 7). Do NOT write directed outputs (Phase 8).",
      "Directed outputs will be built in a separate per-file pass with focused context.",
      "Complete Phases 1-7 and Phase 9-11 (validation, manifest, git snapshot).",
    ];

    if (scope && !scope.isFirstBuild) {
      lines.push("");
      if (scope.projectMdChanged && scope.projectMdDiff) {
        lines.push(
          "BUILD SCOPE: project.md changed. Here is the diff:",
          "```diff",
          scope.projectMdDiff.slice(0, 3000),
          "```",
        );
      } else if (scope.sourcesChanged) {
        lines.push(
          `BUILD SCOPE: Source inventory changed. ${scope.sourceCount} sources now available.`,
          "Regenerate all wiki pages using the enriched source base.",
        );
      }

      if (scope.feedbackMarkers.length > 0) {
        lines.push("", `FEEDBACK markers found in: ${scope.feedbackMarkers.join(", ")}`);
      }
      if (scope.acceptedSuggestions.length > 0) {
        lines.push("", `Accepted AI_SUGGESTION markers in: ${scope.acceptedSuggestions.join(", ")}`);
      }
    }

    return lines.join("\n");
  }

  async function createFilePrompt(project, outputFile, sourceMap) {
    const fileMapping = sourceMap[outputFile] || { wikiPages: [], digestFiles: [] };
    const lines = [
      `Build the directed output file: ${outputFile}`,
      "",
      `Follow ${path.join(FRAMEWORK_ROOT, "commands/do_build_file.md")} exactly.`,
      "This is a non-interactive web-triggered build. Never ask the user for confirmation or wait for input mid-run.",
      `Use ${FRAMEWORK_ROOT} as the canonical framework root.`,
      `Project root: ${project.path}`,
      "",
      "CONTEXT: The wiki has already been built. The following files are your primary context:",
    ];

    // Add wiki pages to read (all available — agent picks relevant ones)
    if (fileMapping.wikiPages.length > 0) {
      lines.push("", "WIKI PAGES (read all, focus on pages relevant to this output):");
      for (const wp of fileMapping.wikiPages) {
        lines.push(`  - ${wp}`);
      }
    }

    // Add digest files (all available — agent skims for relevance)
    if (fileMapping.digestFiles.length > 0) {
      lines.push("", "SOURCE DIGESTS (skim headers, read relevant ones in full):");
      for (const df of fileMapping.digestFiles) {
        lines.push(`  - ${df}`);
      }
    }

    // Discover human inputs dynamically
    try {
      const humanInputs = await fs.readdir(path.join(project.path, "inputs_human"));
      const mdInputs = humanInputs.filter((f) => f.endsWith(".md"));
      if (mdInputs.length > 0) {
        lines.push("", "HUMAN INPUTS TO READ:");
        for (const input of mdInputs) {
          lines.push(`  - inputs_human/${input}`);
        }
      }
    } catch {
      // No inputs_human directory
    }

    // Add questions if available
    try {
      await fs.access(path.join(project.path, "questions.md"));
      lines.push("  - questions.md (for relevant open questions)");
    } catch {
      // No questions file
    }

    // Add the project.md output requirements section
    lines.push("", "PROJECT REQUIREMENTS:");
    lines.push("  - Read the output requirements sections of project.md");

    return lines.join("\n");
  }

  function createValidationPrompt(project, modelId) {
    return [
      "Run the kiss_ai validation pass for this project.",
      "",
      `Follow ${path.join(FRAMEWORK_ROOT, "commands/do_build.md")} Phases 9-11 only (Validate, Leave AI Suggestions, Record and Snapshot).`,
      "This is a non-interactive web-triggered build. Never ask the user for confirmation or wait for input mid-run.",
      `Use ${FRAMEWORK_ROOT} as the canonical framework root.`,
      `Project root: ${project.path}`,
      "",
      "Wiki pages and directed outputs have already been built.",
      "Your job is to validate, add AI suggestions, update manifest.json, and git snapshot.",
      "",
      `Model used for this build: ${modelId}. Include this in the change_logs/builds.md entry.`,
    ].join("\n");
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

      runAgentJob({ project, apiKey: cursorApiKey.apiKey, modelId, prompt, jobName, releaseProjectAgent }).catch((error) => {
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

  async function runAgentJob({ project, apiKey, modelId, prompt, jobName, releaseProjectAgent }) {
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

      const sourceMap = await buildSourceMapping(project.path);
      await writeSourceMapping(project.path, sourceMap);
      const outputFileCount = Object.keys(sourceMap).length;

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

      // ── Phase 3c: Validation Pass ──
      const stateBeforeValidation = await getRebuildState(project.slug);
      await setRebuildState(project.slug, {
        ...stateBeforeValidation,
        buildPhase: "validation",
        buildPhaseDetail: "Validating outputs, adding suggestions, recording snapshot",
      });

      await appendRunEvent(project.slug, {
        type: "system",
        title: "Phase 3c: Validating and recording",
        text: "Agent is validating outputs, adding AI suggestions, updating manifest, and creating git snapshot.",
        status: "validation",
        runtime: "cursor",
        metadata: { phase: "3c" },
      });

      const validationPrompt = createValidationPrompt(project, modelId);
      const synthesisResult = await runSingleAgentPhase({
        project,
        apiKey,
        modelId,
        prompt: validationPrompt,
        phaseName: "Validation",
      });

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

  return { startHumanAttentionResolution, startRebuild };
}
