import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../data/apiClient";
import {
  type BuildLogState,
  type DesignState,
  type ProjectFile,
  type ProjectStatus,
  type ProjectSummary,
  type RebuildState,
} from "../contracts/api";
import { buildRouteHash, parseRouteHash } from "../navigation/routes";
import { designProjectFile, selectedProjectStorageKey, viewForProjectPath, type RouteState, type View } from "../navigation/views";
import { errorMessage } from "../domain/errors";
import { projectFilePath } from "../domain/projectPaths";
import { useProjectDataLoaders } from "./hooks/useProjectDataLoaders";
import { useHumanInputs } from "./hooks/useHumanInputs";
import { useRebuildSync } from "./hooks/useRebuildSync";
import { useRebuildActions } from "./hooks/useRebuildActions";
import { useModelSelection } from "./hooks/useModelSelection";
import { useRouteDrivenData } from "./hooks/useRouteDrivenData";
import { useRouteSync } from "./hooks/useRouteSync";
import { useSelectedFile } from "./hooks/useSelectedFile";
import { useSelectedProjectLifecycle } from "./hooks/useSelectedProjectLifecycle";
import { useToasts } from "./hooks/useToasts";
import type {
  DesignWorkspaceController,
  FileWorkspaceController,
  ProjectController,
  RebuildWorkspaceController,
  RouteController,
  ToastWorkspaceController,
} from "./workspaceControllers";

