import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { AgentContextFile, ChatContextFile, FileContent, ProjectFile } from "../../contracts/api";
import { fileBasename, projectFileDisplayName } from "../../domain/files";

function contextFileFromProjectFile(file: ProjectFile): ChatContextFile {
  return {
    path: file.path,
    label: projectFileDisplayName(file),
    kind: file.kind,
  };
}

function editableTargetFromProjectFile(file: ProjectFile, selected: FileContent | null, draft: string): AgentContextFile {
  const selectedFile = selected?.path === file.path ? selected : null;
  const draftState = selectedFile ? (draft !== selectedFile.content ? "unsaved" : "saved") : "unknown";
  return {
    path: file.path,
    label: projectFileDisplayName(file),
    kind: file.kind,
    editable: file.editable,
    annotation: file.annotation,
    contentHash: selectedFile?.contentHash,
    ...(draftState === "unsaved" ? { draftContent: draft } : {}),
    draftState,
    role: "primary",
  };
}

function editableSelectionFromProjectFile(file: ProjectFile): AgentContextFile {
  return {
    path: file.path,
    label: projectFileDisplayName(file),
    kind: file.kind,
    editable: file.editable,
    annotation: file.annotation,
    role: "primary",
  };
}

function enrichEditableTarget(file: AgentContextFile, projectFiles: ProjectFile[], selected: FileContent | null, draft: string): AgentContextFile {
  const projectFile = projectFiles.find((candidate) => candidate.path === file.path);
  if (selected?.path === file.path) {
    return editableTargetFromProjectFile(
      {
        path: selected.path,
        name: projectFile ? projectFileDisplayName(projectFile) : file.label ?? fileBasename(selected.path),
        kind: selected.kind,
        editable: selected.editable,
        annotation: selected.annotation,
      },
      selected,
      draft,
    );
  }

  return {
    ...file,
    label: file.label ?? (projectFile ? projectFileDisplayName(projectFile) : fileBasename(file.path)),
    kind: file.kind ?? projectFile?.kind,
    editable: file.editable ?? projectFile?.editable,
    annotation: file.annotation ?? projectFile?.annotation,
    draftState: file.draftState ?? "unknown",
  };
}

export function makeEditableTargetForFile(selected: FileContent, draft: string): AgentContextFile {
  return {
    path: selected.path,
    label: fileBasename(selected.path),
    kind: selected.kind,
    editable: selected.editable,
    annotation: selected.annotation,
    contentHash: selected.contentHash,
    ...(draft !== selected.content ? { draftContent: draft } : {}),
    draftState: draft !== selected.content ? "unsaved" : "saved",
    role: "primary",
  };
}

function currentFileFromSelectedFile(selected: FileContent | null, draft: string): AgentContextFile | null {
  if (!selected) return null;

  return makeEditableTargetForFile(selected, draft);
}

export function useAgentFileContext({
  aiEditableFiles,
  contextFiles,
  draft,
  openProjectFile,
  projectFiles,
  projectSlug,
  selected,
  setAiEditableFiles,
  setContextFiles,
}: {
  aiEditableFiles: AgentContextFile[];
  contextFiles: ChatContextFile[];
  draft: string;
  openProjectFile: (path: string) => void;
  projectFiles: ProjectFile[];
  projectSlug: string | null;
  selected: FileContent | null;
  setAiEditableFiles: Dispatch<SetStateAction<AgentContextFile[]>>;
  setContextFiles: Dispatch<SetStateAction<ChatContextFile[]>>;
}) {
  const [highlightedContext, setHighlightedContext] = useState<{ path: string; target: "editable" | "context" } | null>(null);
  const highlightTimeoutRef = useRef<number | null>(null);
  const currentFile = useMemo(() => currentFileFromSelectedFile(selected, draft), [draft, selected]);
  const enrichedAiEditableFiles = useMemo(
    () => aiEditableFiles.map((file) => enrichEditableTarget(file, projectFiles, selected, draft)),
    [aiEditableFiles, draft, projectFiles, selected],
  );

  const setHighlight = (path: string, target: "editable" | "context") => {
    setHighlightedContext({ path, target });
    if (highlightTimeoutRef.current) window.clearTimeout(highlightTimeoutRef.current);
    highlightTimeoutRef.current = window.setTimeout(() => {
      setHighlightedContext(null);
      highlightTimeoutRef.current = null;
    }, 1400);
  };

  const showFileChooser = (path: string, enabled: boolean) => {
    if (!enabled) return;
    if (aiEditableFiles.some((file) => file.path === path)) {
      setHighlight(path, "editable");
      return;
    }
    if (contextFiles.some((file) => file.path === path)) {
      setHighlight(path, "context");
      return;
    }
  };

  const openProjectFileWithAgentContext = (path: string, enabled: boolean) => {
    openProjectFile(path);
    showFileChooser(path, enabled);
  };

  const addEditableFile = (path: string) => {
    const file = projectFiles.find((candidate) => candidate.path === path);
    // Fall back to the currently selected file (handles artifact specs and other
    // files loaded via selectFile but not in the tree-based projectFiles array).
    const resolvedFile = file ?? (selected?.path === path ? {
      path: selected.path,
      name: fileBasename(selected.path),
      kind: selected.kind,
      editable: selected.editable,
      annotation: selected.annotation,
    } : null);
    if (!resolvedFile?.editable) return;
    const editableFile = editableSelectionFromProjectFile(resolvedFile);
    setAiEditableFiles((current) => {
      if (current.some((candidate) => candidate.path === editableFile.path)) return current;
      return [...current, editableFile];
    });
    setHighlight(path, "editable");
  };

  const addContextFile = (path: string) => {
    const file = projectFiles.find((candidate) => candidate.path === path);
    const resolvedFile = file ?? (selected?.path === path ? {
      path: selected.path,
      name: fileBasename(selected.path),
      kind: selected.kind,
      chatContextReadable: true,
    } : null);
    if (!resolvedFile?.chatContextReadable) return;
    const contextFile = contextFileFromProjectFile(resolvedFile as ProjectFile);
    setContextFiles((current) => {
      if (current.some((candidate) => candidate.path === contextFile.path)) return current;
      return [...current, contextFile];
    });
    setHighlight(path, "context");
  };

  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current) window.clearTimeout(highlightTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    setHighlightedContext(null);
  }, [projectSlug]);

  return {
    addEditableFile,
    addContextFile,
    currentFile,
    aiEditableFiles: enrichedAiEditableFiles,
    contextFiles,
    highlightedContext,
    openProjectFileWithAgentContext,
    removeAiEditableFile: (path: string) => setAiEditableFiles((current) => current.filter((file) => file.path !== path)),
    setContextFiles,
  };
}
