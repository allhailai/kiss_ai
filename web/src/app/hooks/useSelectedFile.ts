import { useCallback, useState } from "react";
import type { FileContent, FileDiff } from "../../contracts/api";
import { api } from "../../data/apiClient";
import { isDesignIdentityPath } from "../../domain/projectPaths";

type UseSelectedFileOptions = {
  requireSelectedProjectSlug: () => string;
  refreshDesign: () => Promise<void>;
  refreshProjectFiles: () => Promise<void>;
  refreshStatus: () => Promise<void>;
  setLoading: (loading: boolean) => void;
  setNotice: (message: string) => void;
};

export function useSelectedFile({
  requireSelectedProjectSlug,
  refreshDesign,
  refreshProjectFiles,
  refreshStatus,
  setLoading,
  setNotice,
}: UseSelectedFileOptions) {
  const [selected, setSelected] = useState<FileContent | null>(null);
  const [selectedDiff, setSelectedDiff] = useState<FileDiff | null>(null);
  const [draft, setDraft] = useState("");

  const clearSelectedFile = useCallback(() => {
    setSelected(null);
    setSelectedDiff(null);
    setDraft("");
  }, []);

  const loadSelectedFile = useCallback(async (projectSlug: string, path: string) => {
    const file = await api.file(projectSlug, path);
    const diff = await api.fileDiff(projectSlug, path);
    setSelected(file);
    setSelectedDiff(diff);
    setDraft(file.content);
    return file;
  }, []);

  const selectFile = useCallback(
    async (path: string) => {
      const projectSlug = requireSelectedProjectSlug();
      setLoading(true);
      setNotice("");
      try {
        await loadSelectedFile(projectSlug, path);
      } catch (error) {
        clearSelectedFile();
        await refreshProjectFiles();
        setNotice(error instanceof Error ? error.message : "Could not open the selected file.");
      } finally {
        setLoading(false);
      }
    },
    [clearSelectedFile, loadSelectedFile, refreshProjectFiles, requireSelectedProjectSlug, setLoading, setNotice],
  );

  const saveSelected = useCallback(async () => {
    if (!selected) return;
    const projectSlug = requireSelectedProjectSlug();

    const saved = await api.saveFile(projectSlug, selected.path, draft);
    const diff = await api.fileDiff(projectSlug, saved.path);
    setSelected(saved);
    setSelectedDiff(diff);
    setDraft(saved.content);

    if (isDesignIdentityPath(saved.path)) {
      await refreshDesign();
    }

    await refreshStatus();
  }, [draft, refreshDesign, refreshStatus, requireSelectedProjectSlug, selected]);

  const refreshSelectedFile = useCallback(async () => {
    if (!selected) return;
    const projectSlug = requireSelectedProjectSlug();
    const file = await loadSelectedFile(projectSlug, selected.path);

    if (isDesignIdentityPath(file.path)) {
      await refreshDesign();
    }

    await refreshStatus();
  }, [loadSelectedFile, refreshDesign, refreshStatus, requireSelectedProjectSlug, selected]);

  const revertSelected = useCallback(async () => {
    if (!selected) return;
    const projectSlug = requireSelectedProjectSlug();

    const reverted = await api.revertFile(projectSlug, selected.path);
    const diff = await api.fileDiff(projectSlug, reverted.path);
    setSelected(reverted);
    setSelectedDiff(diff);
    setDraft(reverted.content);

    if (isDesignIdentityPath(reverted.path)) {
      await refreshDesign();
    }

    await refreshStatus();
  }, [refreshDesign, refreshStatus, requireSelectedProjectSlug, selected]);

  return {
    selected,
    selectedDiff,
    draft,
    setDraft,
    clearSelectedFile,
    selectFile,
    saveSelected,
    refreshSelectedFile,
    revertSelected,
  };
}
