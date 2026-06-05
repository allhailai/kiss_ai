import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { MAX_STORED_MESSAGE_BYTES, MAX_USER_MESSAGE_BYTES } from "../contracts/chatLimits.js";
import {
  activeRejectionRecords,
  annotateConceptualDiffsWithMemory,
  buildRejectionMemoryPromptContext,
  emptyConceptualDiffMemory,
  filterSuppressedConceptualDiffs,
  normalizeConceptualDiffMemoryFile,
  updateConceptualDiffRejectionMemory,
} from "./conceptualDiffMemory.js";
import { extractApplyResultFromText, extractConceptualDiffsFromText, firstTagContent } from "./conceptualDiffs.js";
import { normalizeChatContext } from "./chatContext.js";
import { prepareCursorAgentRun } from "./cursorAgentRun.js";
import { buildGitDiffPromptEntries } from "./gitDiffPrompt.js";
import { readTopics, updateTopic } from "./topicsService.js";
import { listArtifactSpecs } from "./artifactService.js";

const maxPromptFileBytes = 24 * 1024;
const maxPromptHistoryMessages = 40;
const maxContextFiles = 20;
const maxAiEditableFiles = 10;
const conceptualDiffMemoryPath = ".conceptual-diff-memory.json";


function nowIso() {
  return new Date().toISOString();
}

function createMessageId() {
  return `msg_${randomUUID().replaceAll("-", "").slice(0, 18)}`;
}

function trimForPrompt(value, maxBytes = maxPromptFileBytes) {
  const text = String(value ?? "");
  if (Buffer.byteLength(text, "utf8") <= maxBytes) return text;
  return `${text.slice(0, maxBytes)}\n\n[Truncated for prompt size.]`;
}

