import { useEffect, useMemo, useRef, useState } from "react";
import type { AgentContextFile, ChatContextFile, FileContent, ProjectFile } from "../../contracts/api";
import { fileBasename } from "../../domain/files";

function contextFileFromProjectFile(file: ProjectFile): ChatContextFile {
  return {
    path: file.path,
    label: file.name || fileBasename(file.path),
    kind: file.kind,
  };
}

function editableTargetFromProjectFile(file: ProjectFile, selected: FileContent | null, draft: string): AgentContextFile {
  const selectedFile = selected?.path === file.path ? selected : null;
  const draftState = selectedFile ? (draft !== selectedFile.content ? "unsaved" : "saved") : "unknown";
  return {
    path: file.path,
    label: file.name || fileBasename(file.path),
    kind: file.kind,
    editable: file.editable,
    annotation: file.annotation,
    contentHash: selectedFile?.contentHash,
    ...(draftState === "unsaved" ? { draftContent: draft } : {}),
    draftState,
    role: "primary",
  };
}

function currentFileFromSelectedFile(selected: FileContent | null, draft: string): AgentContextFile | null {
  if (!selected) return null;

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

export function useAgentFileContext({
  draft,
  openProjectFile,
  projectFiles,
  projectSlug,
  selected,
}: {
  draft: string;
  openProjectFile: (path: string) => void;
  projectFiles: ProjectFile[];
  projectSlug: string | null;
  selected: FileContent | null;
}) {
  const [aiEditableFiles, setAiEditableFiles] = useState<AgentContextFile[]>([]);
  const [contextFiles, setContextFiles] = useState<ChatContextFile[]>([]);
  const [highlightedContext, setHighlightedContext] = useState<{ path: string; target: "editable" | "context" } | null>(null);
  const highlightTimeoutRef = useRef<number | null>(null);
  const currentFile = useMemo(() => currentFileFromSelectedFile(selected, draft), [draft, selected]);

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
    if (!file) return;
    const editableFile = editableTargetFromProjectFile(file, selected, draft);
    setAiEditableFiles((current) => {
      if (current.some((candidate) => candidate.path === editableFile.path)) return current;
      return [...current, editableFile];
    });
    setHighlight(path, "editable");
  };

  const addContextFile = (path: string) => {
    const file = projectFiles.find((candidate) => candidate.path === path);
    if (!file?.chatContextReadable) return;
    const contextFile = contextFileFromProjectFile(file);
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
    setAiEditableFiles([]);
    setContextFiles([]);
    setHighlightedContext(null);
  }, [projectSlug]);

  useEffect(() => {
    setAiEditableFiles((current) =>
      current.map((file) => {
        if (file.path !== selected?.path) return file;
        const projectFile = projectFiles.find((candidate) => candidate.path === selected.path);
        return editableTargetFromProjectFile(
          {
            path: selected.path,
            name: projectFile?.name ?? file.label ?? fileBasename(selected.path),
            kind: selected.kind,
            editable: selected.editable,
            annotation: selected.annotation,
          },
          selected,
          draft,
        );
      }),
    );
  }, [draft, projectFiles, selected]);

  return {
    addEditableFile,
    addContextFile,
    currentFile,
    aiEditableFiles,
    contextFiles,
    highlightedContext,
    openProjectFileWithAgentContext,
    removeAiEditableFile: (path: string) => setAiEditableFiles((current) => current.filter((file) => file.path !== path)),
    setContextFiles,
  };
}
