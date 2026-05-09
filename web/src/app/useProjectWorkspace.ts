import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../data/apiClient";
import {
  type BuildLogState,
  type DesignState,
  type ProjectFile,
  type ProjectStatus,
  type ProjectSummary,
  type RebuildState,
  type ResolveHumanAttentionRequest,
} from "../contracts/api";
import { uniqueFiles } from "../domain/files";
import { designIdentityFilePath } from "../domain/projectPaths";
import { resolveEffectiveRebuildModelId } from "../domain/rebuild";
import { buildRouteHash } from "../navigation/routes";
import { designProjectFile, selectedProjectStorageKey, viewForProjectPath, type RouteState, type View } from "../navigation/views";
import { useRebuildSync } from "./hooks/useRebuildSync";
import { useModelSelection } from "./hooks/useModelSelection";
import { useRouteSync } from "./hooks/useRouteSync";
import { useSelectedFile } from "./hooks/useSelectedFile";
import { useSelectedProjectLifecycle } from "./hooks/useSelectedProjectLifecycle";
import { useToasts } from "./hooks/useToasts";

export function useProjectWorkspace() {
  const [view, setView] = useState<View>("build-log");
  const [routeContext, setRouteContext] = useState<Record<string, string>>({});
  const [projectsRoot, setProjectsRoot] = useState("");
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [selectedProjectSlug, setSelectedProjectSlug] = useState<string | null>(() =>
    window.localStorage.getItem(selectedProjectStorageKey),
  );
  const [projectsError, setProjectsError] = useState("");
  const [status, setStatus] = useState<ProjectStatus | null>(null);
  const [buildLog, setBuildLog] = useState<BuildLogState | null>(null);
  const [rebuild, setRebuild] = useState<RebuildState | null>(null);
  const [design, setDesign] = useState<DesignState | null>(null);
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [projectFiles, setProjectFiles] = useState<ProjectFile[]>([designProjectFile]);
  const [loading, setLoading] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const { toasts, setNotice, dismissToast } = useToasts();
  const {
    clearRebuildModels,
    rebuildModels,
    refreshRebuildModels,
    selectedRebuildModelId,
    setSelectedRebuildModelId,
  } = useModelSelection();

  const selectedProject = useMemo(
    () => projects.find((project) => project.slug === selectedProjectSlug) ?? null,
    [projects, selectedProjectSlug],
  );

  const requireSelectedProjectSlug = useCallback(() => {
    if (!selectedProjectSlug) {
      throw new Error("Select a project first.");
    }

    return selectedProjectSlug;
  }, [selectedProjectSlug]);

  const refreshProjects = useCallback(async () => {
    setProjectsError("");
    try {
      const response = await api.projects();
      setProjectsRoot(response.projectsRoot);
      setProjects(response.projects);
    } catch (error) {
      setProjects([]);
      setProjectsError(error instanceof Error ? error.message : "Could not load projects.");
    }
  }, []);

  const refreshStatus = useCallback(async () => {
    setStatus(await api.status(requireSelectedProjectSlug()));
  }, [requireSelectedProjectSlug]);

  const refreshBuildLog = useCallback(
    async (tabId?: string | null, path?: string | null, sectionId?: string | null) => {
      setBuildLog(await api.buildLog(requireSelectedProjectSlug(), tabId, path, sectionId));
    },
    [requireSelectedProjectSlug],
  );

  const refreshDesign = useCallback(async () => {
    setDesign(await api.design(requireSelectedProjectSlug()));
  }, [requireSelectedProjectSlug]);

  const refreshRebuild = useCallback(async () => {
    const next = await api.rebuildState(requireSelectedProjectSlug());
    setRebuild(next);
    return next;
  }, [requireSelectedProjectSlug]);

  const refreshProjectFiles = useCallback(async () => {
    const projectSlug = requireSelectedProjectSlug();
    const [requirements, human, inputsAi, outputs] = await Promise.all([
      api.tree(projectSlug, "requirements"),
      api.tree(projectSlug, "human"),
      api.tree(projectSlug, "inputs-ai"),
      api.tree(projectSlug, "outputs"),
    ]);

    setProjectFiles(uniqueFiles([...requirements.files, ...human.files, ...inputsAi.files, ...outputs.files, designProjectFile]));
  }, [requireSelectedProjectSlug]);

  const loadTree = useCallback(
    async (section: string) => {
      const projectSlug = requireSelectedProjectSlug();
      setLoading(true);
      try {
        setFiles((await api.tree(projectSlug, section)).files);
      } finally {
        setLoading(false);
      }
    },
    [requireSelectedProjectSlug],
  );

  const { selected, selectedDiff, draft, setDraft, clearSelectedFile, selectFile, saveSelected, refreshSelectedFile, revertSelected } = useSelectedFile({
    requireSelectedProjectSlug,
    refreshDesign,
    refreshProjectFiles,
    refreshStatus,
    setLoading,
    setNotice,
  });

  const applyRoute = useCallback(
    async (route: RouteState) => {
      if (!route.projectSlug || route.projectSlug !== selectedProjectSlug) return;

      const nextView = route.view;
      setView(nextView);
      setRouteContext(route.context);
      setNotice("");
      clearSelectedFile();

      if (nextView === "requirements") {
        await loadTree("requirements");
      } else if (nextView === "inputs") {
        await loadTree("human");
      } else if (nextView === "outputs") {
        await loadTree("outputs");
      } else if (nextView === "annotations") {
        await loadTree("inputs-ai");
      } else {
        setFiles([]);
      }

      if (nextView === "dashboard") {
        await refreshDesign();
      } else if (nextView === "design") {
        setFiles([designProjectFile]);
        await refreshDesign();
        await selectFile(route.filePath ?? designIdentityFilePath);
      }

      if (nextView === "rebuild") {
        await refreshRebuild();
      }

      if (nextView === "build-log") {
        await refreshBuildLog();
      }

      if (route.filePath && nextView !== "design") {
        await selectFile(route.filePath);
      }
    },
    [
      clearSelectedFile,
      loadTree,
      refreshBuildLog,
      refreshDesign,
      refreshRebuild,
      selectFile,
      selectedProjectSlug,
      setNotice,
    ],
  );

  const { navigateTo } = useRouteSync({ applyRoute, selectedProjectSlug, setSelectedProjectSlug });

  const openProjectFile = useCallback(
    (path: string) => {
      const nextView = viewForProjectPath(path);
      const projectFile = projectFiles.find((file) => file.path === path);

      if (!nextView) {
        setNotice("This link points to a file that is not available in the lab UI yet.");
        return;
      }

      if (projectFile?.previewable === false) {
        setNotice(`${path} is saved in the project, but this file type cannot be previewed in the lab UI.`);
        navigateTo(nextView);
        return;
      }

      navigateTo(nextView, path);
    },
    [navigateTo, projectFiles, setNotice],
  );

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
          `Uploaded ${response.files.length.toLocaleString()} file${response.files.length === 1 ? "" : "s"} to inputs_human/.`,
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
      const confirmed = window.confirm(`Delete ${path} from inputs_human/? This cannot be undone.`);
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

  const selectProject = useCallback((projectSlug: string) => {
    setSelectedProjectSlug(projectSlug);
    window.localStorage.setItem(selectedProjectStorageKey, projectSlug);
    window.location.hash = buildRouteHash(projectSlug, "rebuild");
  }, []);

  const clearSelectedProject = useCallback(() => {
    setSelectedProjectSlug(null);
    window.localStorage.removeItem(selectedProjectStorageKey);
    window.location.hash = "#/projects";
  }, []);

  const createProject = useCallback(
    async (name: string, slug?: string) => {
      setCreatingProject(true);
      setNotice("");
      try {
        const project = await api.createProject({ name, slug });
        await refreshProjects();
        setNotice(`Created ${project.name}.`);
        selectProject(project.slug);
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "Could not create the project.");
        throw error;
      } finally {
        setCreatingProject(false);
      }
    },
    [refreshProjects, selectProject, setNotice],
  );

  const startRebuild = useCallback(async () => {
    setNotice("");
    const next = await api.startRebuild(requireSelectedProjectSlug(), resolveEffectiveRebuildModelId(selectedRebuildModelId, rebuildModels));
    setRebuild(next);

    if (next.status === "blocked") {
      setNotice(next.message);
    }
  }, [rebuildModels, requireSelectedProjectSlug, selectedRebuildModelId, setNotice]);

  const resolveHumanAttention = useCallback(
    async (request: Omit<ResolveHumanAttentionRequest, "modelId">) => {
      setNotice("");
      const next = await api.resolveHumanAttention(requireSelectedProjectSlug(), {
        ...request,
        modelId: resolveEffectiveRebuildModelId(selectedRebuildModelId, rebuildModels),
      });
      setRebuild(next);

      if (next.status === "blocked" || next.status === "error") {
        setNotice(next.message);
      }
    },
    [rebuildModels, requireSelectedProjectSlug, selectedRebuildModelId, setNotice],
  );

  useEffect(() => {
    void refreshProjects();
  }, [refreshProjects]);

  useSelectedProjectLifecycle({
    clearSelectedFile,
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
    clearRebuildModels,
    setStatus,
  });

  useRebuildSync({
    rebuild,
    refreshBuildLog,
    refreshProjectFiles,
    refreshRebuild,
    refreshStatus,
    selectedProjectSlug,
    setRebuild,
  });

  return {
    view,
    routeContext,
    projectsRoot,
    projects,
    selectedProjectSlug,
    selectedProject,
    projectsError,
    status,
    buildLog,
    rebuild,
    rebuildModels,
    selectedRebuildModelId,
    design,
    files,
    projectFiles,
    selected,
    selectedDiff,
    draft,
    toasts,
    loading,
    creatingProject,
    setDraft,
    setSelectedRebuildModelId,
    dismissToast,
    refreshProjects,
    refreshStatus,
    refreshBuildLog,
    refreshDesign,
    refreshRebuild,
    refreshRebuildModels,
    navigateTo,
    openProjectFile,
    uploadHumanInputFiles,
    deleteHumanInputFile,
    selectProject,
    clearSelectedProject,
    createProject,
    saveSelected,
    refreshSelectedFile,
    revertSelected,
    startRebuild,
    resolveHumanAttention,
    setNotice,
  };
}
