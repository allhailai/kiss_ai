import { useCallback, useEffect, useRef } from "react";
import { type BuildLogState, type DesignState, type FileChangeStatus, type ProjectFile, type ProjectStatus, type RebuildState } from "../../contracts/api";
import { filesApi } from "../../data/filesApi";
import { projectsApi } from "../../data/projectsApi";
import { rebuildApi } from "../../data/rebuildApi";
import { uniqueFiles } from "../../domain/files";
import { designProjectFile } from "../../domain/projectPaths";

export function useProjectDataLoaders({
  selectedProjectSlug,
  setBuildLog,
  setDesign,
  setFileChanges,
  setHumanInputEmptyDirectories,
  setProjectFiles,
  setRebuild,
  setStatus,
}: {
  selectedProjectSlug: string | null;
  setBuildLog: (buildLog: BuildLogState | null) => void;
  setDesign: (design: DesignState | null) => void;
  setFileChanges: (changes: Record<string, FileChangeStatus>) => void;
  setHumanInputEmptyDirectories: (dirs: string[]) => void;
  setProjectFiles: (files: ProjectFile[]) => void;
  setRebuild: (rebuild: RebuildState | null) => void;
  setStatus: (status: ProjectStatus | null) => void;
}) {
  const selectedProjectSlugRef = useRef(selectedProjectSlug);

  const requireSelectedProjectSlug = useCallback(() => {
    if (!selectedProjectSlug) {
      throw new Error("Select a project first.");
    }

    return selectedProjectSlug;
  }, [selectedProjectSlug]);

  useEffect(() => {
    selectedProjectSlugRef.current = selectedProjectSlug;
  }, [selectedProjectSlug]);

  const refreshStatus = useCallback(async () => {
    const projectSlug = requireSelectedProjectSlug();
    const next = await projectsApi.status(projectSlug);
    if (selectedProjectSlugRef.current === projectSlug) {
      setStatus(next);
    }
  }, [requireSelectedProjectSlug, setStatus]);

  const refreshBuildLog = useCallback(
    async (tabId?: string | null, path?: string | null, sectionId?: string | null) => {
      const projectSlug = requireSelectedProjectSlug();
      const next = await projectsApi.buildLog(projectSlug, tabId, path, sectionId);
      if (selectedProjectSlugRef.current === projectSlug) {
        setBuildLog(next);
      }
    },
    [requireSelectedProjectSlug, setBuildLog],
  );

  const refreshDesign = useCallback(async () => {
    const projectSlug = requireSelectedProjectSlug();
    const next = await projectsApi.design(projectSlug);
    if (selectedProjectSlugRef.current === projectSlug) {
      setDesign(next);
    }
  }, [requireSelectedProjectSlug, setDesign]);

  const refreshRebuild = useCallback(async () => {
    const projectSlug = requireSelectedProjectSlug();
    const next = await rebuildApi.rebuildState(projectSlug);
    if (selectedProjectSlugRef.current === projectSlug) {
      setRebuild(next);
    }
    return next;
  }, [requireSelectedProjectSlug, setRebuild]);

  const refreshProjectFiles = useCallback(async () => {
    const projectSlug = requireSelectedProjectSlug();
    const [requirements, human, sources, inputsAi, outputs] = await Promise.all([
      filesApi.tree(projectSlug, "requirements"),
      filesApi.tree(projectSlug, "human"),
      filesApi.tree(projectSlug, "sources"),
      filesApi.tree(projectSlug, "inputs-ai"),
      filesApi.tree(projectSlug, "outputs"),
    ]);

    if (selectedProjectSlugRef.current === projectSlug) {
      setProjectFiles(uniqueFiles([...requirements.files, ...human.files, ...sources.files, ...inputsAi.files, ...outputs.files, designProjectFile]));
      setHumanInputEmptyDirectories(human.emptyDirectories ?? []);

      // Merge fileChanges from all tree sections
      const merged: Record<string, FileChangeStatus> = {};
      for (const tree of [requirements, human, sources, inputsAi, outputs]) {
        if (tree.fileChanges) {
          Object.assign(merged, tree.fileChanges);
        }
      }
      setFileChanges(merged);
    }
  }, [requireSelectedProjectSlug, setFileChanges, setHumanInputEmptyDirectories, setProjectFiles]);

  return {
    refreshBuildLog,
    refreshDesign,
    refreshProjectFiles,
    refreshRebuild,
    refreshStatus,
    requireSelectedProjectSlug,
  };
}
