import { useCallback, useRef, useState } from "react";
import type { FileContent, FileDiff } from "../../contracts/api";
import { api } from "../../data/apiClient";
import { errorMessage } from "../../domain/errors";
import { isDesignIdentityPath } from "../../domain/projectPaths";

type UseSelectedFileOptions = {
  requireSelectedProjectSlug: () => string;
  refreshDesign: () => Promise<void>;
  refreshProjectFiles: () => Promise<void>;
  refreshStatus: () => Promise<void>;
  setFileLoading: (loading: boolean) => void;
  setNotice: (message: string) => void;
  setReverting: (loading: boolean) => void;
  setSaving: (loading: boolean) => void;
};

export function useSelectedFile({
  requireSelectedProjectSlug,
  refreshDesign,
  refreshProjectFiles,
  refreshStatus,
  setNotice,
  setFileLoading,
  setReverting,
  setSaving,
}: UseSelectedFileOptions) {
  const [selected, setSelected] = useState<FileContent | null>(null);
  const [selectedDiff, setSelectedDiff] = useState<FileDiff | null>(null);
  const [draft, setDraft] = useState("");
  const fileRequestIdRef = useRef(0);
  const hasUnsavedChanges = Boolean(selected && draft !== selected.content);

  const clearSelectedFile = useCallback(() => {
    fileRequestIdRef.current += 1;
    setSelected(null);
    setSelectedDiff(null);
    setDraft("");
  }, []);

  const loadSelectedFile = useCallback(async (projectSlug: string, path: string, requestId: number) => {
    const file = await api.file(projectSlug, path);
    const diff = await api.fileDiff(projectSlug, path);
    if (fileRequestIdRef.current !== requestId) return null;

    setSelected(file);
    setSelectedDiff(diff);
    setDraft(file.content);
    return file;
  }, []);

  const selectFile = useCallback(
    async (path: string) => {
      const projectSlug = requireSelectedProjectSlug();
      const requestId = (fileRequestIdRef.current += 1);
      setSelected(null);
      setSelectedDiff(null);
      setDraft("");
      setFileLoading(true);
      setNotice("");
      try {
        await loadSelectedFile(projectSlug, path, requestId);
      } catch (error) {
        if (fileRequestIdRef.current === requestId) {
          setSelected(null);
          setSelectedDiff(null);
          setDraft("");
          await refreshProjectFiles();
          setNotice(errorMessage(error, "Could not open the selected file."));
        }
      } finally {
        if (fileRequestIdRef.current === requestId) {
          setFileLoading(false);
        }
      }
    },
    [loadSelectedFile, refreshProjectFiles, requireSelectedProjectSlug, setFileLoading, setNotice],
  );

  const saveSelected = useCallback(async () => {
    if (!selected) return;
    const projectSlug = requireSelectedProjectSlug();
    const requestId = (fileRequestIdRef.current += 1);

    setSaving(true);
    setNotice("");
    try {
      const saved = await api.saveFile(projectSlug, selected.path, draft, selected.contentHash);
      const diff = await api.fileDiff(projectSlug, saved.path);
      if (fileRequestIdRef.current !== requestId) return;

      setSelected(saved);
      setSelectedDiff(diff);
      setDraft(saved.content);

      if (isDesignIdentityPath(saved.path)) {
        await refreshDesign();
      }

      await refreshStatus();
      setNotice(`Saved ${saved.path}.`);
    } catch (error) {
      if (fileRequestIdRef.current === requestId) {
        setNotice(errorMessage(error, "Could not save the selected file."));
      }
    } finally {
      if (fileRequestIdRef.current === requestId) {
        setSaving(false);
      }
    }
  }, [draft, refreshDesign, refreshStatus, requireSelectedProjectSlug, selected, setNotice, setSaving]);

  const refreshSelectedFile = useCallback(async () => {
    if (!selected) return;
    const projectSlug = requireSelectedProjectSlug();
    const requestId = (fileRequestIdRef.current += 1);
    setFileLoading(true);
    setNotice("");
    try {
      const file = await loadSelectedFile(projectSlug, selected.path, requestId);
      if (!file) return;

      if (isDesignIdentityPath(file.path)) {
        await refreshDesign();
      }

      await refreshStatus();
    } catch (error) {
      if (fileRequestIdRef.current === requestId) {
        setNotice(errorMessage(error, "Could not refresh the selected file."));
      }
    } finally {
      if (fileRequestIdRef.current === requestId) {
        setFileLoading(false);
      }
    }
  }, [loadSelectedFile, refreshDesign, refreshStatus, requireSelectedProjectSlug, selected, setFileLoading, setNotice]);

  const revertSelected = useCallback(async () => {
    if (!selected) return;
    const projectSlug = requireSelectedProjectSlug();
    const requestId = (fileRequestIdRef.current += 1);

    setReverting(true);
    setNotice("");
    try {
      const reverted = await api.revertFile(projectSlug, selected.path);
      const diff = await api.fileDiff(projectSlug, reverted.path);
      if (fileRequestIdRef.current !== requestId) return;

      setSelected(reverted);
      setSelectedDiff(diff);
      setDraft(reverted.content);

      if (isDesignIdentityPath(reverted.path)) {
        await refreshDesign();
      }

      await refreshStatus();
      setNotice(`Reverted ${reverted.path}.`);
    } catch (error) {
      if (fileRequestIdRef.current === requestId) {
        setNotice(errorMessage(error, "Could not revert the selected file."));
      }
    } finally {
      if (fileRequestIdRef.current === requestId) {
        setReverting(false);
      }
    }
  }, [refreshDesign, refreshStatus, requireSelectedProjectSlug, selected, setNotice, setReverting]);

  return {
    selected,
    selectedDiff,
    draft,
    hasUnsavedChanges,
    setDraft,
    clearSelectedFile,
    selectFile,
    saveSelected,
    refreshSelectedFile,
    revertSelected,
  };
}
