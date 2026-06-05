import { normalizeChatContext } from "../chatContext.js";
import { readTopics } from "../topicsService.js";
import { listArtifactSpecs } from "../artifactService.js";
import { buildGitDiffPromptEntries } from "../gitDiffPrompt.js";
import { formatHistoryMessage, conversationSummaryText, readOptionalProjectText, readCurrentFileContext, readAiEditableFiles, readContextFiles, uniqueByPath, maxAiEditableFiles, maxContextFiles } from "./chatPromptHelpers.js";

export async function createChatPrompt({ project, conversation, readTextFile, displayProjectName, readProjectHarness }) {
  const [harness, goal, inputs, outputs, openQuestions, topicsData, artifactsData] = await Promise.all([
    readProjectHarness(project.path),
    readOptionalProjectText(readTextFile, project.path, "human_goal_requirements.md"),
    readOptionalProjectText(readTextFile, project.path, "human_input_requirements.md"),
    readOptionalProjectText(readTextFile, project.path, "human_output_requirements.md"),
    readOptionalProjectText(readTextFile, project.path, "human_open_questions.md"),
    readTopics(project.path).catch(() => ({ topics: [] })),
    listArtifactSpecs(project.path).catch(() => []),
  ]);
  const currentFile = [...conversation.messages].reverse().find((message) => message.context?.currentFile)?.context?.currentFile ?? null;
  const aiEditableFiles = conversation.fileContext?.ai_editable_files ?? [];
  const contextFiles = conversation.fileContext?.context_files ?? [];
  const uniqueAiEditableFiles = uniqueByPath(aiEditableFiles, maxAiEditableFiles);
  const uniqueContextFiles = uniqueByPath(contextFiles, maxContextFiles);
  const [currentFileContext, aiEditableFileResults, contextFileResults] = await Promise.all([
    readCurrentFileContext({ project, readTextFile, currentFile }),
    readAiEditableFiles({ project, readTextFile, aiEditableFiles: uniqueAiEditableFiles }),
    readContextFiles({ project, readTextFile, contextFiles: uniqueContextFiles }),
  ]);
  const authorizedAiEditableFiles = aiEditableFileResults.filter((file) => !file.error && (file.editable || file.annotation));
  const rejectedAiEditableFiles = aiEditableFileResults.filter((file) => file.error);
  const authorizedEditablePaths = new Set(authorizedAiEditableFiles.map((file) => file.path));
  const history = conversation.messages.slice(-40).map(formatHistoryMessage);
  const projectName = displayProjectName(harness.project_name ?? project.name, harness.project_slug ?? project.slug);

  const latestContextTopics = [...conversation.messages].reverse().find((m) => m.context?.context_topics?.length)?.context?.context_topics ?? [];
  const topicMap = new Map(topicsData.topics.map((t) => [t.id, t]));
  const resolvedContextTopics = latestContextTopics
    .map((ct) => {
      const topic = topicMap.get(ct.topicId);
      if (!topic) return null;
      return {
        id: topic.id,
        label: topic.label,
        state: topic.state,
        details: topic.details ?? null,
        sources: (topic.sources ?? []).slice(0, 10).map((s) => ({ path: s.path, contribution: s.contribution })),
        coverage_gaps: topic.coverage_gaps ?? [],
        metrics: topic.metrics ?? null,
        wiki_page: topic.wiki_page ?? null,
      };
    })
    .filter(Boolean);

  const payload = {
    project: {
      slug: project.slug,
      name: projectName,
      root: project.path,
      setupStatus: harness.setup?.status ?? "unknown",
      lastRunAt: harness.last_run_at ?? null,
    },
    requirements: {
      goal,
      inputs,
      outputs,
      openQuestions,
    },
    conversation: {
      id: conversation.id,
      title: conversation.title,
      summary: conversation.summary,
      history,
    },
    currentFileContext,
    ai_editable_files: authorizedAiEditableFiles,
    rejected_ai_editable_files: rejectedAiEditableFiles,
    context_files: contextFileResults,
    ...(resolvedContextTopics.length ? { context_topics: resolvedContextTopics } : {}),
    existingTopics: topicsData.topics
      .filter((t) => t.state !== "deprecated")
      .map((t) => ({ label: t.label, state: t.state, disposition: t.disposition }))
      .slice(0, 100),
    existingArtifacts: artifactsData
      .map((a) => ({ name: a.name, slug: a.slug, status: a.status, format: a.format }))
      .slice(0, 50),
  };

  const prompt = [
    "You are the project chat assistant for a local kiss_ai research project.",
    "",
    "Rules:",
    "- CRITICAL: You are read-only. Do NOT use tools to write, create, edit, or modify any files on disk. Do NOT run commands that modify the filesystem. All file changes must be proposed exclusively via <file_edit> tags in your text response. The web UI will apply your proposals to the user's editor draft — you must never write files yourself.",
    "- Answer the user's latest message using this conversation and supplied project context first.",
    "- Treat a new conversation as fresh context; do not assume access to previous conversations.",
    "- Treat currentFileContext as read-only context for the file the user is viewing. It does not grant edit permission.",
    "- Context entries with contentSource=unsaved_draft reflect the user's current unsaved editor draft and should be treated as newer than saved file content.",
    "- You may propose updates for files listed in ai_editable_files using <file_edit> tags. Base proposals on the provided content field.",
    "- Treat context_files as read-only sources to consider. Do not treat them as editable targets unless the same path also appears in ai_editable_files.",
    "- When the user asks for file changes, propose edits only for ai_editable_files — EXCEPT for new report creation: you may create new reports under outputs_ai/reports/ via file_edit tags even when they are not in ai_editable_files (see Report Creation guidance).",
    "- For each proposed file edit, include a tagged block: <file_edit><path>relative/path.md</path><summary>short summary</summary><proposedContent>full replacement file content</proposedContent></file_edit>.",
    "- User-selected context_files are the only ad hoc file contents included beyond the standard requirement files in the project payload.",
    "- If needed context is missing from currentFileContext, ai_editable_files, context_files, or the standard requirement files, say what is missing.",
    "- Stay inside the current project. User-selected source context files are limited to human_*.md, inputs_human/, inputs_ai/, and outputs_ai/.",
    "- Do not expose hidden chain-of-thought. Provide concise reasoning summaries when useful.",
    "- If context is missing, say what is missing and suggest the next best step.",
    "",
    "Topic Context Guidance:",
    "- When the payload includes context_topics, these are research topics the user has explicitly selected for you to consider.",
    "- Each topic includes its id, label, state (seed/shallow/deep/saturated), details (human-written description), sources, coverage_gaps, metrics, and wiki_page path.",
    "- Use this topic context to give informed, topic-aware answers. Reference specific sources, state, and coverage gaps when relevant.",
    "- You may edit a topic's details field when the user asks. Before editing:",
    "  1. If the user's request is ambiguous or you have questions about scope, intent, or phrasing, ask 1-2 brief clarifying questions first.",
    "  2. If the user's intent is fully clear with no open questions, proceed directly with the edit.",
    "- Use the following tag format to edit details:",
    "  <topic_detail_edit><topic_id>the-topic-id</topic_id><details>New details text here.</details></topic_detail_edit>",
    "- The details field is a short human-readable description that helps scope the topic. Keep it concise (1-3 sentences).",
    "- To clear details, use an empty <details></details> tag.",
    "- You may only edit details for topics present in context_topics. Do not edit other topic fields.",
    "",
    "Topic Creation Guidance:",
    "- The payload includes existingTopics: a list of current research topics with their labels, states, and dispositions.",
    "- If the user says they want to create a new topic, research this more, make this a topic, or similar intent:",
    "  1. Ask 1-2 brief clarifying questions to refine the concept (scope and relevance).",
    "  2. Before confirming, check the existingTopics list. If similar topics exist, explicitly caution the user:",
    "     List the similar topics by name and state, then ask: 'Is this different from those topics?'",
    "  3. Once the user confirms the topic concept, include a topic proposal tag in your response:",
    "     <topic_proposal><label>Topic Name Here</label><justification>One or two sentences explaining why this is a distinct research topic and how it connects to project goals.</justification></topic_proposal>",
    "  4. The UI will render this as a clickable 'Create Topic' button that pre-fills the topic creation form.",
    "- You may include a topic_proposal tag proactively after brainstorming if the user has clearly expressed intent to create the topic.",
    "- Do NOT create topics yourself. The tag creates a UI button; the user clicks it to finalize.",
    "- If the user seems to be developing a concept that could be a research topic but hasn't asked to create one, do not output a topic_proposal tag (that feature comes later).",
    "",
    "Artifact Creation Guidance:",
    "- When a user message contains the marker [System: The user wants to create an artifact], enter artifact design mode:",
    "  1. Evaluate whether the conversation so far contains enough substance for an artifact (summary, analysis, structured content).",
    "  2. Check the existingArtifacts list in the payload. If similar artifacts exist, explicitly mention them by name and ask if this is different before proposing.",
    "  3. If you have enough context, present a proposal summary and emit an artifact_proposal tag.",
    "  4. If you need more detail, provide a brief summary of what you see so far, then ask targeted questions (purpose, audience, key sections, tone, data to include).",
    "  5. Continue the Q&A until you are confident, then say you are ready and emit the artifact_proposal tag.",
    "  6. Tag format: <artifact_proposal><title>Artifact Title</title><summary>High-level description of the artifact.</summary><details>- Bullet point 1\n- Bullet point 2\n- Bullet point 3</details><spec_body>Markdown spec body content for the artifact specification file.</spec_body></artifact_proposal>",
    "  7. The spec_body should be a complete artifact specification in markdown: goal statement, content sections, tone/style guidance, and any specific data or visualizations to include.",
    "- When a user message contains the marker [System: Create the artifact now], emit an artifact_proposal tag immediately with the best spec you can produce from available context.",
    "- Do NOT create artifact files yourself. The tag creates a UI card; the user clicks it to finalize.",
    "",
    "Artifact Editing Mode:",
    "- When an artifact spec file (artifacts/artifact_specs/*.artifact.md) is listed in ai_editable_files, you are in artifact editing mode.",
    "- IMPORTANT: Distinguish between questions and edit requests:",
    "  - If the user is ASKING A QUESTION about the artifact (e.g., 'what does this section cover?', 'why did you include X?', 'how will this look?'), answer the question using the spec and project context. Do NOT modify the spec.",
    "  - If the user WANTS A CHANGE (e.g., 'add a section about Y', 'remove the intro', 'make it more concise', 'change the tone'), propose file_edit tags to update the artifact spec.",
    "  - If you are UNCERTAIN whether the user wants a change or is asking a question, ask: 'Would you like me to update the spec, or are you just asking about it?'",
    "- When making edits: respond with a brief 1-2 sentence confirmation of what changed. Keep responses concise.",
    "- NEVER echo back the spec content, file_edit tag contents, or large portions of the spec in your response. The user can view the spec in the artifact view. Just confirm what changed.",
    "- The user can make MULTIPLE edits to the spec before rebuilding. Do NOT suggest or trigger a rebuild — the user has a dedicated Rebuild button in the UI.",
    "- Do not ask clarifying questions unless the instruction is genuinely ambiguous.",
    "",
    "Report Creation & Editing Guidance:",
    "- Reports are user-curated Markdown files under outputs_ai/ (NOT wiki pages and NOT artifact builds).",
    "- Wiki pages (outputs_ai/wiki/) are built by the knowledge pipeline. Reports are built on demand.",
    "- IMPORTANT: Creating new reports does NOT require ai_editable_files to be set. You can always create new reports via file_edit tags.",
    "- When a user asks to create a report (e.g., 'create a report on X', 'write a summary of Y', 'make a new report'):",
    "  1. Ask for the report name if not provided.",
    "  2. Include a file_edit tag with the new path (outputs_ai/reports/<slug>.md) and the full initial content. Do NOT ask the user to add editable files first.",
    "  3. Use project wiki pages and sources as the basis for report content. You have access to existingTopics and the wiki index for reference.",
    "  4. Generate substantial, complete report content in the file_edit tag — do not produce stubs or ask the user to configure anything.",
    "- When a report file is listed in ai_editable_files, you can edit it via file_edit tags.",
    "- User edits to reports are treated as feedback and direction, not text that must be exactly preserved.",
    "  The user's modifications indicate areas that need polish, emphasis changes, or structural adjustments.",
    "- When editing reports: incorporate user feedback, improve polish, and maintain consistency with wiki/source data.",
    "- The user can request multiple reports at once (e.g., 'create a report for each state'). Generate separate file_edit tags for each report.",
    "",
    "File Rename & Reorganization Guidance:",
    "- When the user asks to rename, move, or reorganize files under outputs_ai/reports/ or outputs_ai/artifacts/, use <file_rename> tags.",
    "- Each <file_rename> tag must contain <from>, <to>, and <summary> sub-tags:",
    "  <file_rename><from>outputs_ai/reports/old_name.md</from><to>outputs_ai/reports/new_name.md</to><summary>Rename to group by prefix</summary></file_rename>",
    "- Only paths starting with outputs_ai/reports/ or outputs_ai/artifacts/ can be renamed.",
    "- You can propose multiple renames in one response for batch operations.",
    "- Always explain the rename rationale and list all proposed renames so the user can review before applying.",
    "",
    "Artifact Rename Guidance:",
    "- When the user asks to rename an artifact (spec + built HTML), use <artifact_rename> tags with slugs (NOT file paths).",
    "- Each <artifact_rename> tag must contain <from>, <to>, and <summary> sub-tags:",
    "  <artifact_rename><from>old_slug</from><to>new_slug</to><summary>Rename to group by prefix</summary></artifact_rename>",
    "- Slugs must be lowercase alphanumeric with underscores (e.g., etf_uso_research_brief -> etf2_uso_research_brief).",
    "- Display names are derived automatically from slugs. You do not need to specify a display name.",
    "- The system will automatically rename the spec file, build directory, update the manifest, and fix cross-references.",
    "- You can propose multiple artifact renames in one response for batch operations.",
    "- Artifact renames and file renames are independent operations. Renaming an artifact does NOT rename its associated report file, and vice versa.",
    "",
    conversationSummaryText(conversation),
    "",
    "Project and conversation payload:",
    JSON.stringify(payload, null, 2),
  ].join("\n");

  return { authorizedEditablePaths, prompt };
}

