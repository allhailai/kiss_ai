import { useCallback } from "react";
import type { FileContent } from "../../contracts/api";
import { filesApi } from "../../data/filesApi";
import { errorMessage } from "../../domain/errors";
import { projectPathPrefixes } from "../../domain/projectPaths";

export function useHumanInputs({
  clearSelectedFile,
  refreshProjectFiles,
  requireSelectedProjectSlug,
  selected,
  setInputMutationLoading,
  setNotice,
  onOpenFile,
}: {
  clearSelectedFile: () => void;
  refreshProjectFiles: () => Promise<void>;
  requireSelectedProjectSlug: () => string;
  selected: FileContent | null;
  setInputMutationLoading: (loading: boolean) => void;
  setNotice: (message: string) => void;
  onOpenFile?: (path: string) => void;
}) {
  const uploadHumanInputFiles = useCallback(
    async (files: File[]) => {
      if (!files.length) return;

      setInputMutationLoading(true);
      setNotice("");
      try {
        const response = await filesApi.uploadHumanInputs(requireSelectedProjectSlug(), files);
        await refreshProjectFiles();
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
    [refreshProjectFiles, requireSelectedProjectSlug, setInputMutationLoading, setNotice],
  );

  const deleteHumanInputFile = useCallback(
    async (path: string) => {
      setInputMutationLoading(true);
      setNotice("");
      try {
        const response = await filesApi.deleteHumanInput(requireSelectedProjectSlug(), path);
        if (selected?.path === response.path) clearSelectedFile();
        await refreshProjectFiles();
        setNotice(`Deleted ${response.path}.`);
      } catch (error) {
        setNotice(errorMessage(error, "Could not delete the file."));
        throw error;
      } finally {
        setInputMutationLoading(false);
      }
    },
    [clearSelectedFile, refreshProjectFiles, requireSelectedProjectSlug, selected?.path, setInputMutationLoading, setNotice],
  );

  const createHumanInputFolder = useCallback(
    async (name: string) => {
      setInputMutationLoading(true);
      setNotice("");
      try {
        const response = await filesApi.createHumanInputFolder(requireSelectedProjectSlug(), name);
        await refreshProjectFiles();
        setNotice(`Created folder ${response.folder}.`);
      } catch (error) {
        setNotice(errorMessage(error, "Could not create the folder."));
        throw error;
      } finally {
        setInputMutationLoading(false);
      }
    },
    [refreshProjectFiles, requireSelectedProjectSlug, setInputMutationLoading, setNotice],
  );

  const createHumanInputTextFile = useCallback(
    async (name: string, folder?: string) => {
      setInputMutationLoading(true);
      setNotice("");
      try {
        const response = await filesApi.createHumanInputTextFile(requireSelectedProjectSlug(), name, "", folder);
        await refreshProjectFiles();
        setNotice(`Created ${response.file.path}.`);
        if (onOpenFile) onOpenFile(response.file.path);
      } catch (error) {
        setNotice(errorMessage(error, "Could not create the text file."));
        throw error;
      } finally {
        setInputMutationLoading(false);
      }
    },
    [onOpenFile, refreshProjectFiles, requireSelectedProjectSlug, setInputMutationLoading, setNotice],
  );

  const deleteHumanInputFolder = useCallback(
    async (folder: string) => {
      setInputMutationLoading(true);
      setNotice("");
      try {
        const response = await filesApi.deleteHumanInputFolder(requireSelectedProjectSlug(), folder.replace(/^inputs_human\//, ""));
        await refreshProjectFiles();
        setNotice(`Deleted folder ${response.folder}.`);
      } catch (error) {
        setNotice(errorMessage(error, "Could not delete the folder."));
        throw error;
      } finally {
        setInputMutationLoading(false);
      }
    },
    [refreshProjectFiles, requireSelectedProjectSlug, setInputMutationLoading, setNotice],
  );

  const moveHumanInputFile = useCallback(
    async (sourcePath: string, targetFolder: string) => {
      setInputMutationLoading(true);
      setNotice("");
      try {
        const response = await filesApi.moveHumanInputFile(requireSelectedProjectSlug(), sourcePath, targetFolder);
        await refreshProjectFiles();
        setNotice(`Moved to ${response.newPath}.`);
        if (onOpenFile) onOpenFile(response.newPath);
      } catch (error) {
        setNotice(errorMessage(error, "Could not move the file."));
        throw error;
      } finally {
        setInputMutationLoading(false);
      }
    },
    [onOpenFile, refreshProjectFiles, requireSelectedProjectSlug, setInputMutationLoading, setNotice],
  );

  const deleteProjectFile = useCallback(
    async (path: string) => {
      setInputMutationLoading(true);
      setNotice("");
      try {
        const response = await filesApi.deleteProjectFile(requireSelectedProjectSlug(), path);
        if (selected?.path === response.path) clearSelectedFile();
        await refreshProjectFiles();
        setNotice(`Deleted ${response.path}.`);
      } catch (error) {
        setNotice(errorMessage(error, "Could not delete the file."));
        throw error;
      } finally {
        setInputMutationLoading(false);
      }
    },
    [clearSelectedFile, refreshProjectFiles, requireSelectedProjectSlug, selected?.path, setInputMutationLoading, setNotice],
  );

  const deleteProjectFolder = useCallback(
    async (folder: string) => {
      setInputMutationLoading(true);
      setNotice("");
      try {
        const response = await filesApi.deleteProjectFolder(requireSelectedProjectSlug(), folder);
        await refreshProjectFiles();
        setNotice(`Deleted folder ${response.folder}.`);
      } catch (error) {
        setNotice(errorMessage(error, "Could not delete the folder."));
        throw error;
      } finally {
        setInputMutationLoading(false);
      }
    },
    [refreshProjectFiles, requireSelectedProjectSlug, setInputMutationLoading, setNotice],
  );

  return { createHumanInputFolder, createHumanInputTextFile, deleteHumanInputFile, deleteHumanInputFolder, deleteProjectFile, deleteProjectFolder, moveHumanInputFile, uploadHumanInputFiles };
}
