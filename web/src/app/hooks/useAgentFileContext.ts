import { useEffect, useMemo, useRef, useState } from "react";
import type { AgentContextFile, ChatContextRef, FileContent, ProjectFile } from "../../contracts/api";
import { fileBasename } from "../../domain/files";

function contextRefFromProjectFile(file: ProjectFile): ChatContextRef {
  return {
    path: file.path,
    label: file.name || fileBasename(file.path),
    kind: file.kind,
  };
}

function editableTargetFromProjectFile(file: ProjectFile, selected: FileContent | null, draft: string): AgentContextFile {
  const selectedFile = selected?.path === file.path ? selected : null;
  return {
    path: file.path,
    label: file.name || fileBasename(file.path),
    kind: file.kind,
    editable: file.editable,
    annotation: file.annotation,
    contentHash: selectedFile?.contentHash,
    draftState: selectedFile ? (draft !== selectedFile.content ? "unsaved" : "saved") : "unknown",
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
  const [editableFiles, setEditableFiles] = useState<AgentContextFile[]>([]);
  const [sourceFiles, setSourceFiles] = useState<ChatContextRef[]>([]);
  const [highlightedContext, setHighlightedContext] = useState<{ path: string; target: "active" | "context" } | null>(null);
  const highlightTimeoutRef = useRef<number | null>(null);
  const currentFile = useMemo(() => currentFileFromSelectedFile(selected, draft), [draft, selected]);

  const setHighlight = (path: string, target: "active" | "context") => {
    setHighlightedContext({ path, target });
    if (highlightTimeoutRef.current) window.clearTimeout(highlightTimeoutRef.current);
    highlightTimeoutRef.current = window.setTimeout(() => {
      setHighlightedContext(null);
      highlightTimeoutRef.current = null;
    }, 1400);
  };

  const showFileChooser = (path: string, enabled: boolean) => {
    if (!enabled) return;
    if (editableFiles.some((file) => file.path === path)) {
      setHighlight(path, "active");
      return;
    }
    if (sourceFiles.some((ref) => ref.path === path)) {
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
    setEditableFiles((current) => {
      if (current.some((candidate) => candidate.path === editableFile.path)) return current;
      return [...current, editableFile];
    });
    setHighlight(path, "active");
  };

  const addSourceFile = (path: string) => {
    const file = projectFiles.find((candidate) => candidate.path === path);
    if (!file) return;
    const sourceFile = contextRefFromProjectFile(file);
    setSourceFiles((current) => {
      if (current.some((candidate) => candidate.path === sourceFile.path)) return current;
      return [...current, sourceFile];
    });
    setHighlight(path, "context");
  };

  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current) window.clearTimeout(highlightTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    setEditableFiles([]);
    setSourceFiles([]);
    setHighlightedContext(null);
  }, [projectSlug]);

  useEffect(() => {
    setEditableFiles((current) =>
      current.map((file) => {
        if (file.path !== selected?.path) return file;
        return editableTargetFromProjectFile(
          {
            path: selected.path,
            name: fileBasename(selected.path),
            kind: selected.kind,
            editable: selected.editable,
            annotation: selected.annotation,
          },
          selected,
          draft,
        );
      }),
    );
  }, [draft, selected]);

  return {
    addEditableFile,
    addSourceFile,
    currentFile,
    editableFiles,
    highlightedContext,
    openProjectFileWithAgentContext,
    removeEditableFile: (path: string) => setEditableFiles((current) => current.filter((file) => file.path !== path)),
    setSourceFiles,
    sourceFiles,
  };
}