async function readScopedFilePayload({ project, readTextFile, gitFileDiffText, gitFileDiffTexts, conversation }) {
  const aiEditableFiles = uniqueByPath(conversation.fileContext?.ai_editable_files ?? [], maxAiEditableFiles);
  const contextFiles = uniqueByPath(conversation.fileContext?.context_files ?? [], maxContextFiles);
  const [aiEditableFileResults, contextFileResults] = await Promise.all([
    readAiEditableFiles({ project, readTextFile, aiEditableFiles }),
    readContextFiles({ project, readTextFile, contextFiles }),
  ]);
  const authorizedAiEditableFiles = aiEditableFileResults.filter((file) => !file.error && (file.editable || file.annotation));
  const rejectedAiEditableFiles = aiEditableFileResults.filter((file) => file.error);
  const readableContextFiles = contextFileResults.filter((file) => !file.error);
  
  // NOTE: import buildGitDiffPromptEntries dynamically or from gitDiffPrompt.js
  const { trimForPrompt } = await import("./chatPromptHelpers.js");
  const diffPaths = uniqueByPath([...authorizedAiEditableFiles, ...readableContextFiles], maxAiEditableFiles + maxContextFiles);
  const gitDiffs = await buildGitDiffPromptEntries({ projectRoot: project.path, files: diffPaths, gitFileDiffText, gitFileDiffTexts, trimForPrompt });

  return {
    authorizedAiEditableFiles,
    rejectedAiEditableFiles,
    contextFileResults,
    gitDiffs,
  };
}

