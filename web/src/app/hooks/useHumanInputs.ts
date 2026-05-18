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
  onOpenFile,
}: {
  clearSelectedFile: () => void;
  loadTree: (section: string) => Promise<void>;
  refreshProjectFiles: () => Promise<void>;
  requireSelectedProjectSlug: () => string;
  selected: FileContent | null;
  setInputMutationLoading: (loading: boolean) => void;
  setNotice: (message: string) => void;
  view: View;
  onOpenFile?: (path: string) => void;
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

  const createHumanInputFolder = useCallback(
    async (name: string) => {
      setInputMutationLoading(true);
      setNotice("");
      try {
        const response = await api.createHumanInputFolder(requireSelectedProjectSlug(), name);
        await refreshProjectFiles();
        if (view === "inputs") await loadTree("human");
        setNotice(`Created folder ${response.folder}.`);
      } catch (error) {
        setNotice(errorMessage(error, "Could not create the folder."));
        throw error;
      } finally {
        setInputMutationLoading(false);
      }
    },
    [loadTree, refreshProjectFiles, requireSelectedProjectSlug, setInputMutationLoading, setNotice, view],
  );

  const createHumanInputTextFile = useCallback(
    async (name: string, folder?: string) => {
      setInputMutationLoading(true);
      setNotice("");
      try {
        const response = await api.createHumanInputTextFile(requireSelectedProjectSlug(), name, "", folder);
        await refreshProjectFiles();
        if (view === "inputs") await loadTree("human");
        setNotice(`Created ${response.file.path}.`);
        if (onOpenFile) onOpenFile(response.file.path);
      } catch (error) {
        setNotice(errorMessage(error, "Could not create the text file."));
        throw error;
      } finally {
        setInputMutationLoading(false);
      }
    },
    [loadTree, onOpenFile, refreshProjectFiles, requireSelectedProjectSlug, setInputMutationLoading, setNotice, view],
  );

  const deleteHumanInputFolder = useCallback(
    async (folder: string) => {
      setInputMutationLoading(true);
      setNotice("");
      try {
        const response = await api.deleteHumanInputFolder(requireSelectedProjectSlug(), folder);
        await refreshProjectFiles();
        if (view === "inputs") await loadTree("human");
        setNotice(`Deleted folder ${response.folder}.`);
      } catch (error) {
        setNotice(errorMessage(error, "Could not delete the folder."));
        throw error;
      } finally {
        setInputMutationLoading(false);
      }
    },
    [loadTree, refreshProjectFiles, requireSelectedProjectSlug, setInputMutationLoading, setNotice, view],
  );

  const moveHumanInputFile = useCallback(
    async (sourcePath: string, targetFolder: string) => {
      setInputMutationLoading(true);
      setNotice("");
      try {
        const response = await api.moveHumanInputFile(requireSelectedProjectSlug(), sourcePath, targetFolder);
        await refreshProjectFiles();
        if (view === "inputs") await loadTree("human");
        setNotice(`Moved to ${response.newPath}.`);
        if (onOpenFile) onOpenFile(response.newPath);
      } catch (error) {
        setNotice(errorMessage(error, "Could not move the file."));
        throw error;
      } finally {
        setInputMutationLoading(false);
      }
    },
    [loadTree, onOpenFile, refreshProjectFiles, requireSelectedProjectSlug, setInputMutationLoading, setNotice, view],
  );

  return { createHumanInputFolder, createHumanInputTextFile, deleteHumanInputFile, deleteHumanInputFolder, moveHumanInputFile, uploadHumanInputFiles };
}
