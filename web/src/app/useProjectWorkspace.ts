import { useCallback, useEffect, useMemo, useState } from "react";
import {
  api,
  type BuildLogState,
  type DesignState,
  type FileContent,
  type FileDiff,
  type ProjectFile,
  type ProjectStatus,
  type ProjectSummary,
  type RebuildModel,
  type RebuildState,
  type ResolveHumanAttentionRequest,
} from "../api";
import { uniqueFiles } from "../domain/files";
import { buildRouteHash, parseRouteHash } from "./routes";
import { type Toast } from "./toast";
import { designProjectFile, selectedProjectStorageKey, viewForProjectPath, type RouteState, type View } from "./views";

export function useProjectWorkspace() {
  const [view, setView] = useState<View>("build-log");
  const [projectsRoot, setProjectsRoot] = useState("");
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [selectedProjectSlug, setSelectedProjectSlug] = useState<string | null>(() =>
    window.localStorage.getItem(selectedProjectStorageKey),
  );
  const [projectsError, setProjectsError] = useState("");
  const [status, setStatus] = useState<ProjectStatus | null>(null);
  const [buildLog, setBuildLog] = useState<BuildLogState | null>(null);
  const [rebuild, setRebuild] = useState<RebuildState | null>(null);
  const [rebuildModels, setRebuildModels] = useState<RebuildModel[]>([]);
  const [selectedRebuildModelId, setSelectedRebuildModelId] = useState("");
  const [design, setDesign] = useState<DesignState | null>(null);
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [projectFiles, setProjectFiles] = useState<ProjectFile[]>([designProjectFile]);
  const [selected, setSelected] = useState<FileContent | null>(null);
  const [selectedDiff, setSelectedDiff] = useState<FileDiff | null>(null);
  const [draft, setDraft] = useState("");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [loading, setLoading] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [workflowMenuOpen, setWorkflowMenuOpen] = useState(false);

  const selectedProject = useMemo(
    () => projects.find((project) => project.slug === selectedProjectSlug) ?? null,
    [projects, selectedProjectSlug],
  );

  const setNotice = useCallback((message: string) => {
    const trimmedMessage = message.trim();

    if (!trimmedMessage) {
      setToasts([]);
      return;
    }

    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setToasts((current) => [...current.slice(-2), { id, message: trimmedMessage }]);

    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 6000);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

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
    async (summaryPath?: string | null, sectionId?: string | null) => {
      setBuildLog(await api.buildLog(requireSelectedProjectSlug(), summaryPath, sectionId));
    },
    [requireSelectedProjectSlug],
  );

  const refreshDesign = useCallback(async () => {
    setDesign(await api.design(requireSelectedProjectSlug()));
  }, [requireSelectedProjectSlug]);

  const refreshRebuild = useCallback(async () => {
    setRebuild(await api.rebuildState(requireSelectedProjectSlug()));
  }, [requireSelectedProjectSlug]);

  const refreshRebuildModels = useCallback(async () => {
    const response = await api.rebuildModels();
    setRebuildModels(response.models);
    setSelectedRebuildModelId((current) => {
      if (current && response.models.some((model) => model.id === current)) return current;
      return response.defaultModelId ?? response.models[0]?.id ?? "";
    });
  }, []);

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

  const selectFile = useCallback(
    async (path: string) => {
      const projectSlug = requireSelectedProjectSlug();
      setLoading(true);
      setNotice("");
      try {
        const file = await api.file(projectSlug, path);
        const diff = await api.fileDiff(projectSlug, path);
        setSelected(file);
        setSelectedDiff(diff);
        setDraft(file.content);
      } catch (error) {
        setSelected(null);
        setSelectedDiff(null);
        setDraft("");
        setNotice(error instanceof Error ? error.message : "Could not open the selected file.");
      } finally {
        setLoading(false);
      }
    },
    [requireSelectedProjectSlug, setNotice],
  );

  const applyRoute = useCallback(
    async (route: RouteState) => {
      if (!route.projectSlug || route.projectSlug !== selectedProjectSlug) return;

      const nextView = route.view;
      setView(nextView);
      setWorkflowMenuOpen(false);
      setNotice("");
      setSelected(null);
      setSelectedDiff(null);
      setDraft("");

      if (nextView === "requirements") {
        await loadTree("requirements");
      } else if (nextView === "inputs") {
        await loadTree("human");
      } else if (nextView === "outputs") {
        await loadTree("outputs");
      } else if (nextView === "annotations") {
        setFiles((await api.tree(route.projectSlug, "inputs-ai")).files);
      } else {
        setFiles([]);
      }

      if (nextView === "design") {
        setFiles([designProjectFile]);
        await refreshDesign();
        await selectFile(route.filePath ?? "human_design_identity.md");
      }

      if (nextView === "rebuild") {
        await refreshRebuild();
        await refreshRebuildModels();
      }

      if (nextView === "build-log") {
        await refreshBuildLog();
      }

      if (route.filePath && nextView !== "design") {
        await selectFile(route.filePath);
      }
    },
    [loadTree, refreshBuildLog, refreshDesign, refreshRebuild, refreshRebuildModels, selectFile, selectedProjectSlug, setNotice],
  );

  const navigateTo = useCallback(
    (nextView: View, filePath?: string | null) => {
      const nextHash = buildRouteHash(selectedProjectSlug, nextView, filePath);

      if (window.location.hash === nextHash) {
        void applyRoute({ projectSlug: selectedProjectSlug, view: nextView, filePath: filePath ?? null });
        return;
      }

      window.location.hash = nextHash;
    },
    [applyRoute, selectedProjectSlug],
  );

  const openProjectFile = useCallback(
    (path: string) => {
      const nextView = viewForProjectPath(path);

      if (!nextView) {
        setNotice("This link points to a file that is not available in the lab UI yet.");
        return;
      }

      navigateTo(nextView, path);
    },
    [navigateTo, setNotice],
  );

  const selectProject = useCallback((projectSlug: string) => {
    setSelectedProjectSlug(projectSlug);
    window.localStorage.setItem(selectedProjectStorageKey, projectSlug);
    window.location.hash = buildRouteHash(projectSlug, "build-log");
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

  const saveSelected = useCallback(async () => {
    if (!selected) return;
    const projectSlug = requireSelectedProjectSlug();

    const saved = await api.saveFile(projectSlug, selected.path, draft);
    const diff = await api.fileDiff(projectSlug, saved.path);
    setSelected(saved);
    setSelectedDiff(diff);
    setDraft(saved.content);

    if (saved.path === "human_design_identity.md") {
      await refreshDesign();
    }

    await refreshStatus();
  }, [draft, refreshDesign, refreshStatus, requireSelectedProjectSlug, selected]);

  const revertSelected = useCallback(async () => {
    if (!selected) return;
    const projectSlug = requireSelectedProjectSlug();

    const reverted = await api.revertFile(projectSlug, selected.path);
    const diff = await api.fileDiff(projectSlug, reverted.path);
    setSelected(reverted);
    setSelectedDiff(diff);
    setDraft(reverted.content);

    if (reverted.path === "human_design_identity.md") {
      await refreshDesign();
    }

    await refreshStatus();
  }, [refreshDesign, refreshStatus, requireSelectedProjectSlug, selected]);

  const startRebuild = useCallback(async () => {
    setNotice("");
    const next = await api.startRebuild(requireSelectedProjectSlug(), selectedRebuildModelId || rebuildModels[0]?.id || "default");
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
        modelId: selectedRebuildModelId || rebuildModels[0]?.id || "default",
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

  useEffect(() => {
    if (!selectedProjectSlug) {
      window.localStorage.removeItem(selectedProjectStorageKey);
      setStatus(null);
      setBuildLog(null);
      setRebuild(null);
      setRebuildModels([]);
      setSelectedRebuildModelId("");
      setDesign(null);
      setFiles([]);
      setProjectFiles([designProjectFile]);
      setSelected(null);
      setSelectedDiff(null);
      setDraft("");
      return;
    }

    window.localStorage.setItem(selectedProjectStorageKey, selectedProjectSlug);
    void refreshStatus();
    void refreshDesign();
    void refreshRebuild();
    void refreshRebuildModels();
    void refreshProjectFiles();
  }, [refreshDesign, refreshProjectFiles, refreshRebuild, refreshRebuildModels, refreshStatus, selectedProjectSlug]);

  useEffect(() => {
    if (!projects.length || !selectedProjectSlug) return;
    if (projects.some((project) => project.slug === selectedProjectSlug)) return;

    setSelectedProjectSlug(null);
    window.history.replaceState(null, "", "#/projects");
    setNotice("The previously selected project is no longer available.");
  }, [projects, selectedProjectSlug, setNotice]);

  useEffect(() => {
    const syncRoute = () => {
      const route = parseRouteHash(window.location.hash);
      const routeProjectSlug = route.projectSlug ?? selectedProjectSlug;

      if (!routeProjectSlug) {
        if (window.location.hash !== "#/projects") {
          window.history.replaceState(null, "", "#/projects");
        }
        return;
      }

      if (route.projectSlug !== routeProjectSlug) {
        const normalized = buildRouteHash(routeProjectSlug, route.view, route.filePath);
        if (window.location.hash !== normalized) {
          window.history.replaceState(null, "", normalized);
        }
      }

      if (selectedProjectSlug !== routeProjectSlug) {
        setSelectedProjectSlug(routeProjectSlug);
        return;
      }

      void applyRoute({ ...route, projectSlug: routeProjectSlug });
    };

    syncRoute();
    window.addEventListener("hashchange", syncRoute);

    return () => window.removeEventListener("hashchange", syncRoute);
  }, [applyRoute, selectedProjectSlug]);

  useEffect(() => {
    if (!rebuild?.running) return;

    const interval = window.setInterval(() => {
      void refreshRebuild();
      void refreshStatus();
    }, 2500);

    return () => window.clearInterval(interval);
  }, [rebuild?.running, refreshRebuild, refreshStatus]);

  useEffect(() => {
    if (!selectedProjectSlug || !rebuild?.running || typeof EventSource === "undefined") return;

    const eventSource = new EventSource(api.rebuildEventsUrl(selectedProjectSlug));
    const syncRebuild = (event: MessageEvent<string>) => {
      try {
        const payload = JSON.parse(event.data) as unknown;
        const next =
          payload && typeof payload === "object" && "state" in payload
            ? (payload as { state?: RebuildState }).state
            : (payload as RebuildState);
        if (next) {
          setRebuild(next);
          if (!next.running && ["finished", "finished_with_attention", "error", "blocked", "interrupted"].includes(next.status)) {
            void refreshStatus();
            void refreshBuildLog();
          }
        }
      } catch {
        // Polling remains the fallback if the live event payload cannot be parsed.
      }
    };

    eventSource.addEventListener("snapshot", syncRebuild);
    eventSource.addEventListener("event", syncRebuild);
    eventSource.onerror = () => {
      eventSource.close();
    };

    return () => eventSource.close();
  }, [rebuild?.running, refreshBuildLog, refreshStatus, selectedProjectSlug]);

  return {
    view,
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
    workflowMenuOpen,
    setDraft,
    setSelectedRebuildModelId,
    setWorkflowMenuOpen,
    dismissToast,
    refreshProjects,
    refreshStatus,
    refreshBuildLog,
    refreshDesign,
    refreshRebuild,
    refreshRebuildModels,
    navigateTo,
    openProjectFile,
    selectProject,
    clearSelectedProject,
    createProject,
    saveSelected,
    revertSelected,
    startRebuild,
    resolveHumanAttention,
    setNotice,
  };
}
