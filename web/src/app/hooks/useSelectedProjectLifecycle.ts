import { useEffect } from "react";
import type { BuildLogState, DesignState, ProjectFile, ProjectStatus, ProjectSummary, RebuildState } from "../../contracts/api";
import { errorMessage } from "../../domain/errors";
import { designProjectFile, selectedProjectStorageKey } from "../../navigation/views";

type UseSelectedProjectLifecycleOptions = {
  clearSelectedFile: () => void;
  clearRebuildModels: () => void;
  projects: ProjectSummary[];
  refreshProjectFiles: () => Promise<void>;
  refreshRebuildModels: () => Promise<void>;
  refreshStatus: () => Promise<void>;
  selectedProjectSlug: string | null;
  setBuildLog: (buildLog: BuildLogState | null) => void;
  setDesign: (design: DesignState | null) => void;
  setFiles: (files: ProjectFile[]) => void;
  setNotice: (message: string) => void;
  setProjectFiles: (files: ProjectFile[]) => void;
  setRebuild: (rebuild: RebuildState | null) => void;
  setSelectedProjectSlug: (projectSlug: string | null) => void;
  setStatus: (status: ProjectStatus | null) => void;
};

export function useSelectedProjectLifecycle({
  clearSelectedFile,
  clearRebuildModels,
  projects,
  refreshProjectFiles,
  refreshRebuildModels,
  refreshStatus,
  selectedProjectSlug,
  setBuildLog,
  setDesign,
  setFiles,
  setNotice,
  setProjectFiles,
  setRebuild,
  setSelectedProjectSlug,
  setStatus,
}: UseSelectedProjectLifecycleOptions) {
  useEffect(() => {
    let cancelled = false;

    if (!selectedProjectSlug) {
      window.localStorage.removeItem(selectedProjectStorageKey);
      setStatus(null);
      setBuildLog(null);
      setRebuild(null);
      clearRebuildModels();
      setDesign(null);
      setFiles([]);
      setProjectFiles([designProjectFile]);
      clearSelectedFile();
      return;
    }

    window.localStorage.setItem(selectedProjectStorageKey, selectedProjectSlug);
    void (async () => {
      try {
        await Promise.all([refreshStatus(), refreshRebuildModels(), refreshProjectFiles()]);
      } catch (error) {
        if (!cancelled) {
          setNotice(errorMessage(error, "Could not load the selected project."));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    clearSelectedFile,
    clearRebuildModels,
    refreshProjectFiles,
    refreshRebuildModels,
    refreshStatus,
    selectedProjectSlug,
    setBuildLog,
    setDesign,
    setFiles,
    setProjectFiles,
    setRebuild,
    setStatus,
  ]);

  useEffect(() => {
    if (!projects.length || !selectedProjectSlug) return;
    if (projects.some((project) => project.slug === selectedProjectSlug)) return;

    setSelectedProjectSlug(null);
    window.history.replaceState(null, "", "#/projects");
    setNotice("The previously selected project is no longer available.");
  }, [projects, selectedProjectSlug, setNotice, setSelectedProjectSlug]);
}
