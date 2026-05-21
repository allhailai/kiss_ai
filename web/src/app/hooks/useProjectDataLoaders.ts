import { useCallback, useEffect, useRef } from "react";
import { type BuildLogState, type DesignState, type ProjectFile, type ProjectStatus, type RebuildState } from "../../contracts/api";
import { api } from "../../data/apiClient";
import { uniqueFiles } from "../../domain/files";
import { designProjectFile } from "../../domain/projectPaths";

export function useProjectDataLoaders({
  selectedProjectSlug,
  setBuildLog,
  setDesign,
  setHumanInputEmptyDirectories,
  setProjectFiles,
  setRebuild,
  setStatus,
  setTreeLoading,
}: {
  selectedProjectSlug: string | null;
  setBuildLog: (buildLog: BuildLogState | null) => void;
  setDesign: (design: DesignState | null) => void;
  setHumanInputEmptyDirectories: (dirs: string[]) => void;
  setProjectFiles: (files: ProjectFile[]) => void;
  setRebuild: (rebuild: RebuildState | null) => void;
  setStatus: (status: ProjectStatus | null) => void;
  setTreeLoading: (loading: boolean) => void;
}) {
  const selectedProjectSlugRef = useRef(selectedProjectSlug);
  const treeRequestIdRef = useRef(0);

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
    const next = await api.status(projectSlug);
    if (selectedProjectSlugRef.current === projectSlug) {
      setStatus(next);
    }
  }, [requireSelectedProjectSlug, setStatus]);

  const refreshBuildLog = useCallback(
    async (tabId?: string | null, path?: string | null, sectionId?: string | null) => {
      const projectSlug = requireSelectedProjectSlug();
      const next = await api.buildLog(projectSlug, tabId, path, sectionId);
      if (selectedProjectSlugRef.current === projectSlug) {
        setBuildLog(next);
      }
    },
    [requireSelectedProjectSlug, setBuildLog],
  );

  const refreshDesign = useCallback(async () => {
    const projectSlug = requireSelectedProjectSlug();
    const next = await api.design(projectSlug);
    if (selectedProjectSlugRef.current === projectSlug) {
      setDesign(next);
    }
  }, [requireSelectedProjectSlug, setDesign]);

  const refreshRebuild = useCallback(async () => {
    const projectSlug = requireSelectedProjectSlug();
    const next = await api.rebuildState(projectSlug);
    if (selectedProjectSlugRef.current === projectSlug) {
      setRebuild(next);
    }
    return next;
  }, [requireSelectedProjectSlug, setRebuild]);

  const refreshProjectFiles = useCallback(async () => {
    const projectSlug = requireSelectedProjectSlug();
    const [requirements, human, sources, inputsAi, outputs] = await Promise.all([
      api.tree(projectSlug, "requirements"),
      api.tree(projectSlug, "human"),
      api.tree(projectSlug, "sources"),
      api.tree(projectSlug, "inputs-ai"),
      api.tree(projectSlug, "outputs"),
    ]);

    if (selectedProjectSlugRef.current === projectSlug) {
      setProjectFiles(uniqueFiles([...requirements.files, ...human.files, ...sources.files, ...inputsAi.files, ...outputs.files, designProjectFile]));
      setHumanInputEmptyDirectories(human.emptyDirectories ?? []);
    }
  }, [requireSelectedProjectSlug, setHumanInputEmptyDirectories, setProjectFiles]);

  const loadTree = useCallback(
    async (section: string) => {
      const projectSlug = requireSelectedProjectSlug();
      const requestId = (treeRequestIdRef.current += 1);
      setTreeLoading(true);
      try {
        await api.tree(projectSlug, section);
      } finally {
        if (treeRequestIdRef.current === requestId) {
          setTreeLoading(false);
        }
      }
    },
    [requireSelectedProjectSlug, setTreeLoading],
  );

  return {
    loadTree,
    refreshBuildLog,
    refreshDesign,
    refreshProjectFiles,
    refreshRebuild,
    refreshStatus,
    requireSelectedProjectSlug,
  };
}
