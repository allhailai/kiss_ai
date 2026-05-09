import fs from "node:fs/promises";
import path from "node:path";

export function createAiFlowService({
  FRAMEWORK_ROOT,
  MAX_FILE_BYTES,
  MAX_AI_ASSIST_FULL_CONTENT_BYTES,
  MAX_AI_ASSIST_CONTEXT_BYTES,
  REQUIREMENT_AUTO_UPDATE_PATHS,
  classifyPath,
  displayProjectName,
  hashText,
  httpError,
  listCursorModels,
  pickRebuildModelId,
  projectPath,
  readProjectHarness,
  readTextFile,
  requirementAutoUpdatePathSet,
  resolveCursorApiKey,
  runCursorAgentText,
  writeTextFile,
}) {
  function markdownSectionId(title, index) {
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60);

    return `section-${index + 1}${slug ? `-${slug}` : ""}`;
  }

  function parseMarkdownSections(markdown) {
    const matches = [...markdown.matchAll(/^##\s+(.+)$/gm)];

    return matches.map((match, index) => {
      const start = match.index ?? 0;
      const end = matches[index + 1]?.index ?? markdown.length;
      const title = match[1].trim();

      return {
        id: markdownSectionId(title, index),
        title,
        content: markdown.slice(start, end).trim(),
      };
    });
  }

  function trimForPrompt(value, maxBytes = MAX_AI_ASSIST_CONTEXT_BYTES) {
    const text = String(value ?? "");
    if (Buffer.byteLength(text, "utf8") <= maxBytes) return text;

    return `${text.slice(0, maxBytes)}\n\n[Truncated for prompt size.]`;
  }

  function lineNumberForIndex(content, index) {
    return content.slice(0, Math.max(0, index)).split("\n").length;
  }

  function extractAiAssistCandidate(content, annotation) {
    const explicit = String(annotation ?? "").trim();
    if (explicit) return explicit;

    const candidate = content
      .split("\n")
      .find((line) => /\b(TODO|AI Assist|FIXME|TBD)\b|^\s*[-*]\s+\[[ ?]\]/i.test(line));
    return candidate?.trim() ?? "";
  }

  function getAiAssistFileContext(content, annotation) {
    if (Buffer.byteLength(content, "utf8") <= MAX_AI_ASSIST_FULL_CONTENT_BYTES) {
      return {
        mode: "full",
        content,
        surroundingSections: parseMarkdownSections(content).map(({ title }) => title),
      };
    }

    const candidate = extractAiAssistCandidate(content, annotation);
    const candidateIndex = candidate ? content.toLowerCase().indexOf(candidate.toLowerCase()) : -1;
    const candidateLine = candidateIndex >= 0 ? lineNumberForIndex(content, candidateIndex) : 1;
    const lines = content.split("\n");
    const startLine = Math.max(1, candidateLine - 80);
    const endLine = Math.min(lines.length, candidateLine + 120);
    const excerpt = lines.slice(startLine - 1, endLine).join("\n");

    return {
      mode: "excerpt",
      content: trimForPrompt(excerpt, MAX_AI_ASSIST_FULL_CONTENT_BYTES),
      surroundingSections: parseMarkdownSections(content)
        .filter((section) => section.content.includes(candidate) || section.content.length < MAX_AI_ASSIST_CONTEXT_BYTES)
        .slice(0, 8)
        .map(({ title }) => title),
      excerptLineRange: { from: startLine, to: endLine },
    };
  }

  async function readOptionalProjectText(projectRoot, relativePath, maxBytes = MAX_AI_ASSIST_CONTEXT_BYTES) {
    try {
      const file = await readTextFile(projectRoot, relativePath);
      return trimForPrompt(file.content, maxBytes);
    } catch {
      return "";
    }
  }

  async function createAiAssistContext(project, meta, currentContent, annotation) {
    const harness = await readProjectHarness(project.path);
    const frameworkReadme = await fs.readFile(path.join(FRAMEWORK_ROOT, "README.md"), "utf8").catch(() => "");
    const rootReadme = await fs.readFile(path.join(path.dirname(FRAMEWORK_ROOT), "README.md"), "utf8").catch(() => "");

    return {
      project: {
        slug: project.slug,
        name: displayProjectName(harness.project_name ?? project.name, harness.project_slug ?? project.slug),
        root: project.path,
        setupStatus: harness.setup?.status ?? "unknown",
        lastRunAt: harness.last_run_at ?? null,
      },
      framework: {
        root: FRAMEWORK_ROOT,
        overview: trimForPrompt(rootReadme, 8000),
        readme: trimForPrompt(frameworkReadme, 10000),
        invariants: [
          "Requirement files are the source of truth.",
          "inputs_human/ is human-owned.",
          "inputs_ai/ and outputs_ai/ are AI-managed.",
          "Human edits in AI-managed paths are annotations, not durable source-of-truth changes.",
          "Generated outputs must be reproducible from requirements and inputs.",
        ],
      },
      requirements: {
        goal: await readOptionalProjectText(project.path, "human_goal_requirements.md"),
        inputs: await readOptionalProjectText(project.path, "human_input_requirements.md"),
        outputs: await readOptionalProjectText(project.path, "human_output_requirements.md"),
        openQuestions: await readOptionalProjectText(project.path, "human_open_questions.md"),
      },
      currentFile: {
        path: meta.path,
        kind: meta.kind,
        editable: meta.editable,
        annotation: meta.annotation,
        contentHash: hashText(currentContent),
        ...getAiAssistFileContext(currentContent, annotation),
      },
    };
  }

  function requireAiAssistRequest(projectRoot, body) {
    const filePath = String(body?.path ?? "").trim();
    const annotation = String(body?.annotation ?? "").trim();
    const feedback = String(body?.feedback ?? "").trim();
    const modelId = String(body?.modelId ?? "").trim();
    const meta = classifyPath(projectRoot, filePath);

    if (!filePath) throw httpError("AI Assist requires a file path.");
    if (!/^human_[^/]+\.md$/i.test(meta.path) || meta.kind !== "human") {
      throw httpError("AI Assist currently supports human-owned requirement files only.");
    }
    if (!meta.editable) throw httpError("AI Assist requires an editable file.", 403, "file_read_only");
    if (!annotation && !feedback) throw httpError("AI Assist requires an annotation, selection, instruction, or refinement note.");

    return {
      meta,
      annotation,
      feedback,
      modelId,
      previousProposal: body?.previousProposal && typeof body.previousProposal === "object" ? body.previousProposal : null,
    };
  }

  function createAiAssistPrompt({ project, context, annotation, feedback, previousProposal }) {
    const payload = {
      projectRoot: project.path,
      frameworkRoot: FRAMEWORK_ROOT,
      currentFilePath: context.currentFile.path,
      annotation,
      ephemeralFeedback: feedback || null,
      previousProposal: previousProposal
        ? {
            summary: previousProposal.summary ?? "",
            proposedContent: previousProposal.proposedContent ?? "",
            affectedSections: previousProposal.affectedSections ?? [],
          }
        : null,
      context,
    };

    return [
      "Produce an AI Assist proposal for this kiss_ai project file.",
      "",
      `Follow ${path.join(FRAMEWORK_ROOT, "commands/do_ai_assist.md")} exactly.`,
      "This is a proposal-only web-triggered run. Do not edit files, write logs, update state, or run modifying commands.",
      "Return only one AI Assist proposal using the tagged output contract from do_ai_assist.md.",
      "Do not wrap the response in Markdown fences. Do not add prose before or after the tagged proposal.",
      "The response must start with `<ai_assist_proposal>` and end with `</ai_assist_proposal>`.",
      "Put the complete replacement Markdown for the current file inside the <proposedContent> tag.",
      "",
      "Request payload:",
      JSON.stringify(payload, null, 2),
    ].join("\n");
  }

  function firstTagContent(text, tagName) {
    const pattern = new RegExp(`<${tagName}>\\s*([\\s\\S]*?)\\s*<\\/${tagName}>`, "i");
    return text.match(pattern)?.[1]?.trim() ?? "";
  }

  function parseTaggedList(value) {
    return value
      .split("\n")
      .map((line) => line.replace(/^\s*[-*]\s*/, "").trim())
      .filter(Boolean);
  }

  function extractTaggedAiAssistProposal(rawText) {
    const text = String(rawText ?? "").trim();
    const wrapper = firstTagContent(text, "ai_assist_proposal");
    const source = wrapper || text;
    const proposedContent = firstTagContent(source, "proposedContent");

    if (!proposedContent) {
      throw new Error("AI Assist did not return tagged proposal content.");
    }

    return {
      summary: firstTagContent(source, "summary") || "AI Assist proposal generated.",
      rationale: firstTagContent(source, "rationale"),
      affectedSections: parseTaggedList(firstTagContent(source, "affectedSections")),
      proposedContent,
      risks: parseTaggedList(firstTagContent(source, "risks")),
      questionsOrAssumptions: parseTaggedList(firstTagContent(source, "questionsOrAssumptions")),
    };
  }

  function findBalancedJsonCandidates(text) {
    const candidates = [];
    let start = -1;
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = 0; index < text.length; index += 1) {
      const character = text[index];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (character === "\\") {
          escaped = true;
        } else if (character === "\"") {
          inString = false;
        }
        continue;
      }

      if (character === "\"") {
        inString = true;
        continue;
      }

      if (character === "{") {
        if (depth === 0) start = index;
        depth += 1;
      } else if (character === "}" && depth > 0) {
        depth -= 1;
        if (depth === 0 && start >= 0) {
          candidates.push(text.slice(start, index + 1));
          start = -1;
        }
      }
    }

    return candidates;
  }

  function extractJsonObject(rawText, errorMessage = "AI Assist did not return valid proposal JSON.") {
    const text = String(rawText ?? "").trim();
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fenced?.[1]?.trim() ?? text;

    try {
      return JSON.parse(candidate);
    } catch {
      for (const jsonCandidate of findBalancedJsonCandidates(candidate)) {
        try {
          return JSON.parse(jsonCandidate);
        } catch {
          // Try the next balanced candidate.
        }
      }
      throw new Error(errorMessage);
    }
  }

  function createAiAssistRepairPrompt({ rawText, fallbackContent }) {
    const repairPayload = {
      malformedResponse: trimForPrompt(rawText, 180000),
      fallbackContent,
    };

    return [
      "Repair this AI Assist response into the tagged AI Assist proposal format.",
      "Return only the tagged proposal. Do not include Markdown fences, prose, comments, or trailing text.",
      "The response must start with `<ai_assist_proposal>` and end with `</ai_assist_proposal>`.",
      "If the malformed response does not contain usable proposed content, use fallbackContent as proposedContent and explain the issue in risks.",
      "",
      "Required format:",
      "<ai_assist_proposal>",
      "<summary>Short human-readable summary.</summary>",
      "<rationale>Why this change fits.</rationale>",
      "<affectedSections>",
      "- Section name",
      "</affectedSections>",
      "<proposedContent>",
      "Full replacement Markdown content for the current file.",
      "</proposedContent>",
      "<risks>",
      "- Risk or ambiguity",
      "</risks>",
      "<questionsOrAssumptions>",
      "- Assumption or question",
      "</questionsOrAssumptions>",
      "</ai_assist_proposal>",
      "",
      "Repair payload:",
      JSON.stringify(repairPayload, null, 2),
    ].join("\n");
  }

  async function parseOrRepairAiAssistProposal({ project, apiKey, modelId, rawText, fallbackContent }) {
    try {
      return extractTaggedAiAssistProposal(rawText);
    } catch {
      // Older or stubborn models may still return JSON; keep that path supported.
    }

    try {
      return extractJsonObject(rawText);
    } catch (parseError) {
      const repairPrompt = createAiAssistRepairPrompt({ rawText, fallbackContent });
      const repairedText = await runCursorAgentText({ project, apiKey, modelId, prompt: repairPrompt });

      try {
        return extractTaggedAiAssistProposal(repairedText);
      } catch {
        // Fall through to legacy JSON repair parsing below.
      }

      try {
        return extractJsonObject(repairedText, "AI Assist did not return a valid proposal after a repair attempt.");
      } catch (repairError) {
        const preview = trimForPrompt(rawText || repairedText, 1200);
        console.warn(`[kiss_ai UI warning] AI Assist proposal parse failed. Raw response preview:\n${preview}`);
        throw repairError instanceof Error ? repairError : parseError;
      }
    }
  }

  function normalizeAiAssistProposal(value, fallbackContent) {
    const source = value && typeof value === "object" ? value : {};
    const proposedContent = typeof source.proposedContent === "string" ? source.proposedContent : fallbackContent;

    if (Buffer.byteLength(proposedContent, "utf8") > MAX_FILE_BYTES) {
      throw httpError("AI Assist proposed content is too large for the editor.", 413, "proposal_too_large");
    }

    return {
      summary: String(source.summary ?? "AI Assist proposal generated.").trim(),
      rationale: String(source.rationale ?? "").trim(),
      affectedSections: Array.isArray(source.affectedSections) ? source.affectedSections.map(String).filter(Boolean) : [],
      proposedContent,
      risks: Array.isArray(source.risks) ? source.risks.map(String).filter(Boolean) : [],
      questionsOrAssumptions: Array.isArray(source.questionsOrAssumptions) ? source.questionsOrAssumptions.map(String).filter(Boolean) : [],
    };
  }

  function requireRequirementAutoUpdatePath(projectRoot, filePath, label = "Requirement file") {
    const meta = classifyPath(projectRoot, String(filePath ?? "").trim());

    if (!requirementAutoUpdatePathSet.has(meta.path)) {
      throw httpError(`${label} must be one of the three root requirement files.`);
    }
    if (!meta.editable) {
      throw httpError(`${label} must be editable.`, 403, "file_read_only");
    }

    return meta.path;
  }

  function requireRequirementAutoUpdateRequest(projectRoot, body) {
    const modelId = String(body?.modelId ?? "").trim();
    const sourcePath = requireRequirementAutoUpdatePath(projectRoot, body?.sourcePath, "Source file");
    const selectedPaths = Array.isArray(body?.selectedPaths)
      ? [...new Set(body.selectedPaths.map((value) => requireRequirementAutoUpdatePath(projectRoot, value, "Selected file")))]
      : [];
    const instruction = String(body?.instruction ?? "").trim();
    const contentHashes = body?.contentHashes && typeof body.contentHashes === "object" && !Array.isArray(body.contentHashes) ? body.contentHashes : {};

    if (!modelId) throw httpError("AI Auto Update requires a model.");
    if (!selectedPaths.length) throw httpError("Select at least one requirement file to update.");

    for (const filePath of REQUIREMENT_AUTO_UPDATE_PATHS) {
      const contentHash = String(contentHashes[filePath] ?? "").trim();
      if (!contentHash) {
        throw httpError(`AI Auto Update requires a content hash for ${filePath}.`);
      }
    }

    return {
      modelId,
      sourcePath,
      selectedPaths,
      instruction,
      contentHashes,
    };
  }

  function createRequirementsAutoUpdatePrompt({ project, request, files }) {
    const payload = {
      projectRoot: project.path,
      frameworkRoot: FRAMEWORK_ROOT,
      sourcePath: request.sourcePath,
      selectedPaths: request.selectedPaths,
      instruction: request.instruction || null,
      requirements: Object.fromEntries(
        files.map((file) => [
          file.path,
          {
            path: file.path,
            contentHash: file.contentHash,
            content: file.content,
            selectedForUpdate: request.selectedPaths.includes(file.path),
            sourceOfRecentIntent: file.path === request.sourcePath,
          },
        ]),
      ),
    };

    return [
      "Produce an AI Auto Update proposal for this kiss_ai project's root requirement files.",
      "",
      `Follow ${path.join(FRAMEWORK_ROOT, "commands/do_requirements_auto_update.md")} exactly.`,
      "This is a proposal-only web-triggered run. Do not edit files, write logs, update state, or run modifying commands.",
      "Return only one AI Auto Update proposal using the tagged output contract from do_requirements_auto_update.md.",
      "Do not wrap the response in Markdown fences. Do not add prose before or after the tagged proposal.",
      "The response must start with `<requirements_auto_update_proposal>` and end with `</requirements_auto_update_proposal>`.",
      "Return file proposals only for selectedPaths. Put complete replacement Markdown for each selected file inside its <proposedContent> tag.",
      "",
      "Request payload:",
      JSON.stringify(payload, null, 2),
    ].join("\n");
  }

  function allTagContent(text, tagName) {
    const pattern = new RegExp(`<${tagName}>\\s*([\\s\\S]*?)\\s*<\\/${tagName}>`, "gi");
    return [...String(text ?? "").matchAll(pattern)].map((match) => match[1]?.trim() ?? "");
  }

  function extractTaggedRequirementsAutoUpdateProposal(rawText) {
    const text = String(rawText ?? "").trim();
    const wrapper = firstTagContent(text, "requirements_auto_update_proposal");
    const source = wrapper || text;
    const fileProposals = allTagContent(source, "fileProposal").map((proposalText) => ({
      filePath: firstTagContent(proposalText, "filePath"),
      summary: firstTagContent(proposalText, "summary") || "AI Auto Update proposal generated.",
      rationale: firstTagContent(proposalText, "rationale"),
      affectedSections: parseTaggedList(firstTagContent(proposalText, "affectedSections")),
      proposedContent: firstTagContent(proposalText, "proposedContent"),
      risks: parseTaggedList(firstTagContent(proposalText, "risks")),
      questionsOrAssumptions: parseTaggedList(firstTagContent(proposalText, "questionsOrAssumptions")),
    }));

    if (!fileProposals.length || fileProposals.some((proposal) => !proposal.filePath || !proposal.proposedContent)) {
      throw new Error("AI Auto Update did not return tagged proposals for the selected files.");
    }

    return { proposals: fileProposals };
  }

  function createRequirementsAutoUpdateRepairPrompt({ rawText, selectedPaths, fallbackFiles }) {
    const repairPayload = {
      malformedResponse: trimForPrompt(rawText, 180000),
      selectedPaths,
      fallbackFiles: Object.fromEntries(fallbackFiles.map((file) => [file.path, file.content])),
    };

    return [
      "Repair this AI Auto Update response into the tagged multi-file proposal format.",
      "Return only the tagged proposal. Do not include Markdown fences, prose, comments, or trailing text.",
      "The response must start with `<requirements_auto_update_proposal>` and end with `</requirements_auto_update_proposal>`.",
      "If usable proposed content is missing for a selected file, use that file's fallback content and explain the issue in risks.",
      "",
      "Required format:",
      "<requirements_auto_update_proposal>",
      "<fileProposal>",
      "<filePath>human_input_requirements.md</filePath>",
      "<summary>Short human-readable summary.</summary>",
      "<rationale>Why this change fits.</rationale>",
      "<affectedSections>",
      "- Section name",
      "</affectedSections>",
      "<proposedContent>",
      "Full replacement Markdown content for this file.",
      "</proposedContent>",
      "<risks>",
      "- Risk or ambiguity",
      "</risks>",
      "<questionsOrAssumptions>",
      "- Assumption or question",
      "</questionsOrAssumptions>",
      "</fileProposal>",
      "</requirements_auto_update_proposal>",
      "",
      "Repair payload:",
      JSON.stringify(repairPayload, null, 2),
    ].join("\n");
  }

  async function parseOrRepairRequirementsAutoUpdateProposal({ project, apiKey, modelId, rawText, selectedPaths, fallbackFiles }) {
    try {
      return extractTaggedRequirementsAutoUpdateProposal(rawText);
    } catch {
      // Try JSON before asking the model to repair.
    }

    try {
      return extractJsonObject(rawText, "AI Auto Update did not return valid proposal JSON.");
    } catch (parseError) {
      const repairPrompt = createRequirementsAutoUpdateRepairPrompt({ rawText, selectedPaths, fallbackFiles });
      const repairedText = await runCursorAgentText({ project, apiKey, modelId, prompt: repairPrompt });

      try {
        return extractTaggedRequirementsAutoUpdateProposal(repairedText);
      } catch {
        // Fall through to JSON repair parsing below.
      }

      try {
        return extractJsonObject(repairedText, "AI Auto Update did not return a valid proposal after a repair attempt.");
      } catch (repairError) {
        const preview = trimForPrompt(rawText || repairedText, 1200);
        console.warn(`[kiss_ai UI warning] AI Auto Update proposal parse failed. Raw response preview:\n${preview}`);
        throw repairError instanceof Error ? repairError : parseError;
      }
    }
  }

  function normalizeRequirementsAutoUpdateProposal(value, selectedPaths, filesByPath, modelId) {
    const source = value && typeof value === "object" ? value : {};
    const rawProposals = Array.isArray(source.proposals) ? source.proposals : [];
    const proposalsByPath = new Map();

    for (const rawProposal of rawProposals) {
      const rawPath = String(rawProposal?.filePath ?? rawProposal?.path ?? "").trim();
      if (!selectedPaths.includes(rawPath)) continue;

      const originalFile = filesByPath.get(rawPath);
      const proposedContent = typeof rawProposal?.proposedContent === "string" ? rawProposal.proposedContent : originalFile?.content ?? "";

      if (Buffer.byteLength(proposedContent, "utf8") > MAX_FILE_BYTES) {
        throw httpError(`AI Auto Update proposed content is too large for ${rawPath}.`, 413, "proposal_too_large");
      }

      proposalsByPath.set(rawPath, {
        filePath: rawPath,
        contentHash: originalFile?.contentHash ?? "",
        modelId,
        generatedAt: new Date().toISOString(),
        summary: String(rawProposal?.summary ?? "AI Auto Update proposal generated.").trim(),
        rationale: String(rawProposal?.rationale ?? "").trim(),
        affectedSections: Array.isArray(rawProposal?.affectedSections) ? rawProposal.affectedSections.map(String).filter(Boolean) : [],
        proposedContent,
        risks: Array.isArray(rawProposal?.risks) ? rawProposal.risks.map(String).filter(Boolean) : [],
        questionsOrAssumptions: Array.isArray(rawProposal?.questionsOrAssumptions)
          ? rawProposal.questionsOrAssumptions.map(String).filter(Boolean)
          : [],
      });
    }

    const missingPaths = selectedPaths.filter((filePath) => !proposalsByPath.has(filePath));
    if (missingPaths.length) {
      throw httpError(`AI Auto Update did not return proposals for: ${missingPaths.join(", ")}.`, 502, "agent_invalid_response");
    }

    return {
      modelId,
      generatedAt: new Date().toISOString(),
      proposals: selectedPaths.map((filePath) => proposalsByPath.get(filePath)),
    };
  }

  function requireRequirementsAutoUpdateAcceptRequest(projectRoot, body) {
    const rawProposals = Array.isArray(body?.proposals) ? body.proposals : [];
    if (!rawProposals.length) {
      throw httpError("AI Auto Update requires at least one accepted proposal.");
    }

    const proposals = rawProposals.map((proposal) => {
      const filePath = requireRequirementAutoUpdatePath(projectRoot, proposal?.filePath ?? proposal?.path, "Accepted file");
      const contentHash = String(proposal?.contentHash ?? "").trim();
      const proposedContent = typeof proposal?.proposedContent === "string" ? proposal.proposedContent : "";

      if (!contentHash) throw httpError(`AI Auto Update requires a content hash for ${filePath}.`);
      if (!proposedContent) throw httpError(`AI Auto Update requires proposed content for ${filePath}.`);
      if (Buffer.byteLength(proposedContent, "utf8") > MAX_FILE_BYTES) {
        throw httpError(`AI Auto Update proposed content is too large for ${filePath}.`, 413, "proposal_too_large");
      }

      return { filePath, contentHash, proposedContent };
    });

    const uniquePaths = new Set(proposals.map((proposal) => proposal.filePath));
    if (uniquePaths.size !== proposals.length) {
      throw httpError("AI Auto Update accept request contains duplicate files.");
    }

    return { proposals };
  }

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
