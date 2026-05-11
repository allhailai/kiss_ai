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
import { uniqueFiles } from "../domain/files";
import { buildRouteHash, parseRouteHash } from "../navigation/routes";
import { designProjectFile, selectedProjectStorageKey, viewForProjectPath, type View } from "../navigation/views";
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
  const [treeLoading, setTreeLoading] = useState(false);
  const [fileLoading, setFileLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reverting, setReverting] = useState(false);
  const [inputMutationLoading, setInputMutationLoading] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const selectedProjectSlugRef = useRef(selectedProjectSlug);
  const treeRequestIdRef = useRef(0);
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

  useEffect(() => {
    selectedProjectSlugRef.current = selectedProjectSlug;
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
    const projectSlug = requireSelectedProjectSlug();
    const next = await api.status(projectSlug);
    if (selectedProjectSlugRef.current === projectSlug) {
      setStatus(next);
    }
  }, [requireSelectedProjectSlug]);

  const refreshBuildLog = useCallback(
    async (tabId?: string | null, path?: string | null, sectionId?: string | null) => {
      const projectSlug = requireSelectedProjectSlug();
      const next = await api.buildLog(projectSlug, tabId, path, sectionId);
      if (selectedProjectSlugRef.current === projectSlug) {
        setBuildLog(next);
      }
    },
    [requireSelectedProjectSlug],
  );

  const refreshDesign = useCallback(async () => {
    const projectSlug = requireSelectedProjectSlug();
    const next = await api.design(projectSlug);
    if (selectedProjectSlugRef.current === projectSlug) {
      setDesign(next);
    }
  }, [requireSelectedProjectSlug]);

  const refreshRebuild = useCallback(async () => {
    const projectSlug = requireSelectedProjectSlug();
    const next = await api.rebuildState(projectSlug);
    if (selectedProjectSlugRef.current === projectSlug) {
      setRebuild(next);
    }
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

    if (selectedProjectSlugRef.current === projectSlug) {
      setProjectFiles(uniqueFiles([...requirements.files, ...human.files, ...inputsAi.files, ...outputs.files, designProjectFile]));
    }
  }, [requireSelectedProjectSlug]);

  const loadTree = useCallback(
    async (section: string) => {
      const projectSlug = requireSelectedProjectSlug();
      const requestId = (treeRequestIdRef.current += 1);
      setTreeLoading(true);
      try {
        const next = await api.tree(projectSlug, section);
        if (selectedProjectSlugRef.current === projectSlug && treeRequestIdRef.current === requestId) {
          setFiles(next.files);
        }
      } finally {
        if (treeRequestIdRef.current === requestId) {
          setTreeLoading(false);
        }
      }
    },
    [requireSelectedProjectSlug],
  );

  const loadAnnotationTree = useCallback(async () => {
    const projectSlug = requireSelectedProjectSlug();
    const requestId = (treeRequestIdRef.current += 1);
    setTreeLoading(true);
    try {
      const [inputsAi, outputs] = await Promise.all([api.tree(projectSlug, "inputs-ai"), api.tree(projectSlug, "outputs")]);
      if (selectedProjectSlugRef.current === projectSlug && treeRequestIdRef.current === requestId) {
        setFiles(uniqueFiles([...inputsAi.files, ...outputs.files]));
      }
    } finally {
      if (treeRequestIdRef.current === requestId) {
        setTreeLoading(false);
      }
    }
  }, [requireSelectedProjectSlug]);

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
    (nextRoute: { projectSlug: string | null; view: View; filePath: string | null; context: Record<string, string> }) => {
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
    loadAnnotationTree,
    loadTree,
    refreshBuildLog,
    refreshDesign,
    refreshRebuild,
    selectFile,
    selectedProjectSlug,
    setFiles,
    setNotice,
    setRouteContext,
    setView,
  });

  const { navigateTo } = useRouteSync({ applyRoute, canLeaveCurrentRoute, currentRoute, onRouteError: setNotice, selectedProjectSlug, setSelectedProjectSlug });

  const replaceRouteContext = useCallback(
    (patch: Record<string, string | null | undefined>) => {
      if (!selectedProjectSlug) return;

      setRouteContext((current) => {
        const currentRoute = parseRouteHash(window.location.hash);
        const nextContext = { ...currentRoute.context, ...current };
        for (const [key, value] of Object.entries(patch)) {
          if (value) {
            nextContext[key] = value;
          } else {
            delete nextContext[key];
          }
        }

        const nextHash = buildRouteHash(selectedProjectSlug, currentRoute.view || view, currentRoute.filePath, nextContext);
        if (window.location.hash !== nextHash) {
          window.history.replaceState(null, "", nextHash);
        }

        return nextContext;
      });
    },
    [selectedProjectSlug, view],
  );

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

  const { deleteHumanInputFile, uploadHumanInputFiles } = useHumanInputs({
    clearSelectedFile,
    loadTree,
    refreshProjectFiles,
    requireSelectedProjectSlug,
    selected,
    setInputMutationLoading,
    setNotice,
    view,
  });

  const selectProject = useCallback(
    (projectSlug: string) => {
      if (!canLeaveCurrentRoute({ projectSlug, view: "rebuild", filePath: null, context: {} })) return;

      setSelectedProjectSlug(projectSlug);
      window.localStorage.setItem(selectedProjectStorageKey, projectSlug);
      window.location.hash = buildRouteHash(projectSlug, "rebuild");
    },
    [canLeaveCurrentRoute],
  );

  const clearSelectedProject = useCallback(() => {
    if (!canLeaveCurrentRoute({ projectSlug: null, view: "rebuild", filePath: null, context: {} })) return;

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
        setNotice(error instanceof Error ? error.message : "Could not create the project.");
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
    replaceRouteContext,
    routeContext,
    view,
  } satisfies RouteController;
  const fileWorkspace = {
    deleteHumanInputFile,
    draft,
    fileLoading,
    files,
    hasUnsavedChanges,
    inputMutationLoading,
    loading: treeLoading || fileLoading || saving || reverting || inputMutationLoading,
    projectFiles,
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
