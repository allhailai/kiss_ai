import { useCallback, useEffect, useMemo, useState } from "react";
import {
  api,
  type DesignState,
  type FileContent,
  type FileDiff,
  type ProjectFile,
  type ProjectStatus,
  type ProjectSummary,
  type RebuildState,
} from "../api";
import { uniqueFiles } from "../domain/files";
import { viewForProjectPath } from "../domain/links";
import { type Toast } from "../features/toast/ToastViewport";
import { buildRouteHash, parseRouteHash } from "./routes";
import { designProjectFile, selectedProjectStorageKey, type RouteState, type View } from "./views";

export function useProjectWorkspace() {
  const [view, setView] = useState<View>("dashboard");
  const [projectsRoot, setProjectsRoot] = useState("");
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [selectedProjectSlug, setSelectedProjectSlug] = useState<string | null>(() =>
    window.localStorage.getItem(selectedProjectStorageKey),
  );
  const [projectsError, setProjectsError] = useState("");
  const [status, setStatus] = useState<ProjectStatus | null>(null);
  const [rebuild, setRebuild] = useState<RebuildState | null>(null);
  const [design, setDesign] = useState<DesignState | null>(null);
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [projectFiles, setProjectFiles] = useState<ProjectFile[]>([designProjectFile]);
  const [selected, setSelected] = useState<FileContent | null>(null);
  const [selectedDiff, setSelectedDiff] = useState<FileDiff | null>(null);
  const [draft, setDraft] = useState("");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [loading, setLoading] = useState(false);
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

  const refreshDesign = useCallback(async () => {
    setDesign(await api.design(requireSelectedProjectSlug()));
  }, [requireSelectedProjectSlug]);

  const refreshRebuild = useCallback(async () => {
    setRebuild(await api.rebuildState(requireSelectedProjectSlug()));
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
      }

      if (route.filePath && nextView !== "design") {
        await selectFile(route.filePath);
      }
    },
    [loadTree, refreshDesign, refreshRebuild, selectFile, selectedProjectSlug, setNotice],
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
      const nextView = viewForProjectPath(path, view);

      if (!nextView) {
        setNotice("This link points to a file that is not available in the lab UI yet.");
        return;
      }

      navigateTo(nextView, path);
    },
    [navigateTo, setNotice, view],
  );

  const selectProject = useCallback((projectSlug: string) => {
    setSelectedProjectSlug(projectSlug);
    window.localStorage.setItem(selectedProjectStorageKey, projectSlug);
    window.location.hash = buildRouteHash(projectSlug, "dashboard");
  }, []);

  const clearSelectedProject = useCallback(() => {
    setSelectedProjectSlug(null);
    window.localStorage.removeItem(selectedProjectStorageKey);
    window.location.hash = "#/projects";
  }, []);

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
    const next = await api.startRebuild(requireSelectedProjectSlug());
    setRebuild(next);

    if (next.status === "blocked") {
      setNotice(next.message);
    }
  }, [requireSelectedProjectSlug, setNotice]);

  useEffect(() => {
    void refreshProjects();
  }, [refreshProjects]);

  useEffect(() => {
    if (!selectedProjectSlug) {
      window.localStorage.removeItem(selectedProjectStorageKey);
      setStatus(null);
      setRebuild(null);
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
    void refreshProjectFiles();
  }, [refreshDesign, refreshProjectFiles, refreshRebuild, refreshStatus, selectedProjectSlug]);

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

  return {
    view,
    projectsRoot,
    projects,
    selectedProjectSlug,
    selectedProject,
    projectsError,
    status,
    rebuild,
    design,
    files,
    projectFiles,
    selected,
    selectedDiff,
    draft,
    toasts,
    loading,
    workflowMenuOpen,
    setDraft,
    setWorkflowMenuOpen,
    dismissToast,
    refreshProjects,
    refreshStatus,
    refreshDesign,
    refreshRebuild,
    navigateTo,
    openProjectFile,
    selectProject,
    clearSelectedProject,
    saveSelected,
    revertSelected,
    startRebuild,
    setNotice,
  };
}
