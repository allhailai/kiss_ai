import { useCallback } from "react";
import type { FileContent } from "../../contracts/api";
import { api } from "../../data/apiClient";
import { errorMessage } from "../../domain/errors";
import { projectPathPrefixes } from "../../domain/projectPaths";
import type { View } from "../../navigation/views";

export function useHumanInputs({
  clearSelectedFile,
  loadTree,
  refreshProjectFiles,
  requireSelectedProjectSlug,
  selected,
  setInputMutationLoading,
  setNotice,
  view,
}: {
  clearSelectedFile: () => void;
  loadTree: (section: string) => Promise<void>;
  refreshProjectFiles: () => Promise<void>;
  requireSelectedProjectSlug: () => string;
  selected: FileContent | null;
  setInputMutationLoading: (loading: boolean) => void;
  setNotice: (message: string) => void;
  view: View;
}) {
  const uploadHumanInputFiles = useCallback(
    async (files: File[]) => {
      if (!files.length) return;

      setInputMutationLoading(true);
      setNotice("");
      try {
        const response = await api.uploadHumanInputs(requireSelectedProjectSlug(), files);
        await refreshProjectFiles();
        if (view === "inputs") await loadTree("human");
        setNotice(
          `Uploaded ${response.files.length.toLocaleString()} file${response.files.length === 1 ? "" : "s"} to ${projectPathPrefixes.humanInput}.`,
        );
      } catch (error) {
        setNotice(errorMessage(error, "Could not upload files."));
        throw error;
      } finally {
        setInputMutationLoading(false);
      }
    },
    [loadTree, refreshProjectFiles, requireSelectedProjectSlug, setInputMutationLoading, setNotice, view],
  );

  const deleteHumanInputFile = useCallback(
    async (path: string) => {
      const confirmed = window.confirm(`Delete ${path} from ${projectPathPrefixes.humanInput}? This cannot be undone.`);
      if (!confirmed) return;

      setInputMutationLoading(true);
      setNotice("");
      try {
        const response = await api.deleteHumanInput(requireSelectedProjectSlug(), path);
        if (selected?.path === response.path) clearSelectedFile();
        await refreshProjectFiles();
        if (view === "inputs") await loadTree("human");
        setNotice(`Deleted ${response.path}.`);
      } catch (error) {
        setNotice(errorMessage(error, "Could not delete the file."));
        throw error;
      } finally {
        setInputMutationLoading(false);
      }
    },
    [clearSelectedFile, loadTree, refreshProjectFiles, requireSelectedProjectSlug, selected?.path, setInputMutationLoading, setNotice, view],
  );

  return { deleteHumanInputFile, uploadHumanInputFiles };
}
