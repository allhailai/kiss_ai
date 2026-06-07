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
      "Run the kiss_ai knowledge build for this project.",
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
      "KNOWLEDGE BUILD: Build wiki pages only. Do NOT write reports or directed outputs.",
      "Reports are built separately by the user via the Reports page.",
      "Complete all phases in do_build.md (context, annotations, inputs, sources, feedback, wiki, gaps, questions, recording).",
      "",
      "IMPORTANT: When writing topics.json, populate each topic's `outputs` array with the expected report file paths",
      "(e.g., `outputs_ai/reports/strategy_overview.md`). The Reports page uses these paths to show the user which reports are available.",
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
          "Update only the wiki pages affected by this change.",
          "Do not regenerate unchanged wiki pages.",
        );
      } else if (!scope.projectMdChanged) {
        lines.push(
          "BUILD SCOPE: project.md has NOT changed since last build.",
          "Only process COMMENT/FEEDBACK markers and refresh dated wiki pages.",
          "Do not regenerate wiki pages that have no pending markers.",
        );
      }

      if (scope.feedbackMarkers.length > 0) {
        lines.push("", `COMMENT/FEEDBACK markers found in: ${scope.feedbackMarkers.join(", ")}`, "Apply feedback to these files only.");
      }

    }

    return lines.join("\n");
  }

  /** @deprecated Use createSynthesisPrompt — wiki-only is now the default and only mode. */
  function createWikiOnlyPrompt(project, scope) {
    return createSynthesisPrompt(project, scope);
  }

  async function createFilePrompt(project, outputFile, sourceMap) {
    const fileMapping = sourceMap[outputFile] || { wikiPages: [], digestFiles: [] };
    const lines = [
      `Build the report: ${outputFile}`,
      "",
      `Follow ${path.join(FRAMEWORK_ROOT, "commands/do_build_file.md")} exactly.`,
      "This is a non-interactive web-triggered build. Never ask the user for confirmation or wait for input mid-run.",
      `Use ${FRAMEWORK_ROOT} as the canonical framework root.`,
      `Project root: ${project.path}`,
      "",
      "REPORT REBUILD: If the output file already exists, read it first.",
      "The existing content represents the user's structural preferences and edits.",
      "Treat user edits as feedback — incorporate their intent but refresh all data-driven content from current wiki and sources.",
      "Preserve the user's structural choices (headings, section order, emphasis) while updating data, claims, and citations.",
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

  /** @deprecated Validation agent removed in two-phase architecture. Evidence checks are now part of wiki synthesis. */
  function createValidationPrompt(_project, _modelId, _rawBuildQuestions = []) {
    throw new Error("createValidationPrompt is deprecated. Validation is folded into wiki synthesis (do_build.md Phase 7).");
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


  async function createArtifactPrompt(project, artifactSpec, resolvedSources, discoveryInventory = [], specHash = null, pendingAnnotations = []) {
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

    // User annotations from previous builds (instruction text only — no element context)
    if (pendingAnnotations.length > 0) {
      lines.push('── USER ANNOTATIONS (incorporate into your design) ──────────', '');
      for (const ann of pendingAnnotations) {
        lines.push(`- ${ann.sectionTitle || ann.sectionId}: "${ann.instruction}"`);
      }
      lines.push('');
    }

    return lines.join("\n");
  }

  /**
   * Build a focused prompt for regenerating a single section of a built HTML artifact.
   *
   * @param {object} params
   * @param {object} params.project - { path, slug, name }
   * @param {object} params.artifactSpec - { frontmatter, body, slug }
   * @param {string} params.sectionId - the id of the section being regenerated
   * @param {string} params.sectionTitle - the heading/title of the section
   * @param {string} params.currentSectionHTML - the current inner HTML of the section
   * @param {string} params.globalStylesheet - the full <style> block contents from <head>
   * @param {Array}  params.otherSections - [{ id, title, snippet }] for context
   * @param {Array}  params.resolvedSources - [{ relativePath, content }]
   * @param {string} params.userInstruction - the user's regeneration instruction
   * @param {Array}  params.cdnDependencies - [string] CDN script/link tags from <head>
   * @param {object} [params.elementContext] - optional targeted element from inspection mode
   * @param {Array}  [params.annotations] - optional batch annotations [{ instruction, elementContext? }]
   */
  async function createSectionRegenerationPrompt({
    project,
    artifactSpec,
    sectionId,
    sectionTitle,
    currentSectionHTML,
    globalStylesheet,
    otherSections,
    resolvedSources,
    userInstruction,
    cdnDependencies,
    elementContext,
    annotations,
  }) {
    const lines = [
      'Regenerate one section of an existing HTML artifact.',
      '',
      `SECTION ID: ${sectionId}`,
      `SECTION TITLE: ${sectionTitle}`,
      '',
    ];

    // Build instructions — supports both single instruction and batch annotations
    // annotations is an optional array of { instruction, elementContext? }
    const instructionItems = annotations && annotations.length > 0
      ? annotations
      : [{ instruction: userInstruction, elementContext }];

    if (instructionItems.length === 1) {
      // Single instruction — classic format
      const item = instructionItems[0];
      lines.push(`USER INSTRUCTION: "${item.instruction}"`, '');

      if (item.elementContext) {
        lines.push(
          '── TARGETED ELEMENT (the user is pointing at this specific element) ──',
          '',
          `Element type: ${item.elementContext.elementTag}`,
        );
        if (item.elementContext.cssPath) lines.push(`Location: ${item.elementContext.cssPath}`);
        if (item.elementContext.elementText) lines.push(`Text content: "${item.elementContext.elementText}"`);
        if (item.elementContext.elementHTML) lines.push('', 'Current HTML:', item.elementContext.elementHTML);
        lines.push('', 'Focus your changes on this element. The user\'s instruction refers to it specifically.', '');
      }
    } else {
      // Multiple instructions — numbered list
      lines.push(`USER INSTRUCTIONS (${instructionItems.length} changes requested):`, '');
      for (let i = 0; i < instructionItems.length; i++) {
        const item = instructionItems[i];
        lines.push(`${i + 1}. "${item.instruction}"`);
        if (item.elementContext) {
          const ctx = item.elementContext;
          const location = [ctx.elementTag, ctx.cssPath].filter(Boolean).join(' at ');
          lines.push(`   TARGETED ELEMENT: ${location}`);
          if (ctx.elementText) lines.push(`   Text: "${ctx.elementText.slice(0, 100)}"`);
        }
        lines.push('');
      }
      lines.push('Apply ALL of the above changes to this section.', '');
    }

    // Artifact goal / spec body
    if (artifactSpec.body) {
      lines.push(
        '── ARTIFACT GOAL ──────────────────────────────────────────',
        '',
        artifactSpec.body,
        '',
      );
    }

    // Current section HTML
    lines.push(
      '── CURRENT SECTION HTML (modify as instructed) ──────────────',
      '',
      currentSectionHTML,
      '',
    );

    // Adjacent section summaries
    if (otherSections.length > 0) {
      lines.push(
        '── OTHER SECTIONS (for context — do not reproduce these) ──',
        '',
      );
      for (const section of otherSections) {
        lines.push(`- ${section.id}: "${section.snippet}"`);
      }
      lines.push('');
    }

    // Available section IDs for cross-links
    const allSectionIds = [sectionId, ...otherSections.map(s => s.id)];
    lines.push(
      '── AVAILABLE SECTION IDs (for internal links) ──────────────',
      allSectionIds.join(', '),
      '',
    );

    // CDN dependencies
    if (cdnDependencies.length > 0) {
      lines.push(
        '── CDN DEPENDENCIES LOADED ──────────────────────────────',
        ...cdnDependencies,
        '',
      );
    } else {
      lines.push(
        '── CDN DEPENDENCIES LOADED ──────────────────────────────',
        'No CDN libraries loaded. Use inline SVG or vanilla JS only.',
        '',
      );
    }

    // Global stylesheet
    lines.push(
      '── GLOBAL STYLESHEET (use classes from this stylesheet) ──',
      '',
      globalStylesheet,
      '',
    );

    // Source data
    if (resolvedSources.length > 0) {
      lines.push(
        '── SOURCE DATA (factual context for data-driven content) ──',
        '',
      );
      for (const source of resolvedSources) {
        const content = source.content.length > 3000
          ? source.content.slice(0, 3000) + '\n\n[... truncated ...]'
          : source.content;
        lines.push(`── ${source.relativePath} ──`, '', content, '');
      }
    }

    // Design identity
    lines.push(
      '── DESIGN IDENTITY ──────────────────────────────────────────',
      '',
    );
    try {
      const designIdentity = await fs.readFile(path.join(project.path, 'human_design_identity.md'), 'utf8');
      lines.push(designIdentity.slice(0, 3000));
    } catch {
      lines.push('No human_design_identity.md found. Use a clean, professional design.');
    }

    // Output rules
    lines.push(
      '',
      '── OUTPUT RULES ──────────────────────────────────────────',
      '- Output the inner HTML for this section.',
      '- Do NOT include <section>, </section>, <html>, <head>, or <body> wrapper tags.',
      '- Never include the literal string </section> anywhere in your output —',
      '  not in code comments, JS strings, SVG text, or HTML content.',
      `- You MAY include <style> blocks scoped with [data-section-id="${sectionId}"] for new CSS classes.`,
      '  For element-level overrides, also use the scoping prefix:',
      `    [data-section-id="${sectionId}"] h2 { font-size: 2rem; }`,
      '- You MAY include <script> blocks wrapped in an IIFE for new JavaScript.',
      '- Use CSS classes from the global stylesheet where applicable.',
      `- Prefix any element IDs with the section ID to avoid collisions (e.g., "${sectionId}-chart" instead of "chart").`,
      '- Keep the same data and factual content unless the user instruction says otherwise.',
      '- If the user asks to update data, use the SOURCE DATA above — do not invent numbers.',
    );

    return lines.join('\n');
  }

  return {
    createArtifactPrompt,
    createAutoAnswerPrompt,
    createFilePrompt,
    createProposeOutputArtifactsPrompt,
    createResearchPrompt,
    createSectionRegenerationPrompt,
    createSynthesisPrompt,
    createValidationPrompt, // deprecated — throws if called
    createWikiOnlyPrompt, // deprecated — delegates to createSynthesisPrompt
    createWikiPagePrompt,
  };
}
