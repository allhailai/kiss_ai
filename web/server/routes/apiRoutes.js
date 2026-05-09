export function registerApiRoutes(app, deps) {
  const {
    PROJECTS_ROOT,
    acceptRequirementsAutoUpdate,
    attachProject,
    createProjectFromTemplate,
    createConversation,
    discoverProjects,
    displayProjectName,
    editChatMessage,
    getHumanAttentionItems,
    getRebuildState,
    gitFileDiff,
    gitStatus,
    buildLogTabState,
    deleteHumanInputFile,
    humanFiles,
    httpError,
    lintDesignIdentity,
    listConversations,
    listCursorModels,
    listMarkdownFiles,
    listProjectFiles,
    parseDesignIdentity,
    pickRebuildModelId,
    readConversation,
    readProjectJson,
    readTextFile,
    resolveCursorApiKey,
    restoreFileFromHead,
    runAiAssistProposal,
    runRequirementsAutoUpdateProposal,
    searchFiles,
    sendChatMessage,
    startHumanAttentionResolution,
    startRebuild,
    subscribeToConversation,
    subscribeToRebuild,
    treeRoots,
    updateConversation,
    uploadHumanInputFiles,
    writeTextFile,
  } = deps;

  app.get("/api/projects", async (_request, response, next) => {
    try {
      response.json({
        projectsRoot: PROJECTS_ROOT,
        projects: await discoverProjects(),
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/projects", async (request, response, next) => {
    try {
      response.status(201).json(await createProjectFromTemplate(request.body));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/cursor/models", async (_request, response, next) => {
    try {
      const cursorApiKey = await resolveCursorApiKey();

      if (!cursorApiKey.available) {
        response.json({
          available: false,
          defaultModelId: null,
          models: [],
          source: null,
        });
        return;
      }

      const models = await listCursorModels(cursorApiKey.apiKey);
      response.json({
        available: true,
        defaultModelId: pickRebuildModelId(models),
        models,
        source: cursorApiKey.source,
      });
    } catch (error) {
      next(error);
    }
  });

  app.use("/api/projects/:projectSlug", attachProject);

  app.get("/api/projects/:projectSlug/conversations", async (request, response, next) => {
    try {
      response.json(await listConversations(request.project));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/projects/:projectSlug/conversations", async (request, response, next) => {
    try {
      response.status(201).json(await createConversation(request.project, request.body));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/projects/:projectSlug/conversations/:conversationId", async (request, response, next) => {
    try {
      response.json(await readConversation(request.project, request.params.conversationId));
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/projects/:projectSlug/conversations/:conversationId", async (request, response, next) => {
    try {
      response.json(await updateConversation(request.project, request.params.conversationId, request.body));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/projects/:projectSlug/conversations/:conversationId/messages", async (request, response, next) => {
    try {
      response.json(await sendChatMessage(request.project, request.params.conversationId, request.body));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/projects/:projectSlug/conversations/:conversationId/messages/:messageId/edit", async (request, response, next) => {
    try {
      response.json(await editChatMessage(request.project, request.params.conversationId, request.params.messageId, request.body));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/projects/:projectSlug/conversations/:conversationId/events", async (request, response, next) => {
    try {
      response.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      });
      response.flushHeaders?.();

      const send = (eventName, payload) => {
        response.write(`event: ${eventName}\n`);
        response.write(`data: ${JSON.stringify(payload)}\n\n`);
      };
      const unsubscribe = subscribeToConversation(request.project.slug, request.params.conversationId, (event) => {
        send(event.type === "error" ? "chat_error" : event.type, event);
      });

      send("snapshot", {
        type: "snapshot",
        conversation: await readConversation(request.project, request.params.conversationId),
      });

      request.on("close", () => {
        unsubscribe();
        response.end();
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/projects/:projectSlug/status", async (request, response, next) => {
    try {
      const project = request.project;
      const harness = await readProjectJson(project.path, ".harness-state.json", {});
      const cursorApiKey = await resolveCursorApiKey();
      const inputAnnotations = await listMarkdownFiles(project.path, "inputs_ai", "ai", false, true);
      const humanAttentionItems = getHumanAttentionItems(harness);

      response.json({
        projectSlug: harness.project_slug ?? project.slug,
        projectName: displayProjectName(harness.project_name ?? project.name, harness.project_slug ?? project.slug),
        setupStatus: harness.setup?.status ?? "unknown",
        setupInitializedAt: harness.setup?.initialized_at ?? null,
        lastRunAt: harness.last_run_at ?? null,
        lastSuccessfulRunAt: harness.last_successful_run_at ?? null,
        scalingMode: harness.scaling_assessment?.selected_mode ?? null,
        rebuildStatus: harness.rebuild_scope?.status ?? null,
        lintStatus: harness.last_lint?.status ?? null,
        annotationStatus: harness.last_annotation_scan?.status ?? null,
        annotationsLogged: harness.last_annotation_scan?.annotations_logged ?? 0,
        annotationFiles: inputAnnotations.length,
        unresolvedReviewItems: harness.last_annotation_scan?.unresolved_review_items ?? [],
        blockedArtifacts: harness.rebuild_scope?.blocked_artifacts ?? [],
        staleOutputs: harness.rebuild_scope?.outputs_marked_stale ?? [],
        humanAttentionItems,
        humanAttentionCount: humanAttentionItems.length,
        cursorApiKeyAvailable: cursorApiKey.available,
        cursorApiKeySource: cursorApiKey.source,
        cursorApiKeyWarnings: cursorApiKey.warnings,
        gitStatus: await gitStatus(project.path),
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/projects/:projectSlug/build-log", async (request, response, next) => {
    try {
      const requestedTabId = String(request.query.tab ?? "");
      const requestedPath = String(request.query.path ?? request.query.summary ?? "");
      const requestedSectionId = String(request.query.section ?? "");

      response.json(await buildLogTabState(request.project.path, requestedTabId, requestedPath, requestedSectionId));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/projects/:projectSlug/tree/:section", async (request, response, next) => {
    try {
      const project = request.project;
      const section = request.params.section;

      if (section === "requirements") {
        response.json({
          files: [...humanFiles.entries()]
            .filter(([, meta]) => meta.kind !== "design")
            .map(([file, meta]) => ({
              path: file,
              name: file,
              ...meta,
            })),
        });
        return;
      }

      const config = treeRoots.get(section);
      if (!config) throw httpError("Unknown tree section.", 404, "unknown_tree_section");

      response.json({
        files: section === "human" ? await listProjectFiles(project.path, config.root) : await listMarkdownFiles(project.path, config.root, config.kind, config.editable, config.annotation),
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/projects/:projectSlug/inputs-human/upload", async (request, response, next) => {
    try {
      response.status(201).json(await uploadHumanInputFiles(request.project.path, request.body.files));
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/projects/:projectSlug/inputs-human/file", async (request, response, next) => {
    try {
      response.json(await deleteHumanInputFile(request.project.path, String(request.body.path ?? "")));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/projects/:projectSlug/search/files", async (request, response, next) => {
    try {
      response.json({ files: await searchFiles(request.project.path, String(request.query.q ?? "")) });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/projects/:projectSlug/file", async (request, response, next) => {
    try {
      response.json(await readTextFile(request.project.path, String(request.query.path ?? "")));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/projects/:projectSlug/file/diff", async (request, response, next) => {
    try {
      response.json(await gitFileDiff(request.project.path, String(request.query.path ?? "")));
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/projects/:projectSlug/file", async (request, response, next) => {
    try {
      response.json(await writeTextFile(request.project.path, String(request.body.path ?? ""), String(request.body.content ?? "")));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/projects/:projectSlug/file/revert", async (request, response, next) => {
    try {
      response.json(await restoreFileFromHead(request.project.path, String(request.body.path ?? "")));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/projects/:projectSlug/ai-assist/propose", async (request, response, next) => {
    try {
      response.json(await runAiAssistProposal(request.project, request.body));
    } catch (error) {
      next(error);
    }
  });

  // Refine is a stable API alias that sends prior proposal context to the same proposal service.
  app.post("/api/projects/:projectSlug/ai-assist/refine", async (request, response, next) => {
    try {
      response.json(await runAiAssistProposal(request.project, request.body));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/projects/:projectSlug/requirements/auto-update/propose", async (request, response, next) => {
    try {
      response.json(await runRequirementsAutoUpdateProposal(request.project, request.body));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/projects/:projectSlug/requirements/auto-update/accept", async (request, response, next) => {
    try {
      response.json(await acceptRequirementsAutoUpdate(request.project, request.body));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/projects/:projectSlug/design", async (request, response, next) => {
    try {
      const file = await readTextFile(request.project.path, "human_design_identity.md");
      response.json({
        file,
        parsed: parseDesignIdentity(file.content),
        lint: await lintDesignIdentity(request.project.path),
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/projects/:projectSlug/rebuild", async (request, response, next) => {
    try {
      response.json(await getRebuildState(request.project.slug));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/projects/:projectSlug/rebuild/events", async (request, response, next) => {
    try {
      response.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      });
      response.flushHeaders?.();

      const send = (eventName, payload) => {
        response.write(`event: ${eventName}\n`);
        response.write(`data: ${JSON.stringify(payload)}\n\n`);
      };
      const unsubscribe = subscribeToRebuild(request.project.slug, ({ state, event }) => {
        send("event", { state, event });
      });

      send("snapshot", await getRebuildState(request.project.slug));

      request.on("close", () => {
        unsubscribe();
        response.end();
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/projects/:projectSlug/rebuild/start", async (request, response, next) => {
    try {
      response.json(await startRebuild(request.project, request.body.modelId));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/projects/:projectSlug/human-attention/resolve", async (request, response, next) => {
    try {
      response.json(await startHumanAttentionResolution(request.project, request.body));
    } catch (error) {
      next(error);
    }
  });
}