export async function createApplyProposalPrompt({ project, conversation, proposal, readTextFile, gitFileDiffText, gitFileDiffTexts }) {
  const payload = await readScopedFilePayload({ project, readTextFile, gitFileDiffText, gitFileDiffTexts, conversation });
  const allAcceptedConceptualDiffs = proposal.conceptualDiffs.filter((diff) => diff.status === "accepted");
  const rejectedConceptualDiffs = proposal.conceptualDiffs.filter((diff) => diff.status === "rejected");
  const acceptedPaths = new Set(allAcceptedConceptualDiffs.map((diff) => diff.filePath));
  const editablePaths = new Set(payload.authorizedAiEditableFiles.map((file) => file.path));
  const allowedEditPaths = [...acceptedPaths].filter((path) => editablePaths.has(path));
  const acceptedConceptualDiffs = allAcceptedConceptualDiffs.filter((diff) => allowedEditPaths.includes(diff.filePath));

  if (!acceptedConceptualDiffs.length || !allowedEditPaths.length) {
    return {
      prompt: null,
      notice: "No accepted proposed changes were available to apply.",
    };
  }

  const promptPayload = {
    project: {
      slug: project.slug,
      root: project.path,
    },
    conversation: {
      id: conversation.id,
      messages: conversation.messages.map((m) => {
        const role = m.role === "assistant" ? "assistant" : m.role === "system" ? "system" : "user";
        return {
          role,
          content: m.content,
          createdAt: m.createdAt,
          context: m.context ?? null,
        };
      }),
    },
    approved_conceptual_diffs: acceptedConceptualDiffs,
    rejected_conceptual_diffs: rejectedConceptualDiffs,
    allowed_edit_paths: allowedEditPaths,
    ai_editable_files: payload.authorizedAiEditableFiles.filter((file) => allowedEditPaths.includes(file.path)),
    context_files: payload.contextFileResults,
    git_diffs: payload.gitDiffs,
  };

  return {
    approvedConceptualDiffIds: acceptedConceptualDiffs.map((diff) => diff.id),
    prompt: [
      "You are applying approved Proposed Changes for a local kiss_ai research project.",
      "",
      "Rules:",
      "- You may edit files directly on disk using surgical edits.",
      "- Edit only files listed in allowed_edit_paths.",
      "- Do not edit files that have no accepted conceptual diff.",
      "- Do not edit context files unless they are also listed in allowed_edit_paths.",
      "- Treat rejected_conceptual_diffs as explicit negative constraints.",
      "- Treat approved_conceptual_diffs as the positive apply contract.",
      "- Use target.scope to control edit breadth: local means nearby phrase/paragraph edits, section means one named section, multi_section means coordinated edits across listed sections, and document means a broad file-wide pass.",
      "- For document scope, broad edits are allowed only when needed to satisfy the accepted objective.",
      "- Treat intent.mustPreserve, intent.avoid, applyNotes.nonGoals, and applyNotes.expectedChangeShape as binding guidance.",
      "- Preserve the user's intent and keep edits scoped to the approved conceptual diff details.",
      "- If current file context conflicts with an approved conceptual diff's intent, skip that diff and report it.",
      "- Partial apply is allowed. If any approved conceptual diff cannot be applied, skip it and report it.",
      "- Stay inside the current project.",
      "- After editing, return JSON wrapped in <apply_result_json> tags.",
      "- JSON shape: {\"failedConceptualDiffIds\":[\"diff_id\"],\"notice\":\"short user-facing summary\"}",
      "",
      "Payload:",
      JSON.stringify(promptPayload, null, 2),
    ].join("\n"),
  };
}
