const maxContextFiles = 20;
const maxAiEditableFiles = 10;

function trimText(value, maxLength) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function truncateText(value, maxLength) {
  const text = String(value ?? "");
  return maxLength === Infinity ? text : text.slice(0, maxLength);
}

export function normalizeContextFile(value) {
  const source = value && typeof value === "object" ? value : {};
  const filePath = trimText(source.path, 300);
  if (!filePath) return null;

  return {
    path: filePath,
    label: trimText(source.label, 160) || undefined,
    kind: trimText(source.kind, 40) || undefined,
  };
}

export function normalizeAiEditableFile(value, { maxDraftContentLength = Infinity } = {}) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const filePath = trimText(source.path, 300);
  if (!filePath) return null;
  const draftContent =
    typeof source.draftContent === "string"
      ? truncateText(source.draftContent, maxDraftContentLength)
      : undefined;

  return {
    path: filePath,
    label: trimText(source.label, 160) || undefined,
    kind: trimText(source.kind, 40) || undefined,
    editable: typeof source.editable === "boolean" ? source.editable : undefined,
    annotation: typeof source.annotation === "boolean" ? source.annotation : undefined,
    contentHash: trimText(source.contentHash, 160) || undefined,
    draftContent,
    draftState: ["saved", "unsaved", "unknown"].includes(source.draftState) ? source.draftState : "unknown",
    role: source.role === "primary" || source.role === "secondary" ? source.role : undefined,
  };
}

export function normalizeCurrentFile(value, options = {}) {
  return normalizeAiEditableFile(value, options);
}

export function normalizeChatContext(value, options = {}) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const currentFile = normalizeCurrentFile(source.currentFile, options);
  const aiEditableFileSource = source.ai_editable_files;
  const contextFileSource = source.context_files;
  const aiEditableFiles = Array.isArray(aiEditableFileSource)
    ? aiEditableFileSource.map((file) => normalizeAiEditableFile(file, options)).filter(Boolean).slice(0, maxAiEditableFiles)
    : [];
  const contextFiles = Array.isArray(contextFileSource) ? contextFileSource.map(normalizeContextFile).filter(Boolean).slice(0, maxContextFiles) : [];

  if (!currentFile && !aiEditableFiles.length && !contextFiles.length) return undefined;

  return {
    ...(currentFile ? { currentFile } : {}),
    ...(aiEditableFiles.length ? { ai_editable_files: aiEditableFiles } : {}),
    ...(contextFiles.length ? { context_files: contextFiles } : {}),
  };
}

export function normalizeConversationFileContext(value, options = {}) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const aiEditableFileSource = source.ai_editable_files;
  const contextFileSource = source.context_files;
  const aiEditableFiles = Array.isArray(aiEditableFileSource)
    ? aiEditableFileSource.map((file) => normalizeAiEditableFile(file, options)).filter(Boolean).slice(0, maxAiEditableFiles)
    : [];
  const contextFiles = Array.isArray(contextFileSource) ? contextFileSource.map(normalizeContextFile).filter(Boolean).slice(0, maxContextFiles) : [];

  return {
    ai_editable_files: aiEditableFiles,
    context_files: contextFiles,
  };
}
