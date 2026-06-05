export const maxPromptFileBytes = 24 * 1024;
export const maxPromptHistoryMessages = 40;
export const maxContextFiles = 20;
export const maxAiEditableFiles = 10;

export function trimForPrompt(value, maxBytes = maxPromptFileBytes) {
  const text = String(value ?? "");
  if (Buffer.byteLength(text, "utf8") <= maxBytes) return text;
  return `${text.slice(0, maxBytes)}\n\n[Truncated for prompt size.]`;
}

export function formatHistoryMessage(message) {
  const role = message.role === "assistant" ? "assistant" : message.role === "system" ? "system" : "user";
  return {
    role,
    content: message.content,
    createdAt: message.createdAt,
    context: message.context ?? null,
  };
}

export function conversationSummaryText(conversation) {
  return conversation.summary ? `Conversation summary: ${conversation.summary}` : "Conversation summary: not generated yet.";
}

export async function readOptionalProjectText(readTextFile, projectRoot, relativePath, maxBytes = maxPromptFileBytes) {
  try {
    const file = await readTextFile(projectRoot, relativePath);
    return trimForPrompt(file.content, maxBytes);
  } catch {
    return "";
  }
}

export function uniqueByPath(files, limit) {
  return [...new Map(files.filter((file) => file?.path).map((file) => [file.path, file])).values()].slice(-limit);
}

export async function readContextFiles({ project, readTextFile, contextFiles }) {
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

export async function readAiEditableFiles({ project, readTextFile, aiEditableFiles }) {
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

export async function readCurrentFileContext({ project, readTextFile, currentFile }) {
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
