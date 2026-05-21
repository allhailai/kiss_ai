import fs from "node:fs/promises";
import path from "node:path";

export function createPromptBuilders(FRAMEWORK_ROOT) {

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
      "When a decision is needed, choose the conservative default, log the decision in the build entry, and continue.",
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
          "Only process FEEDBACK markers and refresh dated reports.",
          "Do not regenerate wiki pages or directed outputs that have no pending markers.",
        );
      }

      if (scope.feedbackMarkers.length > 0) {
        lines.push("", `FEEDBACK markers found in: ${scope.feedbackMarkers.join(", ")}`, "Apply feedback to these files and their downstream dependents only.");
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
      "When a decision is needed, choose the conservative default, log the decision in the build entry, and continue.",
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
      "",
      "IMPORTANT: When writing topics.json, populate each topic's `outputs` array with the expected directed output file paths",
      "(e.g., `outputs_ai/reports/reagent_brittleness_index_dashboard.md`). The build pipeline uses these paths to schedule",
      "per-file synthesis in Phase 3b. Without them, directed outputs will not be built.",
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
      await fs.access(path.join(project.path, ".build/questions.json"));
      lines.push("  - .build/questions.json (for relevant open questions)");
    } catch {
      // No questions file
    }

    // Add the project.md output requirements section
    lines.push("", "PROJECT REQUIREMENTS:");
    lines.push("  - Read the output requirements sections of project.md");

    return lines.join("\n");
  }

  function createValidationPrompt(project, modelId, rawBuildQuestions = []) {
    const lines = [
      "Run the kiss_ai validation pass for this project.",
      "",
      `Follow ${path.join(FRAMEWORK_ROOT, "commands/do_build.md")} Phases 9-11 only (Validate, Act on Gaps, Record and Snapshot).`,
      "This is a non-interactive web-triggered build. Never ask the user for confirmation or wait for input mid-run.",
      `Use ${FRAMEWORK_ROOT} as the canonical framework root.`,
      `Project root: ${project.path}`,
      "",
      "Wiki pages and directed outputs have already been built.",
      "Your job is to validate, act on gaps (coverage_gaps in topics.json or questions), update manifest.json, and git snapshot.",
      "",
      `Model used for this build: ${modelId}. Include this in the change_logs/builds.md entry.`,
    ];

    // Question consolidation instructions
    if (rawBuildQuestions.length > 0) {
      lines.push(
        "",
        "QUESTION CONSOLIDATION:",
        `The build produced ${rawBuildQuestions.length} raw question(s) from output files.`,
        "Consolidate these into the fewest meaningful questions:",
        "- Merge duplicates and near-duplicates into single questions",
        "- When merging, combine all relatedFiles from merged questions",
        "- Preserve the highest priority level when merging (blocking > important > informational)",
        "- Do not add questions that are already answered in existing .build/questions.json",
        "- Write the final consolidated list to .build/questions.json",
        "",
        "Raw questions:",
        "```json",
        JSON.stringify(rawBuildQuestions, null, 2),
        "```",
        "",
        "Write .build/questions.json with this schema:",
        '{ "questions": [{ "id": "q-...", "text": "...", "context": "...", "priority": "blocking|important|informational", "status": "open|answered|applied", "askedAt": "...", "askedDuring": { "phase": "3b", "buildId": "...", "modelId": "..." }, "relatedFiles": [...], "relatedTopics": [...], "answer": null, "answeredAt": null, "answeredBy": null }] }',
        "Preserve any existing answered questions from the current .build/questions.json.",
      );
    }

    // Auto-answer open questions from evidence
    lines.push(
      "",
      "AUTO-ANSWER OPEN QUESTIONS:",
      "Read .build/questions.json. For each question with status: \"open\":",
      "- Check whether gathered sources (sources/web_research/, sources/digests/) or wiki pages already contain the answer.",
      "- If the answer is clearly supported by evidence, auto-answer it:",
      '  - Set status: "answered"',
      "  - Set answer to a concise answer citing the source file(s).",
      '  - Set answeredBy: "ai_auto" and answeredAt to the current ISO timestamp.',
      "- If the answer is only partially available or inconclusive, leave the question open — do not guess.",
      "- This is critical: questions should not linger when the evidence to answer them already exists in the project sources.",
    );

    return lines.join("\n");
  }

  function createAutoAnswerPrompt(project, openQuestions) {
    const questionsJson = JSON.stringify(openQuestions.map((q) => ({
      id: q.id,
      text: q.text,
      context: q.context,
      priority: q.priority,
      relatedFiles: q.relatedFiles,
      relatedTopics: q.relatedTopics,
    })), null, 2);

    return [
      "You are reviewing open questions for a kiss_ai research project.",
      "Your SOLE job is to check if any of these questions can be answered from the evidence already gathered in this project.",
      "",
      `Project root: ${project.path}`,
      "",
      "## Instructions",
      "",
      "1. Read sources/digests/ to understand what evidence has been gathered.",
      "2. Read outputs_ai/wiki/_index.md to understand the wiki coverage.",
      "3. For each open question below, determine if the gathered sources contain a clear answer.",
      "4. If a question CAN be clearly answered from the evidence:",
      "   - Read the relevant source file(s) from sources/web_research/ or wiki page(s) to confirm.",
      "   - Note the answer and which source(s) support it.",
      "5. If a question CANNOT be answered (requires private/business info, or evidence is insufficient), skip it.",
      "",
      "## Output",
      "",
      "Read .build/questions.json, then rewrite it with updates.",
      "For each question you can answer from evidence:",
      '  - Set status: "answered"',
      "  - Set answer: a concise answer citing the source file(s) that support it.",
      '  - Set answeredBy: "ai_auto"',
      "  - Set answeredAt: current ISO timestamp",
      "For questions you cannot answer, leave them unchanged (status: \"open\").",
      "",
      "IMPORTANT:",
      "- Do NOT guess. Only answer if the evidence clearly supports the answer.",
      "- Do NOT answer questions about specific business relationships, contract partners, or proprietary details unless the sources explicitly name them.",
      "- DO answer questions about public regulations, statutes, government rules, and published policies if the sources contain this information.",
      "- Write the updated .build/questions.json with ALL questions (both answered and still-open).",
      "",
      "## Open Questions",
      "",
      "```json",
      questionsJson,
      "```",
    ].join("\n");
  }

  function createBatchDeepenResearchPrompt(project, topics) {
    const topicBlocks = topics.map((t) => [
      `- TOPIC_ID: ${t.id}`,
      `  LABEL: ${t.label}`,
      `  WIKI_PAGE: ${t.wiki_page || "null"}`,
      `  SOURCES: ${JSON.stringify(t.sources || [])}`,
      `  COVERAGE_GAPS: ${JSON.stringify(t.coverage_gaps || [])}`,
      `  DEPENDS_ON: ${JSON.stringify(t.depends_on || [])}`,
      `  DEEPENING_COUNT: ${t.discovery?.deepening_count ?? 0}`,
    ].join("\n")).join("\n\n");

    return [
      `Run a focused deepening research pass on ${topics.length} topic(s):`,
      "",
      topicBlocks,
      "",
      `Follow ${path.join(FRAMEWORK_ROOT, "commands/do_deepen.md")} Phases 1-2 only (Read Context and Search for Deeper Evidence).`,
      "This is a non-interactive web-triggered deepen run. Never ask the user for confirmation or wait for input mid-run.",
      `Use ${FRAMEWORK_ROOT} as the canonical framework root.`,
      "Do not create or depend on a project-local framework/ folder.",
      "Do not operate outside this project root.",
      `Project root: ${project.path}`,
      "",
      "Search the web for deeper evidence on ALL listed topics, then write sources/research_plan.json with the new URLs.",
      "Cover every topic listed above. Do NOT fetch URLs. Only list them. The build pipeline will fetch them.",
      "Do NOT write wiki pages, directed outputs, or source notes in this phase.",
    ].join("\n");
  }

  function createBatchDeepenSynthesisPrompt(project, topics) {
    const topicBlocks = topics.map((t) => [
      `- TOPIC_ID: ${t.id}`,
      `  LABEL: ${t.label}`,
      `  WIKI_PAGE: ${t.wiki_page || "null"}`,
      `  SOURCES: ${JSON.stringify(t.sources || [])}`,
      `  COVERAGE_GAPS: ${JSON.stringify(t.coverage_gaps || [])}`,
      `  DEPENDS_ON: ${JSON.stringify(t.depends_on || [])}`,
      `  DEEPENING_COUNT: ${t.discovery?.deepening_count ?? 0}`,
    ].join("\n")).join("\n\n");

    return [
      `Synthesize deeper evidence for ${topics.length} topic(s):`,
      "",
      topicBlocks,
      "",
      `Follow ${path.join(FRAMEWORK_ROOT, "commands/do_deepen.md")} Phases 3-4 only (Synthesize and Snapshot).`,
      "This is a non-interactive web-triggered deepen run. Never ask the user for confirmation or wait for input mid-run.",
      `Use ${FRAMEWORK_ROOT} as the canonical framework root.`,
      "Do not create or depend on a project-local framework/ folder.",
      "Do not operate outside this project root.",
      `Project root: ${project.path}`,
      "",
      "IMPORTANT: Source files have already been fetched and written to sources/web_research/ by the build pipeline.",
      "Source digests have been generated in sources/digests/.",
      "Do NOT search the web. Use only the pre-fetched sources.",
      "Read newly fetched sources, update each topic's wiki page, update affected directed outputs,",
      "and update .build/topics.json for ALL topics listed above.",
    ].join("\n");
  }

  return {
    createAutoAnswerPrompt,
    createBatchDeepenResearchPrompt,
    createBatchDeepenSynthesisPrompt,
    createFilePrompt,
    createResearchPrompt,
    createSynthesisPrompt,
    createValidationPrompt,
    createWikiOnlyPrompt,
  };
}
