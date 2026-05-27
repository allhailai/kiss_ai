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

    // Add discovery inventory for non-primary wiki pages
    const discoveryPages = fileMapping.discoveryWikiPages ?? [];
    if (discoveryPages.length > 0) {
      lines.push("", "ADDITIONAL WIKI PAGES (available if needed — read only if your primary context is insufficient):");
      for (const dp of discoveryPages) {
        lines.push(`  - ${dp}`);
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

  function createWikiPagePrompt(project, pageInfo) {
    // pageInfo = { page, topicIds, reason, mode, newDigests, allTopicDigests, feedbackMarkers }
    const lines = [
      `${pageInfo.mode === "full_rewrite" ? "Rebuild" : "Update"} the wiki page: ${pageInfo.page}`,
      "",
      `Follow ${path.join(FRAMEWORK_ROOT, "commands/do_build_wiki_page.md")} exactly.`,
      "This is a non-interactive web-triggered build. Never ask the user for confirmation or wait for input mid-run.",
      `Use ${FRAMEWORK_ROOT} as the canonical framework root.`,
      `Project root: ${project.path}`,
      "",
      `MODE: ${pageInfo.mode}`,
      `UPDATE REASON: ${pageInfo.reason}`,
      "",
    ];

    if (pageInfo.mode === "full_rewrite") {
      lines.push(
        "This page has exceeded the incremental edit threshold.",
        "Regenerate it entirely from all available evidence.",
        "",
        "ALL DIGESTS FOR THIS TOPIC (read all):",
      );
      for (const d of pageInfo.allTopicDigests) lines.push(`  - ${d}`);
    } else {
      lines.push("NEW EVIDENCE (integrate into existing page):");
      for (const d of pageInfo.newDigests) lines.push(`  - ${d}`);
      const secondaryDigests = (pageInfo.allTopicDigests ?? []).filter(
        (x) => !(pageInfo.newDigests ?? []).includes(x),
      );
      if (secondaryDigests.length > 0) {
        lines.push("", "ALL TOPIC DIGESTS (available if needed):");
        for (const d of secondaryDigests) lines.push(`  - ${d}`);
      }
    }

    if (pageInfo.feedbackMarkers?.length > 0) {
      lines.push("", "FEEDBACK MARKERS TO APPLY:");
      for (const m of pageInfo.feedbackMarkers) lines.push(`  - ${m}`);
    }

    return lines.join("\n");
  }

  function createValidationPrompt(project, modelId, rawBuildQuestions = []) {
    const lines = [
      "Run the kiss_ai evidence validation for this project.",
      "",
      `Follow ${path.join(FRAMEWORK_ROOT, "commands/do_build_validate.md")} exactly.`,
      "This is a non-interactive web-triggered build. Never ask the user for confirmation or wait for input mid-run.",
      `Use ${FRAMEWORK_ROOT} as the canonical framework root.`,
      `Project root: ${project.path}`,
      "",
      "Wiki pages and directed outputs have already been built.",
      "Your job is evidence coverage checks, contradiction detection, and gap actions.",
      "Do NOT update manifest.json, write build log entries, or run git commands — the server handles those.",
      "Do NOT check file existence — the server already validated that.",
      "",
      "Focus on:",
      "- Evidence coverage: verify key claims in outputs cite gathered sources",
      "- Contradiction detection: find claims where sources disagree",
      "- Coverage gaps: add structured entries to topics.json for missing evidence",
      "- Update .build/scratchpad.md with working memory",
      "- Update .build/topics.json with state changes and metrics",
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


  async function createArtifactPrompt(project, artifactSpec, resolvedSources, discoveryInventory = [], specHash = null) {
    const lines = [
      `Build the artifact: ${artifactSpec.frontmatter.name || artifactSpec.slug}`,
      "",
      `Follow ${path.join(FRAMEWORK_ROOT, "commands/do_build_artifact.md")} exactly.`,
      "This is a non-interactive web-triggered artifact build. Never ask the user for confirmation or wait for input mid-run.",
      `Use ${FRAMEWORK_ROOT} as the canonical framework root.`,
      `Project root: ${project.path}`,
      "",
      `Output path: artifacts/builds/${artifactSpec.slug}/index.html`,
      `Manifest path: artifacts/builds/${artifactSpec.slug}/.artifact-manifest.json`,
      "",
      "IMPORTANT: The build output directory has been cleared. Generate index.html entirely from scratch based on the spec below. Do NOT read, reference, or modify any prior build output — the directory is empty.",
      "",
      ...(specHash ? [
        `MANIFEST SPEC HASH: Use this exact value for the "specHash" field in the manifest: "${specHash}"`,
        "Do NOT compute the hash yourself — use this pre-computed value verbatim.",
        "",
      ] : []),
      "── ARTIFACT SPEC ──────────────────────────────────────────",
      "",
    ];

    // Add frontmatter as readable YAML context
    lines.push("Frontmatter:");
    for (const [key, value] of Object.entries(artifactSpec.frontmatter)) {
      if (Array.isArray(value)) {
        lines.push(`  ${key}:`);
        for (const item of value) {
          lines.push(`    - ${item}`);
        }
      } else {
        lines.push(`  ${key}: ${value}`);
      }
    }

    // Add spec body (goal, content guidance, etc.)
    if (artifactSpec.body) {
      lines.push("", "Spec body (goal, content guidance, visualization direction):", "");
      lines.push(artifactSpec.body);
    }

    // Add design identity
    lines.push(
      "",
      "── DESIGN IDENTITY ──────────────────────────────────────────",
      "",
    );

    try {
      const designIdentity = await fs.readFile(path.join(project.path, "human_design_identity.md"), "utf8");
      lines.push(designIdentity.slice(0, 5000));
    } catch {
      lines.push("No human_design_identity.md found. Use a clean, professional design.");
    }

    // Add resolved source data (explicit/priority context — full content)
    if (resolvedSources.length > 0) {
      lines.push(
        "",
        "── SOURCE DATA (priority context) ──────────────────────────",
        `${resolvedSources.length} source file(s) explicitly listed in the spec's sources field.`,
        "These are your primary data sources. Use them first.",
        "",
      );

      for (const source of resolvedSources) {
        // Cap each source file to avoid overwhelming the context
        const content = source.content.length > 8000
          ? source.content.slice(0, 8000) + "\n\n[... truncated for context limits ...]"
          : source.content;

        lines.push(`── ${source.relativePath} ──`, "", content, "");
      }
    } else {
      lines.push(
        "",
        "── SOURCE DATA ──────────────────────────────────────────",
        "No explicit sources were listed in the spec. Use the discovery inventory below to find relevant data.",
        "",
      );
    }

    // Add discovery inventory for progressive discovery
    if (discoveryInventory.length > 0) {
      lines.push(
        "",
        "── DISCOVERY INVENTORY ──────────────────────────────────",
        `${discoveryInventory.length} additional file(s) available in the project.`,
        "These are NOT pre-loaded — you must read them yourself if they seem relevant to the artifact goal.",
        "The source data above (if any) is priority context; this inventory is for progressive discovery.",
        "You may read files from outputs_ai/, artifacts/builds/, and sources/digests/ as needed.",
        "",
      );

      // Group by kind for readability
      const byKind = {};
      for (const item of discoveryInventory) {
        if (!byKind[item.kind]) byKind[item.kind] = [];
        byKind[item.kind].push(item);
      }

      for (const [kind, items] of Object.entries(byKind)) {
        const kindLabel = kind === "wiki" ? "Wiki Pages"
          : kind === "report" ? "Reports"
            : kind === "directed" ? "Directed Outputs"
              : kind === "artifact" ? "Other Artifacts"
                : "Other Outputs";
        lines.push(`${kindLabel}:`);
        for (const item of items) {
          lines.push(`  - ${item.relativePath}`);
          if (item.snippet) {
            lines.push(`    ${item.snippet.slice(0, 120)}${item.snippet.length > 120 ? "…" : ""}`);
          }
        }
        lines.push("");
      }
    }

    return lines.join("\n");
  }
  /**
   * Build the prompt for the agent to propose and write artifact specs for directed outputs.
   * The agent reads each output's content and writes tailored .artifact.md spec files.
   *
   * @param {object} project - { path, slug, name }
   * @param {Array} outputsNeedingSpecs - from findDirectedOutputsWithoutArtifacts()
   * @param {Array} existingSpecs - from listArtifactSpecs()
   * @param {string} modelId - model to set in spec frontmatter
   */
  async function createProposeOutputArtifactsPrompt(project, outputsNeedingSpecs, existingSpecs, modelId) {
    const lines = [
      `Propose and write artifact specs for ${outputsNeedingSpecs.length} directed output(s).`,
      "",
      `Follow ${path.join(FRAMEWORK_ROOT, "commands/do_propose_output_artifacts.md")} exactly.`,
      "This is a non-interactive web-triggered build phase. Never ask the user for confirmation or wait for input mid-run.",
      `Use ${FRAMEWORK_ROOT} as the canonical framework root.`,
      `Project root: ${project.path}`,
      `Model ID to set in spec frontmatter: ${modelId}`,
      "",
    ];

    // Project context
    lines.push("── PROJECT CONTEXT ──────────────────────────────────────────", "");
    try {
      const projectMd = await fs.readFile(path.join(project.path, "project.md"), "utf8");
      lines.push(projectMd.slice(0, 3000));
      if (projectMd.length > 3000) lines.push("\n[... truncated ...]");
    } catch {
      lines.push("No project.md found.");
    }

    // Design identity
    lines.push("", "── DESIGN IDENTITY ──────────────────────────────────────────", "");
    try {
      const designIdentity = await fs.readFile(path.join(project.path, "human_design_identity.md"), "utf8");
      lines.push(designIdentity.slice(0, 2000));
      if (designIdentity.length > 2000) lines.push("\n[... truncated ...]");
    } catch {
      lines.push("No human_design_identity.md found. Use a clean, professional design.");
    }

    // Directed outputs needing specs
    lines.push("", "── DIRECTED OUTPUTS NEEDING ARTIFACT SPECS ──────────────────", "");

    for (let i = 0; i < outputsNeedingSpecs.length; i++) {
      const { outputFile, topics } = outputsNeedingSpecs[i];
      const topicLabels = topics.map((t) => t.label).join(", ") || "none";
      const topicWikiPages = topics.map((t) => t.wiki_page).filter(Boolean);

      lines.push(`${i + 1}. ${outputFile}`);
      lines.push(`   Topics: ${topicLabels}`);
      if (topicWikiPages.length > 0) {
        lines.push(`   Wiki pages: ${topicWikiPages.join(", ")}`);
      }

      // Add content preview
      try {
        const content = await fs.readFile(path.join(project.path, outputFile), "utf8");
        const preview = content.slice(0, 500).replace(/\n/g, " ").trim();
        lines.push(`   Preview: ${preview}${content.length > 500 ? "…" : ""}`);
      } catch {
        lines.push("   Preview: [file not readable]");
      }

      lines.push("");
    }

    // Existing artifact specs
    if (existingSpecs.length > 0) {
      lines.push("── EXISTING ARTIFACT SPECS (do not duplicate) ──────────────────", "");
      for (const spec of existingSpecs) {
        lines.push(`- ${spec.slug} (${spec.name})`);
      }
      lines.push("");
    }

    return lines.join("\n");
  }

  return {
    createArtifactPrompt,
    createAutoAnswerPrompt,
    createFilePrompt,
    createProposeOutputArtifactsPrompt,
    createResearchPrompt,
    createSynthesisPrompt,
    createValidationPrompt,
    createWikiOnlyPrompt,
    createWikiPagePrompt,
  };
}
