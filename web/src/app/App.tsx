import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { buildThemeStyle } from "./theme";
import { useProjectWorkspace } from "./useProjectWorkspace";
import { RightPanelToggle } from "./RightPanelToggle";
import { panelForKind, useRightPanelSurface, type RightPanelKind } from "./hooks/useRightPanelSurface";
import { useRightPanelWidth } from "./hooks/useRightPanelWidth";
import { useLeftNavWidth } from "./hooks/useLeftNavWidth";
import { useAgentChatPanel } from "./hooks/useAgentChatPanel";
import { useKeybindings } from "./hooks/useKeybindings";
import { useProjectChat } from "./hooks/useProjectChat";
import { useChatActions } from "./hooks/useChatActions";

import { ProjectPicker } from "../features/projectPicker/ProjectPicker";
import { GlobalFileSearch } from "../features/search/GlobalFileSearch";
import { ToastViewport } from "../features/toast/ToastViewport";
import { useAgentFileContext } from "./hooks/useAgentFileContext";
import { readAgentChatConversationId } from "./rightPanelSurfaceStorage";
import type { AuthUser } from "../contracts/api";
import { BuildProvider, type BuildContextValue } from "./contexts/BuildContext";
import { RouteProvider } from "./contexts/RouteContext";
import { ToastProvider } from "./contexts/ToastContext";
import { UpdateCheckerModal } from "./UpdateCheckerModal";
import { SettingsModal } from "./SettingsModal";
import { MainContentArea } from "./MainContentArea";
import { RightPanelOrchestrator } from "./RightPanelOrchestrator";
import { AppSidebar } from "./AppSidebar";
import { LoginPage } from "./LoginPage";
import { LogoutButton } from "./LogoutButton";
import { authApi } from "../data/authApi";
import { request } from "../data/request";
import type { VersionResponse } from "../contracts/api";

// ── Auth gate: wraps App in login check for server mode ──

type AuthState = "loading" | "authenticated" | "unauthenticated" | "standalone";

export function AppWithAuth() {
  const [authState, setAuthState] = useState<AuthState>("loading");
  const [, setCurrentUser] = useState<AuthUser | null>(null);

  const checkAuth = useCallback(async () => {
    try {
      // Check mode from version endpoint (always accessible)
      const version = await request<VersionResponse>("/api/version");
      if (version.mode !== "server") {
        setAuthState("standalone");
        return;
      }

      // Server mode — check auth status
      try {
        const user = await authApi.me();
        setCurrentUser(user);
        setAuthState("authenticated");
      } catch {
        setAuthState("unauthenticated");
      }
    } catch {
      // Can't reach server — assume standalone (dev mode, server starting up)
      setAuthState("standalone");
    }
  }, []);

  useEffect(() => {
    void checkAuth();
  }, [checkAuth]);

  // Listen for global 401 events (session expired)
  useEffect(() => {
    const handleAuthRequired = () => {
      if (authState === "authenticated") {
        setAuthState("unauthenticated");
        setCurrentUser(null);
      }
    };

    window.addEventListener("kiss-ai-auth-required", handleAuthRequired);
    return () => window.removeEventListener("kiss-ai-auth-required", handleAuthRequired);
  }, [authState]);

  if (authState === "loading") {
    return (
      <div className="login-page">
        <div className="login-card" style={{ textAlign: "center", padding: "3rem 2rem" }}>
          <p style={{ color: "var(--color-secondary)", margin: 0 }}>Loading…</p>
        </div>
      </div>
    );
  }

  if (authState === "unauthenticated") {
    return (
      <LoginPage
        onLoginSuccess={(user) => {
          setCurrentUser(user);
          setAuthState("authenticated");
        }}
      />
    );
  }

  // standalone or authenticated — render the full app
  return <App />;
}

