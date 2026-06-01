import { useCallback, useRef, useState } from "react";
import type { FileContent, FileDiff } from "../../contracts/api";
import { filesApi } from "../../data/filesApi";
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
    const file = await filesApi.file(projectSlug, path);
    const diff = await filesApi.fileDiff(projectSlug, path);
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
    if (!selected) return null;
    const projectSlug = requireSelectedProjectSlug();
    const requestId = (fileRequestIdRef.current += 1);

    setSaving(true);
    setNotice("");
    try {
      const saved = await filesApi.saveFile(projectSlug, selected.path, draft, selected.contentHash);
      const diff = await filesApi.fileDiff(projectSlug, saved.path);
      if (fileRequestIdRef.current !== requestId) return null;

      setSelected(saved);
      setSelectedDiff(diff);
      // Only update draft if the server returned different content (e.g. server-side
      // normalization). If the content is identical to what we sent, skip setDraft —
      // this prevents CodeMirror from receiving a new value prop, which would reset
      // scroll position (the main cause of jumping to top on annotation accept/dismiss).
      if (saved.content !== draft) {
        setDraft(saved.content);
      }

      if (isDesignIdentityPath(saved.path)) {
        await refreshDesign();
      }

      await refreshStatus();
      setNotice(`Saved ${saved.path}.`);
      return saved;
    } catch (error) {
      // If the file changed on disk (e.g. from a chat Apply or rebuild), our closure's
      // hash is stale. Rather than retrying with the old draft (which would overwrite
      // changes from Apply), silently refresh the file to sync state with disk.
      const isStaleHash = error instanceof Error && "code" in error && (error as { code: unknown }).code === "file_changed";
      if (isStaleHash && fileRequestIdRef.current === requestId) {
        try {
          const fresh = await filesApi.file(projectSlug, selected.path);
          const diff = await filesApi.fileDiff(projectSlug, fresh.path);
          if (fileRequestIdRef.current === requestId) {
            setSelected(fresh);
            setSelectedDiff(diff);
            setDraft(fresh.content);
          }
        } catch {
          // Best-effort refresh — don't surface a second error.
        }
        return null;
      }
      if (fileRequestIdRef.current === requestId) {
        setNotice(errorMessage(error, "Could not save the selected file."));
      }
      return null;
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
      const reverted = await filesApi.revertFile(projectSlug, selected.path);
      const diff = await filesApi.fileDiff(projectSlug, reverted.path);
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