function hashText(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function requireSendRequest(body, httpError) {
  const modelId = String(body?.modelId ?? "").trim();
  const content = String(body?.content ?? "").trim();
  const context = normalizeChatContext(body?.context, { maxDraftContentLength: 120_000 });

  if (!modelId) throw httpError("Chat requires a model.");
  if (!content) throw httpError("Chat requires a message.");
  if (Buffer.byteLength(content, "utf8") > MAX_USER_MESSAGE_BYTES) {
    throw httpError("Chat message is too large.", 413, "chat_message_too_large");
  }

  return {
    modelId,
    content,
    context,
  };
}

function requireEditRequest(body, httpError) {
  const modelId = String(body?.modelId ?? "").trim();
  const content = String(body?.content ?? "").trim();

  if (!content) throw httpError("Chat requires a message.");
  if (Buffer.byteLength(content, "utf8") > MAX_USER_MESSAGE_BYTES) {
    throw httpError("Chat message is too large.", 413, "chat_message_too_large");
  }

  return {
    modelId: modelId || undefined,
    content,
  };
}



function conversationSummaryText(conversation) {
  return conversation.summary ? `Conversation summary: ${conversation.summary}` : "Conversation summary: not generated yet.";
}

function formatHistoryMessage(message) {
  const role = message.role === "assistant" ? "assistant" : message.role === "system" ? "system" : "user";
  return {
    role,
    content: message.content,
    createdAt: message.createdAt,
    context: message.context ?? null,
  };
}

async function readOptionalProjectText(readTextFile, projectRoot, relativePath, maxBytes = maxPromptFileBytes) {
  try {
    const file = await readTextFile(projectRoot, relativePath);
    return trimForPrompt(file.content, maxBytes);
  } catch {
    return "";
  }
}

function uniqueByPath(files, limit) {
  return [...new Map(files.filter((file) => file?.path).map((file) => [file.path, file])).values()].slice(-limit);
}

async function readContextFiles({ project, readTextFile, contextFiles }) {
  return await Promise.all(contextFiles.map(async (contextFile) => {
    try {
      const file = await readTextFile(project.path, contextFile.path);
      if (!/^human_[^/]+\.md$/i.test(file.path) && !file.path.startsWith("inputs_human/") && !file.path.startsWith("inputs_ai/") && !file.path.startsWith("outputs_ai/")) {
        return {
          path: contextFile.path,
          error: "This path is outside the chat context allowlist.",
        };
      }

      return {
        path: file.path,
        label: contextFile.label || file.path,
        kind: file.kind,
        contentHash: file.contentHash,
        intent: "source",
        content: trimForPrompt(file.content),
      };
    } catch (error) {
      return {
        path: contextFile.path,
        error: error instanceof Error ? error.message : "Could not read file context.",
      };
    }
  }));
}

async function readAiEditableFiles({ project, readTextFile, aiEditableFiles }) {
  return await Promise.all(aiEditableFiles.map(async (editableFile) => {
    try {
      const file = await readTextFile(project.path, editableFile.path);
      if (!file.editable && !file.annotation) {
        return {
          path: file.path,
          label: editableFile.label || file.path,
          intent: "editable_target",
          error: "This path is not writable in the lab UI.",
        };
      }

      const expectedHash = typeof editableFile.contentHash === "string" && editableFile.contentHash ? editableFile.contentHash : null;
      const hasUnsavedDraft = editableFile.draftState === "unsaved" && typeof editableFile.draftContent === "string";
      return {
        path: file.path,
        label: editableFile.label || file.path,
        kind: file.kind,
        editable: file.editable,
        annotation: file.annotation,
        expectedContentHash: expectedHash,
        contentHash: file.contentHash,
        hashStatus: expectedHash ? (expectedHash === file.contentHash ? "matched" : "changed") : "missing_hash",
        draftState: editableFile.draftState ?? "unknown",
        role: editableFile.role ?? "secondary",
        intent: "editable_target",
        contentSource: hasUnsavedDraft ? "unsaved_draft" : "saved_file",
        content: trimForPrompt(hasUnsavedDraft ? editableFile.draftContent : file.content),
      };
    } catch (error) {
      return {
        path: editableFile.path,
        label: editableFile.label || editableFile.path,
        intent: "editable_target",
        error: error instanceof Error ? error.message : "Could not read AI editable file context.",
      };
    }
  }));
}

async function readCurrentFileContext({ project, readTextFile, currentFile }) {
  if (!currentFile?.path) return null;

  try {
    const file = await readTextFile(project.path, currentFile.path);
    const expectedHash = typeof currentFile.contentHash === "string" && currentFile.contentHash ? currentFile.contentHash : null;
    const hasUnsavedDraft = currentFile.draftState === "unsaved" && typeof currentFile.draftContent === "string";

    return {
      path: file.path,
      label: currentFile.label || file.path,
      kind: file.kind,
      editable: file.editable,
      annotation: file.annotation,
      expectedContentHash: expectedHash,
      contentHash: file.contentHash,
      hashStatus: expectedHash ? (expectedHash === file.contentHash ? "matched" : "changed") : "missing_hash",
      draftState: currentFile.draftState ?? "unknown",
      role: currentFile.role ?? "primary",
      intent: "current_file_context",
      editableIntent: false,
      contentSource: hasUnsavedDraft ? "unsaved_draft" : "saved_file",
      content: trimForPrompt(hasUnsavedDraft ? currentFile.draftContent : file.content),
    };
  } catch (error) {
    return {
      path: currentFile.path,
      label: currentFile.label || currentFile.path,
      intent: "current_file_context",
      editableIntent: false,
      error: error instanceof Error ? error.message : "Could not read current file context.",
    };
  }
}

async function createChatPrompt({ project, conversation, readTextFile, displayProjectName, readProjectHarness }) {
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
  const history = conversation.messages.slice(-maxPromptHistoryMessages).map(formatHistoryMessage);
  const projectName = displayProjectName(harness.project_name ?? project.name, harness.project_slug ?? project.slug);

  // Resolve context_topics from the latest user message context
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

function summarizeAssistantText(text) {
  const compact = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!compact) return "";
  return compact.length > 240 ? `${compact.slice(0, 237)}...` : compact;
}

function allTagContent(text, tagName) {
  const pattern = new RegExp(`<${tagName}>\\s*([\\s\\S]*?)\\s*<\\/${tagName}>`, "gi");
  return [...String(text ?? "").matchAll(pattern)].map((match) => match[1]?.trim() ?? "");
}

function createProposalId() {
  return `proposal_${randomUUID().replaceAll("-", "").slice(0, 18)}`;
}

export function extractConceptualDiffs(rawText, authorizedEditablePaths) {
  return extractConceptualDiffsFromText(rawText, "edit_proposal_json", authorizedEditablePaths);
}

export function extractApplyResult(rawText, allowedFailedIds = null) {
  return extractApplyResultFromText(rawText, "apply_result_json", allowedFailedIds);
}

function proposalNotice(conceptualDiffs) {
  if (!conceptualDiffs.length) return "No proposed changes were generated.";
  return `Generated ${conceptualDiffs.length} proposed change${conceptualDiffs.length === 1 ? "" : "s"}.`;
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
  const diffPaths = uniqueByPath([...authorizedAiEditableFiles, ...readableContextFiles], maxAiEditableFiles + maxContextFiles);
  const gitDiffs = await buildGitDiffPromptEntries({ projectRoot: project.path, files: diffPaths, gitFileDiffText, gitFileDiffTexts, trimForPrompt });

  return {
    authorizedAiEditableFiles,
    rejectedAiEditableFiles,
    contextFileResults,
    gitDiffs,
  };
}

function currentConversationMessages(conversation) {
  return conversation.messages.map(formatHistoryMessage);
}

function latestUserInstruction(conversation) {
  return [...(conversation.messages ?? [])].reverse().find((message) => message.role === "user" && String(message.content ?? "").trim())?.content ?? "";
}

function editableContentHashByPath(conversation) {
  return new Map((conversation.fileContext?.ai_editable_files ?? []).filter((file) => file?.path && file.contentHash).map((file) => [file.path, file.contentHash]));
}



async function createApplyProposalPrompt({ project, conversation, proposal, readTextFile, gitFileDiffText, gitFileDiffTexts }) {
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
      messages: currentConversationMessages(conversation),
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

export function extractFileEditProposals(rawText, conversation, authorizedEditablePaths = null) {
  const conversationEditableTargets = conversation.fileContext?.ai_editable_files?.length
    ? conversation.fileContext.ai_editable_files
    : conversation.messages.flatMap((message) => message.context?.ai_editable_files ?? []);
  const editableTargets = new Map(
    conversationEditableTargets
      .filter((file) => file?.path)
      .map((file) => [file.path, file]),
  );

  // Paths under these prefixes can be created by the agent even when not in ai_editable_files.
  const creatablePrefixes = ["outputs_ai/reports/"];
  function isCreatablePath(path) {
    return creatablePrefixes.some((prefix) => path.startsWith(prefix));
  }

  return allTagContent(rawText, "file_edit")
    .map((editText) => {
      const path = firstTagContent(editText, "path");
      const proposedContent = firstTagContent(editText, "proposedContent", { trim: false });
      if (!path || !proposedContent) return null;

      const target = editableTargets.get(path);
      const isCreation = !target && isCreatablePath(path);

      // For existing editable files: enforce authorization
      if (!isCreation) {
        if (authorizedEditablePaths && !authorizedEditablePaths.has(path)) return null;
        if (!target) return null;
      }

      return {
        path,
        summary: firstTagContent(editText, "summary") || `Proposed edit for ${path}.`,
        proposedContent,
        contentHashBefore: target?.contentHash ?? null,
        draftStateBefore: target?.draftState ?? null,
        ...(target?.draftState === "unsaved" && typeof target.draftContent === "string"
          ? { draftContentHashBefore: hashText(target.draftContent) }
          : {}),
        status: "proposed",
      };
    })
    .filter(Boolean);
}

/**
 * Extract topic proposals from assistant text.
 * The agent outputs <topic_proposal><label>...</label><justification>...</justification></topic_proposal> tags.
 */
export function extractTopicProposals(rawText) {
  return allTagContent(rawText, "topic_proposal")
    .map((proposalText) => {
      const label = firstTagContent(proposalText, "label");
      const justification = firstTagContent(proposalText, "justification");
      if (!label) return null;
      return { label, justification: justification || "" };
    })
    .filter(Boolean);
}

/**
 * Extract topic detail edits from assistant text.
 * The agent outputs <topic_detail_edit><topic_id>...</topic_id><details>...</details></topic_detail_edit> tags.
 */
export function extractTopicDetailEdits(rawText) {
  return allTagContent(rawText, "topic_detail_edit")
    .map((editText) => {
      const topicId = firstTagContent(editText, "topic_id");
      if (!topicId) return null;
      const details = firstTagContent(editText, "details");
      return { topicId, details: details || null };
    })
    .filter(Boolean);
}

/**
 * Extract artifact proposals from assistant text.
 * The agent outputs <artifact_proposal><title>...</title><summary>...</summary><details>...</details><spec_body>...</spec_body></artifact_proposal> tags.
 */
export function extractArtifactProposals(rawText) {
  return allTagContent(rawText, "artifact_proposal")
    .map((proposalText) => {
      const title = firstTagContent(proposalText, "title");
      const summary = firstTagContent(proposalText, "summary");
      const detailsRaw = firstTagContent(proposalText, "details");
      const specBody = firstTagContent(proposalText, "spec_body");
      if (!title) return null;
      const details = detailsRaw
        ? detailsRaw.split("\n").map((line) => line.replace(/^\s*[-•*]\s*/, "").trim()).filter(Boolean)
        : [];
      return {
        title,
        summary: summary || "",
        details,
        ...(specBody ? { specBody } : {}),
      };
    })
    .filter(Boolean);
}

/**
 * Extract file rename proposals from assistant text.
 * The agent outputs <file_rename><from>...</from><to>...</to><summary>...</summary></file_rename> tags.
 */
const renameablePrefixes = ["outputs_ai/reports/", "outputs_ai/artifacts/"];

export function extractFileRenameProposals(rawText) {
  return allTagContent(rawText, "file_rename")
    .map((renameText) => {
      const from = firstTagContent(renameText, "from");
      const to = firstTagContent(renameText, "to");
      if (!from || !to) return null;

      // Security: only allow renames under known prefixes
      const fromAllowed = renameablePrefixes.some((prefix) => from.startsWith(prefix));
      const toAllowed = renameablePrefixes.some((prefix) => to.startsWith(prefix));
      if (!fromAllowed || !toAllowed) return null;

      if (from === to) return null;

      return {
        from,
        to,
        summary: firstTagContent(renameText, "summary") || `Rename ${from} -> ${to}`,
        status: "proposed",
      };
    })
    .filter(Boolean);
}

/**
 * Extract artifact rename proposals from assistant text.
 * The agent outputs <artifact_rename><from>old_slug</from><to>new_slug</to><summary>...</summary></artifact_rename> tags.
 */
const VALID_SLUG_PATTERN = /^[a-z0-9][a-z0-9_]*$/;

export function extractArtifactRenameProposals(rawText) {
  return allTagContent(rawText, "artifact_rename")
    .map((renameText) => {
      const from = firstTagContent(renameText, "from")?.trim();
      const to = firstTagContent(renameText, "to")?.trim();
      if (!from || !to) return null;
      if (from === to) return null;
      if (!VALID_SLUG_PATTERN.test(from) || !VALID_SLUG_PATTERN.test(to)) return null;

      return {
        from,
        to,
        summary: firstTagContent(renameText, "summary") || `Rename artifact ${from} -> ${to}`,
        status: "proposed",
      };
    })
    .filter(Boolean);
}
export function createChatAgentService({
  appendMessage,
  displayProjectName,
  editUserMessage,
  gitFileDiffText,
  gitFileDiffTexts = null,
  httpError,
  listCursorModels,
  notifyConversation,
  pickRebuildModelId,
  projectAgentLock,
  readConversation,
  readProjectJson,
  readProjectHarness,
  readTextFile,
  resolveCursorApiKey,
  runCursorAgent,
  writeConversation,
  writeProjectJson,
}) {
  const activeChatControllers = new Map();

  function startAssistantGeneration({ project, conversationId, releaseProjectAgent, conversationWithUser, assistantMessageId, cursorApiKey, modelId }) {
    const controller = new AbortController();
    activeChatControllers.set(project.slug, controller);

    void (async () => {
      const assistantTextChunks = [];
      let assistantTextBytes = 0;
      try {
        const { authorizedEditablePaths, prompt } = await createChatPrompt({
          project,
          conversation: conversationWithUser,
          displayProjectName,
          readProjectHarness,
          readTextFile,
        });

        // Snapshot editable files before the agent run so we can restore them
        // after. The Cursor SDK agent has full filesystem write access and may
        // modify files directly despite prompt instructions not to. By reverting
        // any direct writes, we ensure only <file_edit> tags (applied via the UI)
        // can change files.
        const fileSnapshots = new Map();
        if (authorizedEditablePaths.size > 0) {
          for (const relPath of authorizedEditablePaths) {
            const absPath = path.resolve(project.path, relPath);
            try {
              fileSnapshots.set(absPath, await fs.readFile(absPath, "utf8"));
            } catch {
              // File doesn't exist yet — record null so we can delete if agent creates it.
              fileSnapshots.set(absPath, null);
            }
          }
        }

        await runCursorAgent({
          project,
          apiKey: cursorApiKey.apiKey,
          modelId,
          prompt,
          signal: controller.signal,
          onEvent: async (event) => {
            if (event.type !== "assistant_delta" || !event.text) return;
            assistantTextBytes += Buffer.byteLength(event.text, "utf8");
            if (assistantTextBytes > MAX_STORED_MESSAGE_BYTES) {
              throw httpError("Assistant response is too large.", 413, "chat_message_too_large");
            }
            assistantTextChunks.push(event.text);
            notifyConversation(project.slug, conversationId, {
              type: "message_delta",
              conversationId,
              messageId: assistantMessageId,
              delta: event.text,
              updatedAt: nowIso(),
            });
          },
        });

        // Restore snapshotted files — revert any direct writes the agent made.
        for (const [absPath, originalContent] of fileSnapshots) {
          try {
            if (originalContent === null) {
              // File didn't exist before — remove if the agent created it.
              await fs.unlink(absPath).catch(() => {});
            } else {
              const current = await fs.readFile(absPath, "utf8").catch(() => null);
              if (current !== originalContent) {
                await fs.writeFile(absPath, originalContent, "utf8");
              }
            }
          } catch {
            // Best-effort restore — don't fail the entire response.
          }
        }

        const assistantText = assistantTextChunks.join("");
        const fileEdits = extractFileEditProposals(assistantText, conversationWithUser, authorizedEditablePaths);
        const fileRenames = extractFileRenameProposals(assistantText);
        const artifactRenames = extractArtifactRenameProposals(assistantText);
        const topicProposals = extractTopicProposals(assistantText);
        const topicDetailEdits = extractTopicDetailEdits(assistantText);
        const artifactProposals = extractArtifactProposals(assistantText);

        // Apply topic detail edits directly (no user approval needed)
        for (const edit of topicDetailEdits) {
          try {
            await updateTopic(project.path, edit.topicId, { details: edit.details });
          } catch {
            // Best-effort — don't fail the response for a detail edit failure.
          }
        }
        const finalConversation = await appendMessage(project, conversationId, {
          id: assistantMessageId,
          role: "assistant",
          content: assistantText.trim() || "No assistant response was returned.",
          createdAt: nowIso(),
          modelId,
          status: "complete",
          metadata: {
            cursorApiKeySource: cursorApiKey.source,
            ...(fileEdits.length ? { fileEdits } : {}),
            ...(fileRenames.length ? { fileRenames } : {}),
            ...(artifactRenames.length ? { artifactRenames } : {}),
            ...(topicProposals.length ? { topicProposals } : {}),
            ...(artifactProposals.length ? { artifactProposals } : {}),
          },
        });
        const nextConversation =
          finalConversation.summary || !assistantText
            ? finalConversation
            : await writeConversation(project, {
                ...finalConversation,
                summary: summarizeAssistantText(assistantText),
                updatedAt: nowIso(),
              });
        const message = nextConversation.messages.find((candidate) => candidate.id === assistantMessageId) ?? nextConversation.messages.at(-1);

        notifyConversation(project.slug, conversationId, {
          type: "message_complete",
          conversation: nextConversation,
          message,
        });
      } catch (error) {
        const isCancelled = error?.name === "AbortError";
        const assistantText = assistantTextChunks.join("");

        if (isCancelled && assistantText.trim()) {
          // Save partial response on cancellation
          try {
            const partialConversation = await appendMessage(project, conversationId, {
              id: assistantMessageId,
              role: "assistant",
              content: assistantText.trim(),
              createdAt: nowIso(),
              modelId,
              status: "complete",
              metadata: { cancelled: true },
            });
            notifyConversation(project.slug, conversationId, {
              type: "message_complete",
              conversation: partialConversation,
              message: partialConversation.messages.find((m) => m.id === assistantMessageId) ?? partialConversation.messages.at(-1),
            });
          } catch {
            notifyConversation(project.slug, conversationId, {
              type: "error",
              conversationId,
              message: "Chat was cancelled.",
              updatedAt: nowIso(),
            });
          }
        } else if (isCancelled) {
          // No text accumulated — just notify cancellation
          try {
            const cancelledConversation = await appendMessage(project, conversationId, {
              id: assistantMessageId,
              role: "assistant",
              content: "Chat was cancelled.",
              createdAt: nowIso(),
              modelId,
              status: "complete",
              metadata: { cancelled: true },
            });
            notifyConversation(project.slug, conversationId, {
              type: "message_complete",
              conversation: cancelledConversation,
              message: cancelledConversation.messages.at(-1),
            });
          } catch {
            notifyConversation(project.slug, conversationId, {
              type: "error",
              conversationId,
              message: "Chat was cancelled.",
              updatedAt: nowIso(),
            });
          }
        } else {
          const errorMessage = error instanceof Error ? error.message : "Chat failed.";
          try {
            const finalConversation = await appendMessage(project, conversationId, {
              id: assistantMessageId,
              role: "assistant",
              content: errorMessage,
              createdAt: nowIso(),
              modelId,
              status: "error",
            });
            notifyConversation(project.slug, conversationId, {
              type: "message_complete",
              conversation: finalConversation,
              message: finalConversation.messages.at(-1),
            });
          } catch {
            notifyConversation(project.slug, conversationId, {
              type: "error",
              conversationId,
              message: errorMessage,
              updatedAt: nowIso(),
            });
          }
        }
      } finally {
        activeChatControllers.delete(project.slug);
        releaseProjectAgent();
      }
    })();
  }

  async function prepareAgentRun(project, requestedModelId, label) {
    return prepareCursorAgentRun({
      httpError,
      label,
      listCursorModels,
      noApiKeyMessage: "No Cursor API key found. Chat is unavailable from the UI.",
      noModelsMessage: "No Cursor models are available for chat.",
      pickRebuildModelId,
      project,
      projectAgentLock,
      requestedModelId,
      resolveCursorApiKey,
    });
  }

  async function sendChatMessage(project, conversationId, body) {
    const request = requireSendRequest(body, httpError);
    const { cursorApiKey, modelId, releaseProjectAgent } = await prepareAgentRun(project, request.modelId, "chat");

    const userMessage = {
      id: createMessageId(),
      role: "user",
      content: request.content,
      createdAt: nowIso(),
      modelId: null,
      status: "complete",
      context: request.context,
    };
    const assistantMessageId = createMessageId();

    try {
      const conversationWithUser = await appendMessage(project, conversationId, userMessage);
      notifyConversation(project.slug, conversationId, { type: "snapshot", conversation: conversationWithUser });
      startAssistantGeneration({ project, conversationId, releaseProjectAgent, conversationWithUser, assistantMessageId, cursorApiKey, modelId });

      return conversationWithUser;
    } catch (error) {
      releaseProjectAgent();
      throw error;
    }
  }

  async function editChatMessage(project, conversationId, messageId, body) {
    const request = requireEditRequest(body, httpError);
    const { cursorApiKey, modelId, releaseProjectAgent } = await prepareAgentRun(project, request.modelId, "chat");
    const assistantMessageId = createMessageId();

    try {
      const conversationWithUser = await editUserMessage(project, conversationId, messageId, request.content);
      notifyConversation(project.slug, conversationId, { type: "snapshot", conversation: conversationWithUser });
      startAssistantGeneration({ project, conversationId, releaseProjectAgent, conversationWithUser, assistantMessageId, cursorApiKey, modelId });

      return conversationWithUser;
    } catch (error) {
      releaseProjectAgent();
      throw error;
    }
  }



  async function updateEditProposal(project, conversationId, proposalId, body) {
    const conversation = await readConversation(project, conversationId);
    const updates = new Map((body?.conceptualDiffs ?? []).map((diff) => [diff.id, diff.status]));
    const timestamp = nowIso();
    let foundProposal = false;
    const memoryDiffs = [];
    const editProposals = (conversation.editProposals ?? []).map((proposal) => {
      if (proposal.id !== proposalId) return proposal;
      foundProposal = true;
      const conceptualDiffs = proposal.conceptualDiffs.map((diff) => {
        const nextStatus = updates.get(diff.id) === "rejected" ? "rejected" : updates.get(diff.id) === "accepted" ? "accepted" : diff.status;
        if ((nextStatus === "rejected" && diff.status !== "rejected") || (nextStatus === "accepted" && diff.memory?.reconsidersRejectedId)) {
          memoryDiffs.push({ ...diff, status: nextStatus });
        }
        return {
          ...diff,
          status: nextStatus,
        };
      });
      return {
        ...proposal,
        updatedAt: timestamp,
        conceptualDiffs,
      };
    });

    if (!foundProposal) throw httpError("Edit proposal not found.", 404, "edit_proposal_not_found");

    if (memoryDiffs.length) {
      const memory = normalizeConceptualDiffMemoryFile(await readProjectJson(project.path, conceptualDiffMemoryPath, emptyConceptualDiffMemory()));
      await writeProjectJson(project.path, conceptualDiffMemoryPath, updateConceptualDiffRejectionMemory(memory, {
        conceptualDiffs: memoryDiffs,
        flow: "ai_file_assist",
        now: timestamp,
        sourceContentHashByPath: editableContentHashByPath(conversation),
      }));
    }

    const nextConversation = await writeConversation(project, {
      ...conversation,
      editProposals,
      updatedAt: timestamp,
    });
    notifyConversation(project.slug, conversationId, { type: "snapshot", conversation: nextConversation });
    return nextConversation;
  }

  async function applyEditProposal(project, conversationId, proposalId, body) {
    const requestedModelId = String(body?.modelId ?? "").trim();
    if (!requestedModelId) throw httpError("Applying a proposal requires a model.");

    const { cursorApiKey, modelId, releaseProjectAgent } = await prepareAgentRun(project, requestedModelId, "edit_proposal_apply");
    try {
      const conversation = await readConversation(project, conversationId);
      const proposal = (conversation.editProposals ?? []).find((candidate) => candidate.id === proposalId);
      if (!proposal) throw httpError("Edit proposal not found.", 404, "edit_proposal_not_found");

      const applyingAt = nowIso();
      const applyingConversation = await writeConversation(project, {
        ...conversation,
        editProposals: conversation.editProposals.map((candidate) =>
          candidate.id === proposalId ? { ...candidate, status: "applying", updatedAt: applyingAt, appliedAt: undefined } : candidate,
        ),
        updatedAt: applyingAt,
      });
      notifyConversation(project.slug, conversationId, { type: "snapshot", conversation: applyingConversation });

      const applyingProposal = applyingConversation.editProposals.find((candidate) => candidate.id === proposalId);
      const reconsideredAcceptedDiffs = (applyingProposal?.conceptualDiffs ?? []).filter((diff) => diff.status === "accepted" && diff.memory?.reconsidersRejectedId);
      if (reconsideredAcceptedDiffs.length) {
        const memory = normalizeConceptualDiffMemoryFile(await readProjectJson(project.path, conceptualDiffMemoryPath, emptyConceptualDiffMemory()));
        await writeProjectJson(project.path, conceptualDiffMemoryPath, updateConceptualDiffRejectionMemory(memory, {
          conceptualDiffs: reconsideredAcceptedDiffs,
          flow: "ai_file_assist",
          now: applyingAt,
          sourceContentHashByPath: editableContentHashByPath(applyingConversation),
        }));
      }
      const { approvedConceptualDiffIds = [], prompt, notice } = await createApplyProposalPrompt({
        project,
        conversation: applyingConversation,
        gitFileDiffText,
        gitFileDiffTexts,
        proposal: applyingProposal,
        readTextFile,
      });

      if (!prompt) {
        const failedAt = nowIso();
        const failedConversation = await writeConversation(project, {
          ...applyingConversation,
          editProposals: applyingConversation.editProposals.map((candidate) =>
            candidate.id === proposalId ? { ...candidate, status: "failed", notice, updatedAt: failedAt, appliedAt: undefined } : candidate,
          ),
          updatedAt: failedAt,
        });
        notifyConversation(project.slug, conversationId, { type: "snapshot", conversation: failedConversation });
        return failedConversation;
      }

      let assistantText = "";
      const applyController = new AbortController();
      activeChatControllers.set(project.slug, applyController);
      try {
        await runCursorAgent({
          project,
          apiKey: cursorApiKey.apiKey,
          modelId,
          prompt,
          signal: applyController.signal,
          onEvent: async (event) => {
            if (event.type === "assistant_delta" && event.text) assistantText += event.text;
          },
        });
      } finally {
        activeChatControllers.delete(project.slug);
      }

      const applyResult = extractApplyResult(assistantText, approvedConceptualDiffIds);
      const completedAt = nowIso();
      const status = !applyResult.valid ? "failed" : applyResult.failedConceptualDiffIds.length ? "partial" : "applied";
      const completedConversation = await writeConversation(project, {
        ...applyingConversation,
        editProposals: applyingConversation.editProposals.map((candidate) =>
          candidate.id === proposalId
            ? {
                ...candidate,
                status,
                notice:
                  applyResult.notice ||
                  (status === "applied"
                    ? "Applied the approved proposed changes."
                    : status === "partial"
                      ? "Applied some approved proposed changes. Some items need review."
                      : "The apply run did not return a valid result summary. Review the files before trying again."),
                updatedAt: completedAt,
                appliedAt: status === "applied" || status === "partial" ? completedAt : undefined,
              }
            : candidate,
        ),
        updatedAt: completedAt,
      });
      notifyConversation(project.slug, conversationId, { type: "snapshot", conversation: completedConversation });
      return completedConversation;
    } catch (error) {
      try {
        const conversation = await readConversation(project, conversationId);
        const failedAt = nowIso();
        const failedConversation = await writeConversation(project, {
          ...conversation,
          editProposals: (conversation.editProposals ?? []).map((candidate) =>
            candidate.id === proposalId
              ? {
                  ...candidate,
                  status: "failed",
                  notice: error instanceof Error ? error.message : "Could not apply the proposal.",
                  updatedAt: failedAt,
                  appliedAt: undefined,
                }
              : candidate,
          ),
          updatedAt: failedAt,
        });
        notifyConversation(project.slug, conversationId, { type: "snapshot", conversation: failedConversation });
        return failedConversation;
      } catch {
        throw error;
      }
    } finally {
      releaseProjectAgent();
    }
  }

  function cancelChatAgent(projectSlug) {
    const controller = activeChatControllers.get(projectSlug);
    if (!controller) return { ok: true, cancelled: false };
    controller.abort();
    return { ok: true, cancelled: true };
  }

  return { applyEditProposal, cancelChatAgent, editChatMessage, sendChatMessage, updateEditProposal };
}