export function useProjectWorkspace() {
  const selectProjectRequestRef = useRef(0);
  const [view, setView] = useState<View>(() => parseRouteHash(window.location.hash).view);
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
  const [projectFiles, setProjectFiles] = useState<ProjectFile[]>([designProjectFile]);
  const [humanInputEmptyDirectories, setHumanInputEmptyDirectories] = useState<string[]>([]);
  const [treeLoading, setTreeLoading] = useState(false);
  const [fileLoading, setFileLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reverting, setReverting] = useState(false);
  const [inputMutationLoading, setInputMutationLoading] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const { toasts, setNotice, dismissToast } = useToasts();
  const {
    clearRebuildModels,
    rebuildModels,
    refreshRebuildModels,
    selectedRebuildModelId,
    setSelectedRebuildModelId,
  } = useModelSelection(selectedProjectSlug);

  const selectedProject = useMemo(
    () => projects.find((project) => project.slug === selectedProjectSlug) ?? null,
    [projects, selectedProjectSlug],
  );

  const refreshProjects = useCallback(async () => {
    setProjectsError("");
    try {
      const response = await api.projects();
      setProjectsRoot(response.projectsRoot);
      setProjects(response.projects);
    } catch (error) {
      setProjects([]);
      setProjectsError(errorMessage(error, "Could not load projects."));
    }
  }, []);

  const {
    loadTree,
    refreshBuildLog,
    refreshDesign,
    refreshProjectFiles,
    refreshRebuild,
    refreshStatus,
    requireSelectedProjectSlug,
  } = useProjectDataLoaders({
    selectedProjectSlug,
    setBuildLog,
    setDesign,
    setHumanInputEmptyDirectories,
    setProjectFiles,
    setRebuild,
    setStatus,
    setTreeLoading,
  });

  const {
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
  } = useSelectedFile({
    requireSelectedProjectSlug,
    refreshDesign,
    refreshProjectFiles,
    refreshStatus,
    setFileLoading,
    setNotice,
    setReverting,
    setSaving,
  });

  const currentRoute = useMemo(
    () => ({
      projectSlug: selectedProjectSlug,
      view,
      filePath: selected?.path ?? null,
      context: routeContext,
    }),
    [routeContext, selected?.path, selectedProjectSlug, view],
  );
  const canLeaveCurrentRoute = useCallback(
    (nextRoute: RouteState) => {
      const sameRoute =
        currentRoute.projectSlug === nextRoute.projectSlug &&
        currentRoute.view === nextRoute.view &&
        currentRoute.filePath === nextRoute.filePath &&
        JSON.stringify(currentRoute.context) === JSON.stringify(nextRoute.context);
      if (sameRoute || !hasUnsavedChanges) return true;

      return window.confirm("Discard unsaved changes to the current file?");
    },
    [currentRoute, hasUnsavedChanges],
  );

  const applyRoute = useRouteDrivenData({
    clearSelectedFile,
    loadTree,
    refreshBuildLog,
    refreshDesign,
    refreshRebuild,
    selectFile,
    selectedProjectSlug,
    setNotice,
    setRouteContext,
    setView,
  });

  const persistProjectRoute = useCallback((route: RouteState) => {
    if (!route.projectSlug) return;

    const hash = buildRouteHash(route.projectSlug, route.view, route.filePath, route.context);
    void api.updateProjectUiState(route.projectSlug, { lastRoute: { hash } }).catch((error: unknown) => {
      console.warn("[kiss_ai UI warning] Could not persist project route.", error);
    });
  }, []);

  const { navigateTo } = useRouteSync({
    applyRoute,
    canLeaveCurrentRoute,
    currentRoute,
    onRouteApplied: persistProjectRoute,
    onRouteError: setNotice,
    selectedProjectSlug,
    setSelectedProjectSlug,
  });

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

  const { createHumanInputFolder, createHumanInputTextFile, deleteHumanInputFile, deleteHumanInputFolder, moveHumanInputFile, uploadHumanInputFiles } = useHumanInputs({
    clearSelectedFile,
    loadTree,
    refreshProjectFiles,
    requireSelectedProjectSlug,
    selected,
    setInputMutationLoading,
    setNotice,
    view,
    onOpenFile: openProjectFile,
  });

  const selectProject = useCallback(
    (projectSlug: string) => {
      const defaultFilePath = projectFilePath;
      if (!canLeaveCurrentRoute({ projectSlug, view: "requirements", filePath: defaultFilePath, context: {} })) return;
      const requestId = selectProjectRequestRef.current + 1;
      selectProjectRequestRef.current = requestId;

      void (async () => {
        const firstProjectHash = buildRouteHash(projectSlug, "requirements", defaultFilePath);
        let nextHash = firstProjectHash;

        try {
          const projectUiState = await api.projectUiState(projectSlug);
          const savedHash = projectUiState.lastRoute?.hash;
          if (savedHash && parseRouteHash(savedHash).projectSlug === projectSlug) {
            nextHash = savedHash;
          }
        } catch (error) {
          if (selectProjectRequestRef.current !== requestId) return;
          setNotice(errorMessage(error, "Could not load the saved project location."));
        }

        if (selectProjectRequestRef.current !== requestId) return;
        setSelectedProjectSlug(projectSlug);
        window.localStorage.setItem(selectedProjectStorageKey, projectSlug);
        window.location.hash = nextHash;
      })();
    },
    [canLeaveCurrentRoute, setNotice],
  );

  const clearSelectedProject = useCallback(() => {
    if (!canLeaveCurrentRoute({ projectSlug: null, view: "rebuild", filePath: null, context: {} })) return;

    selectProjectRequestRef.current += 1;
    setSelectedProjectSlug(null);
    window.localStorage.removeItem(selectedProjectStorageKey);
    window.location.hash = "#/projects";
  }, [canLeaveCurrentRoute]);

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
        setNotice(errorMessage(error, "Could not create the project."));
        throw error;
      } finally {
        setCreatingProject(false);
      }
    },
    [refreshProjects, selectProject, setNotice],
  );

  const { resolveHumanAttention, startRebuild } = useRebuildActions({
    rebuildModels,
    requireSelectedProjectSlug,
    selectedRebuildModelId,
    setNotice,
    setRebuild,
  });

  useEffect(() => {
    void refreshProjects();
  }, [refreshProjects]);

  useSelectedProjectLifecycle({
    clearSelectedFile,
    projects,
    refreshBuildLog,
    refreshProjectFiles,
    refreshRebuildModels,
    refreshStatus,
    selectedProjectSlug,
    setBuildLog,
    setDesign,
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
    setNotice,
  });

  const project = {
    clearSelectedProject,
    createProject,
    creatingProject,
    projects,
    projectsError,
    projectsRoot,
    refreshProjects,
    selectProject,
    selectedProject,
    selectedProjectSlug,
  } satisfies ProjectController;
  const route = {
    navigateTo,
    openProjectFile,
    view,
  } satisfies RouteController;
  const fileWorkspace = {
    createHumanInputFolder,
    createHumanInputTextFile,
    deleteHumanInputFile,
    deleteHumanInputFolder,
    moveHumanInputFile,
    draft,
    fileLoading,
    hasUnsavedChanges,
    humanInputEmptyDirectories,
    inputMutationLoading,
    loading: treeLoading || fileLoading || saving || reverting || inputMutationLoading,
    projectFiles,
    refreshProjectFiles,
    refreshSelectedFile,
    revertSelected,
    reverting,
    saveSelected,
    saving,
    selected,
    selectedDiff,
    setDraft,
    treeLoading,
    uploadHumanInputFiles,
  } satisfies FileWorkspaceController;
  const rebuildWorkspace = {
    buildLog,
    models: rebuildModels,
    rebuild,
    refreshBuildLog,
    refreshRebuild,
    refreshRebuildModels,
    refreshStatus,
    resolveHumanAttention,
    selectedModelId: selectedRebuildModelId,
    setSelectedModelId: setSelectedRebuildModelId,
    startRebuild,
    status,
  } satisfies RebuildWorkspaceController;
  const designWorkspace = {
    design,
    refreshDesign,
  } satisfies DesignWorkspaceController;
  const toastWorkspace = {
    dismissToast,
    setNotice,
    toasts,
  } satisfies ToastWorkspaceController;

  return {
    project,
    route,
    fileWorkspace,
    rebuildWorkspace,
    designWorkspace,
    toastWorkspace,
  };
}
