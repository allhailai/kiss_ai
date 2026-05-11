const maxContextRefs = 20;
const maxActiveFiles = 10;

function trimText(value, maxLength) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function truncateText(value, maxLength) {
  const text = String(value ?? "");
  return maxLength === Infinity ? text : text.slice(0, maxLength);
}

export function normalizeContextRef(value) {
  const source = value && typeof value === "object" ? value : {};
  const filePath = trimText(source.path, 300);
  if (!filePath) return null;

  return {
    path: filePath,
    label: trimText(source.label, 160) || undefined,
    kind: trimText(source.kind, 40) || undefined,
  };
}

export function normalizeActiveFile(value, { maxDraftContentLength = Infinity } = {}) {
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
  return normalizeActiveFile(value, options);
}

export function normalizeChatContext(value, options = {}) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const currentFile = normalizeCurrentFile(source.currentFile, options);
  const editableFileSource = Array.isArray(source.editableFiles) ? source.editableFiles : source.activeFiles;
  const sourceFileSource = Array.isArray(source.sourceFiles) ? source.sourceFiles : source.fileRefs;
  const editableFiles = Array.isArray(editableFileSource)
    ? editableFileSource.map((file) => normalizeActiveFile(file, options)).filter(Boolean).slice(0, maxActiveFiles)
    : [];
  const sourceFiles = Array.isArray(sourceFileSource) ? sourceFileSource.map(normalizeContextRef).filter(Boolean).slice(0, maxContextRefs) : [];

  if (!currentFile && !editableFiles.length && !sourceFiles.length) return undefined;

  return {
    ...(currentFile ? { currentFile } : {}),
    ...(editableFiles.length ? { editableFiles } : {}),
    ...(sourceFiles.length ? { sourceFiles } : {}),
  };
}