export function App() {
  const workspace = useProjectWorkspace();
  const { designWorkspace, fileWorkspace, project, rebuildWorkspace, route, toastWorkspace } = workspace;
  const rightPanelSurface = useRightPanelSurface();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const leftNavWidth = useLeftNavWidth({ projectSlug: project.selectedProjectSlug ?? "", collapsed: sidebarCollapsed });
  const themeStyle = useMemo(() => buildThemeStyle(designWorkspace.design), [designWorkspace.design]);
  const rightPanelWidth = useRightPanelWidth({
    panelKind: rightPanelSurface.rightPanel?.kind ?? null,
    view: route.view,
  });
  const appStyle = useMemo(
    () =>
      ({
        ...themeStyle,
        "--right-panel-width": rightPanelWidth.cssValue,
        "--left-nav-width": leftNavWidth.cssValue,
      }) as CSSProperties,
    [leftNavWidth.cssValue, rightPanelWidth.cssValue, themeStyle],
  );
  const preferredAgentChatConversationId = useMemo(
    () => readAgentChatConversationId(project.selectedProjectSlug),
    [project.selectedProjectSlug],
  );

  const [topicsRefreshKey, setTopicsRefreshKey] = useState(0);

  const projectChat = useProjectChat({
    preferredConversationId: preferredAgentChatConversationId,
    projectSlug: project.selectedProjectSlug,
    selectedModelId: rebuildWorkspace.selectedModelId,
    projectFiles: fileWorkspace.projectFiles,
    onAgentComplete: async () => {
      await fileWorkspace.refreshProjectFiles();
      await fileWorkspace.refreshSelectedFile();
      await rebuildWorkspace.refreshStatus();
      setTopicsRefreshKey((k) => k + 1);
    },
    onNotice: toastWorkspace.setNotice,
    onProposalApplied: async () => {
      await fileWorkspace.refreshProjectFiles();
      await fileWorkspace.refreshSelectedFile();
      await rebuildWorkspace.refreshStatus();
    },
  });

  const { closeAgentPanel, isAgentPanelOpen, openAgentChatPanel, selectProjectChatConversation, toggleAgentPanel } = useAgentChatPanel({
    projectChat,
    projectSlug: project.selectedProjectSlug,
    rightPanelSurface,
    view: route.view,
  });
  useKeybindings({
    toggleLeftPanel: () => setSidebarCollapsed((prev) => !prev),
    toggleRightPanel: toggleAgentPanel,
  });
  const agentFileContext = useAgentFileContext({
    aiEditableFiles: projectChat.aiEditableFiles,
    contextFiles: projectChat.contextFiles,
    draft: fileWorkspace.draft,
    openProjectFile: route.openProjectFile,
    projectFiles: fileWorkspace.projectFiles,
    projectSlug: project.selectedProjectSlug,
    selected: fileWorkspace.selected,
    setAiEditableFiles: projectChat.setAiEditableFiles,
    setContextFiles: projectChat.setContextFiles,
  });
  const chatActions = useChatActions({
    fileWorkspace,
    openAgentChatPanel,
    projectChat,
    projectSlug: project.selectedProjectSlug,
    rebuildWorkspace,
    route,
    toastWorkspace,
  });

  const addTopicToChat = useCallback((topicId: string, label: string) => {
    projectChat.setContextTopics((current) => {
      if (current.some((t) => t.topicId === topicId)) return current;
      return [...current, { topicId, label }];
    });
    if (!isAgentPanelOpen) openAgentChatPanel();
  }, [projectChat, isAgentPanelOpen, openAgentChatPanel]);

  const openProjectFileWithAgentContext = (path: string) => {
    agentFileContext.openProjectFileWithAgentContext(path, isAgentPanelOpen);
  };

  const openBuildProjectPanel = () => {
    rightPanelSurface.openPanel(panelForKind("build-project"));
    void rebuildWorkspace.refreshRebuild();
  };
  const selectRightPanelKind = (kind: RightPanelKind) => {
    if (kind === "agent-chat") {
      openAgentChatPanel();
      return;
    }
    openBuildProjectPanel();
  };
  const closeRightPanel = () => {
    if (rightPanelSurface.rightPanel?.kind === "agent-chat") {
      closeAgentPanel();
      return;
    }
    rightPanelSurface.closePanel();
  };

  useEffect(() => {
    if (rightPanelSurface.rightPanel?.kind === "build-project" && project.selectedProjectSlug) {
      void rebuildWorkspace.refreshRebuild();
    }
  }, [project.selectedProjectSlug, rebuildWorkspace.refreshRebuild, rightPanelSurface.rightPanel?.kind]);

  useEffect(() => {
    const projectName = rebuildWorkspace.status?.projectName ?? project.selectedProject?.name;
    document.title = projectName ? `kiss: ${projectName}` : "kiss";
  }, [project.selectedProject?.name, rebuildWorkspace.status?.projectName]);

  // Auto-open build panel when navigating from a legacy /rebuild URL
  useEffect(() => {
    if (route.context.panel === "build-project" && !rightPanelSurface.rightPanel) {
      openBuildProjectPanel();
      // Clear the context so it doesn't re-trigger on re-render
      route.navigateTo(route.view, undefined, {});
    }
  }, [route.context.panel]);
  const startRebuildWithRequirementsCheck = () => {
    void rebuildWorkspace.startRebuild();
  };
  const buildContextValue: BuildContextValue = useMemo(
    () => ({
      isBuilding: rebuildWorkspace.rebuild?.running ?? false,
      rebuild: rebuildWorkspace.rebuild,
      buildPhase: null,
      startRebuild: startRebuildWithRequirementsCheck,
      openBuildPanel: openBuildProjectPanel,
      refreshRebuild: rebuildWorkspace.refreshRebuild,
      refreshStatus: rebuildWorkspace.refreshStatus,
      models: rebuildWorkspace.models,
      selectedModelId: rebuildWorkspace.selectedModelId,
      setSelectedModelId: rebuildWorkspace.setSelectedModelId,
      status: rebuildWorkspace.status,
    }),
    [
      openBuildProjectPanel,
      rebuildWorkspace.models,
      rebuildWorkspace.rebuild,
      rebuildWorkspace.refreshRebuild,
      rebuildWorkspace.refreshStatus,
      rebuildWorkspace.selectedModelId,
      rebuildWorkspace.setSelectedModelId,
      rebuildWorkspace.status,
      startRebuildWithRequirementsCheck,
    ],
  );

  if (!project.selectedProjectSlug || !project.selectedProject) {
    return (
      <ToastProvider value={toastWorkspace}>
        <main className="app-shell project-picker-shell" style={appStyle}>
          <ToastViewport toasts={toastWorkspace.toasts} onDismiss={toastWorkspace.dismissToast} />
          <ProjectPicker
            creatingProject={project.creatingProject}
            error={project.projectsError}
            onCreateProject={project.createProject}
            onSelect={project.selectProject}
            projects={project.projects}
            projectsRoot={project.projectsRoot}
            settingsSlot={<SettingsModal />}
            logoutSlot={<LogoutButton />}
            updateCheckerSlot={<UpdateCheckerModal />}
          />
        </main>
      </ToastProvider>
    );
  }

  const appShellClassName = `${sidebarCollapsed ? "app-shell sidebar-collapsed" : "app-shell"}${
    rightPanelSurface.rightPanel ? ` right-panel-open right-panel-${rightPanelSurface.rightPanel.kind}` : ""
  }`;

  return (
    <ToastProvider value={toastWorkspace}>
    <RouteProvider value={route}>
    <BuildProvider value={buildContextValue}>
        <main className={appShellClassName} style={appStyle}>
          <GlobalFileSearch
            projectName={rebuildWorkspace.status?.projectName ?? project.selectedProject.name}
            projectSlug={project.selectedProjectSlug}
            onOpenFile={openProjectFileWithAgentContext}
            onOpenProjectHome={() => route.navigateTo("ai")}
            onSwitchProject={project.clearSelectedProject}
          />
          <RightPanelToggle active={isAgentPanelOpen} label="AI" onToggle={toggleAgentPanel} />
          <ToastViewport toasts={toastWorkspace.toasts} onDismiss={toastWorkspace.dismissToast} />

          <AppSidebar
            collapsed={sidebarCollapsed}
            fileWorkspace={fileWorkspace}
            leftNavWidth={leftNavWidth}
            onCollapse={() => setSidebarCollapsed(true)}
            onExpand={() => setSidebarCollapsed(false)}
            onOpenFile={openProjectFileWithAgentContext}
            projectSlug={project.selectedProjectSlug}
            rebuildWorkspace={rebuildWorkspace}
          />

          <MainContentArea
            designWorkspace={designWorkspace}
            fileWorkspace={fileWorkspace}
            onAiFileAssist={() => void chatActions.assistCurrentFile()}
            onAddTopicToChat={addTopicToChat}
            onNewTopicViaChat={chatActions.requestNewTopicViaChat}
            onOpenFile={openProjectFileWithAgentContext}
            projectChat={projectChat}
            projectSlug={project.selectedProjectSlug}
            rebuildWorkspace={rebuildWorkspace}
            selectProjectChatConversation={selectProjectChatConversation}
            topicsRefreshKey={topicsRefreshKey}
          />

          {rightPanelSurface.rightPanel ? (
            <RightPanelOrchestrator
              agentFileContext={agentFileContext}
              applyChatFileEdit={chatActions.applyChatFileEdit}
              applyChatFileRename={chatActions.applyChatFileRename}
              applyChatArtifactRename={chatActions.applyChatArtifactRename}
              closeRightPanel={closeRightPanel}
              draftSeed={chatActions.agentDraftSeed}
              fileWorkspaceProjectFiles={fileWorkspace.projectFiles}
              onCreateTopic={chatActions.handleCreateTopic}
              onRefreshAfterMutation={chatActions.refreshAfterMutation}
              projectChat={projectChat}
              projectSlug={project.selectedProjectSlug}
              rebuildWorkspace={rebuildWorkspace}
              resize={
                rightPanelWidth.isResizable
                  ? {
                      maxWidthPx: rightPanelWidth.maxWidthPx,
                      minWidthPx: rightPanelWidth.minWidthPx,
                      onCommit: () => rightPanelWidth.commitWidth(),
                      onKeyboardResize: rightPanelWidth.resizeByKeyboard,
                      onResize: rightPanelWidth.resizeFromClientX,
                      widthPx: rightPanelWidth.widthPx,
                    }
                  : undefined
              }
              rightPanel={rightPanelSurface.rightPanel}
              selectRightPanelKind={selectRightPanelKind}
              startRebuild={startRebuildWithRequirementsCheck}
            />
          ) : null}
        </main>
    </BuildProvider>
    </RouteProvider>
    </ToastProvider>
  );
}
