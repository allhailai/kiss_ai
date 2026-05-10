import { useCallback } from "react";
import type { FileContent } from "../../contracts/api";
import { api } from "../../data/apiClient";
import { projectPathPrefixes } from "../../domain/projectPaths";

export function useHumanInputs({
  clearSelectedFile,
  loadTree,
  refreshProjectFiles,
  requireSelectedProjectSlug,
  selected,
  setLoading,
  setNotice,
  view,
}: {
  clearSelectedFile: () => void;
  loadTree: (section: string) => Promise<void>;
  refreshProjectFiles: () => Promise<void>;
  requireSelectedProjectSlug: () => string;
  selected: FileContent | null;
  setLoading: (loading: boolean) => void;
  setNotice: (message: string) => void;
  view: string;
}) {
  const uploadHumanInputFiles = useCallback(
    async (files: File[]) => {
      if (!files.length) return;

      setLoading(true);
      setNotice("");
      try {
        const response = await api.uploadHumanInputs(requireSelectedProjectSlug(), files);
        await refreshProjectFiles();
        if (view === "inputs") await loadTree("human");
        setNotice(
          `Uploaded ${response.files.length.toLocaleString()} file${response.files.length === 1 ? "" : "s"} to ${projectPathPrefixes.humanInput}.`,
        );
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "Could not upload files.");
        throw error;
      } finally {
        setLoading(false);
      }
    },
    [loadTree, refreshProjectFiles, requireSelectedProjectSlug, setLoading, setNotice, view],
  );

  const deleteHumanInputFile = useCallback(
    async (path: string) => {
      const confirmed = window.confirm(`Delete ${path} from ${projectPathPrefixes.humanInput}? This cannot be undone.`);
      if (!confirmed) return;

      setLoading(true);
      setNotice("");
      try {
        const response = await api.deleteHumanInput(requireSelectedProjectSlug(), path);
        if (selected?.path === response.path) clearSelectedFile();
        await refreshProjectFiles();
        if (view === "inputs") await loadTree("human");
        setNotice(`Deleted ${response.path}.`);
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "Could not delete the file.");
        throw error;
      } finally {
        setLoading(false);
      }
    },
    [clearSelectedFile, loadTree, refreshProjectFiles, requireSelectedProjectSlug, selected?.path, setLoading, setNotice, view],
  );

  return { deleteHumanInputFile, uploadHumanInputFiles };
}
