import fs from "node:fs/promises";

export function createAiFlowService({
  MAX_AI_ASSIST_FULL_CONTENT_BYTES,
  REQUIREMENT_AUTO_UPDATE_PATHS,
  createAiAssistContext,
  createAiAssistPrompt,
  createRequirementsAutoUpdatePrompt,
  hashText,
  httpError,
  listCursorModels,
  normalizeAiAssistProposal,
  normalizeRequirementsAutoUpdateProposal,
  parseOrRepairAiAssistProposal,
  parseOrRepairRequirementsAutoUpdateProposal,
  pickRebuildModelId,
  projectPath,
  readTextFile,
  requireAiAssistRequest,
  requireRequirementsAutoUpdateAcceptRequest,
  requireRequirementAutoUpdateRequest,
  resolveCursorApiKey,
  runCursorAgentText,
  writeTextFile,
}) {
  async function runAiAssistProposal(project, body) {
    const request = requireAiAssistRequest(project.path, body);
    const file = await readTextFile(project.path, request.meta.path);
    const contentHash = hashText(file.content);

    if (body?.contentHash && String(body.contentHash) !== contentHash) {
      throw httpError("The saved file changed before AI Assist could start. Reload the file and try again.", 409, "stale_file");
    }

    const cursorApiKey = await resolveCursorApiKey();
    if (!cursorApiKey.available) {
      throw httpError("No Cursor API key found in CURSOR_API_KEY, web/.env, or macOS Keychain item cursor_api_key. AI Assist is unavailable from the UI.", 503, "cursor_api_key_unavailable");
    }

    const models = await listCursorModels(cursorApiKey.apiKey);
    if (!models.length) {
      throw httpError("No Cursor models remain after excluding MAX mode models. Add a non-MAX model to your account catalog or relax filters.", 503, "cursor_models_unavailable");
    }

    const context = await createAiAssistContext(project, request.meta, file.content, request.annotation);
    const prompt = createAiAssistPrompt({
      project,
      context,
      annotation: request.annotation,
      feedback: request.feedback,
      previousProposal: request.previousProposal,
    });
    const modelId = pickRebuildModelId(models, request.modelId);
    const rawText = await runCursorAgentText({ project, apiKey: cursorApiKey.apiKey, modelId, prompt });
    const proposal = normalizeAiAssistProposal(
      await parseOrRepairAiAssistProposal({
        project,
        apiKey: cursorApiKey.apiKey,
        modelId,
        rawText,
        fallbackContent: file.content,
      }),
      file.content,
    );
    const afterFile = await readTextFile(project.path, request.meta.path);

    if (afterFile.content !== file.content) {
      const { absolute } = projectPath(project.path, request.meta.path);
      await fs.writeFile(absolute, file.content, "utf8");
      throw httpError("AI Assist attempted to edit the file directly. The original file was restored; try again with a narrower instruction.", 502, "agent_modified_file");
    }

    return {
      ...proposal,
      filePath: request.meta.path,
      contentHash,
      modelId,
      generatedAt: new Date().toISOString(),
    };
  }

  async function runRequirementsAutoUpdateProposal(project, body) {
    const request = requireRequirementAutoUpdateRequest(project.path, body);
    const files = await Promise.all(REQUIREMENT_AUTO_UPDATE_PATHS.map((filePath) => readTextFile(project.path, filePath)));
    const filesByPath = new Map(files.map((file) => [file.path, file]));

    for (const file of files) {
      if (String(request.contentHashes[file.path] ?? "") !== file.contentHash) {
        throw httpError(`The saved file changed before AI Auto Update could start: ${file.path}. Reload and try again.`, 409, "stale_file");
      }
      if (Buffer.byteLength(file.content, "utf8") > MAX_AI_ASSIST_FULL_CONTENT_BYTES) {
        throw httpError(`AI Auto Update requires ${file.path} to be under ${MAX_AI_ASSIST_FULL_CONTENT_BYTES.toLocaleString()} bytes.`, 413, "file_too_large");
      }
    }

    const cursorApiKey = await resolveCursorApiKey();
    if (!cursorApiKey.available) {
      throw httpError("No Cursor API key found in CURSOR_API_KEY, web/.env, or macOS Keychain item cursor_api_key. AI Auto Update is unavailable from the UI.", 503, "cursor_api_key_unavailable");
    }

    const models = await listCursorModels(cursorApiKey.apiKey);
    if (!models.length) {
      throw httpError("No Cursor models remain after excluding MAX mode models. Add a non-MAX model to your account catalog or relax filters.", 503, "cursor_models_unavailable");
    }

    const modelId = pickRebuildModelId(models, request.modelId);
    const prompt = createRequirementsAutoUpdatePrompt({ project, request, files });
    const rawText = await runCursorAgentText({ project, apiKey: cursorApiKey.apiKey, modelId, prompt });
    const parsedProposal = await parseOrRepairRequirementsAutoUpdateProposal({
      project,
      apiKey: cursorApiKey.apiKey,
      modelId,
      rawText,
      selectedPaths: request.selectedPaths,
      fallbackFiles: request.selectedPaths.map((filePath) => filesByPath.get(filePath)).filter(Boolean),
    });
    const afterFiles = await Promise.all(REQUIREMENT_AUTO_UPDATE_PATHS.map((filePath) => readTextFile(project.path, filePath)));

    for (const afterFile of afterFiles) {
      const beforeFile = filesByPath.get(afterFile.path);
      if (beforeFile && afterFile.content !== beforeFile.content) {
        const { absolute } = projectPath(project.path, afterFile.path);
        await fs.writeFile(absolute, beforeFile.content, "utf8");
        throw httpError("AI Auto Update attempted to edit files directly. The original files were restored; try again with a narrower instruction.", 502, "agent_modified_file");
      }
    }

    return normalizeRequirementsAutoUpdateProposal(parsedProposal, request.selectedPaths, filesByPath, modelId);
  }

  async function acceptRequirementsAutoUpdate(project, body) {
    const request = requireRequirementsAutoUpdateAcceptRequest(project.path, body);
    const currentFiles = await Promise.all(request.proposals.map((proposal) => readTextFile(project.path, proposal.filePath)));

    for (const file of currentFiles) {
      const proposal = request.proposals.find((candidate) => candidate.filePath === file.path);
      if (proposal && proposal.contentHash !== file.contentHash) {
        throw httpError(`The saved file changed before AI Auto Update could be accepted: ${file.path}. Regenerate the proposal.`, 409, "stale_file");
      }
    }

    const writtenFiles = [];
    for (const proposal of request.proposals) {
      writtenFiles.push(await writeTextFile(project.path, proposal.filePath, proposal.proposedContent));
    }

    return {
      acceptedAt: new Date().toISOString(),
      files: writtenFiles,
    };
  }

  return { acceptRequirementsAutoUpdate, runAiAssistProposal, runRequirementsAutoUpdateProposal };
}
