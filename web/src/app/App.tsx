import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { projectPathPrefixes } from "../domain/projectPaths";
import { buildThemeStyle } from "./theme";
import { useProjectWorkspace } from "./useProjectWorkspace";
import { RightPanelSurface } from "./RightPanelSurface";
import { useRightPanelSurface } from "./hooks/useRightPanelSurface";
import { panelWidthContextKey, useRightPanelWidth } from "./hooks/useRightPanelWidth";
import { type View } from "../navigation/views";
import { BuildLogWorkspace } from "../features/buildLog/BuildLogWorkspace";
import { ProjectChatConversationHistory, ProjectChatPanel, useProjectChat } from "../features/chat/ChatWorkspace";
import { Dashboard } from "../features/dashboard/Dashboard";
import { DesignWorkspace } from "../features/design/DesignWorkspace";
import { FileWorkspace } from "../features/files/FileWorkspace";
import { isRequirementAutoUpdatePath, RequirementsAutoUpdateModal } from "../features/files/RequirementsAutoUpdateModal";
import { SimplifiedNavigator } from "../features/navigation/WorkflowMenus";
import { ProjectPicker } from "../features/projectPicker/ProjectPicker";
import { RebuildWorkspace } from "../features/rebuild/RebuildWorkspace";
import { GlobalFileSearch } from "../features/search/GlobalFileSearch";
import { ToastViewport } from "../features/toast/ToastViewport";
import { RightPanelAgentChat } from "../features/agents/RightPanelAgentChat";

const fileWorkspaceByView: Partial<Record<View, { title: string; explainer?: string }>> = {
  requirements: {
    title: "Human-Owned Requirements",
  },
  inputs: {
    title: "Human Inputs",
    explainer: `Human source material belongs under ${projectPathPrefixes.humanInput}. Drop files here to add source material to the project.`,
  },
  outputs: {
    title: "Outputs",
    explainer: `Generated outputs can be reviewed and edited here. Saves write directly to ${projectPathPrefixes.output}.`,
  },
  annotations: {
    title: "Annotation Workspace",
    explainer: `Files under ${projectPathPrefixes.aiInput} are AI-managed. Human edits here are intentionally visualized as annotations and detected through Git diff.`,
  },
};

const projectChatPanel = { kind: "project-chat", title: "Project Chat" } as const;

export function App() {
  const workspace = useProjectWorkspace();
  const rightPanelSurface = useRightPanelSurface();
  const [autoUpdateOpen, setAutoUpdateOpen] = useState(false);
  const [projectChatPanelDismissed, setProjectChatPanelDismissed] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const projectChatVisitKeyRef = useRef<string | null>(null);
  const themeStyle = useMemo(() => buildThemeStyle(workspace.design), [workspace.design]);
  const rightPanelWidth = useRightPanelWidth({
    panelKind: rightPanelSurface.rightPanel?.kind ?? null,
    replaceRouteContext: workspace.replaceRouteContext,
    routeContext: workspace.routeContext,
    view: workspace.view,
  });
  const appStyle = useMemo(
    () =>
      ({
        ...themeStyle,
        "--right-panel-width": rightPanelWidth.cssValue,
      }) as CSSProperties,
    [rightPanelWidth.cssValue, themeStyle],
  );
  const projectChat = useProjectChat({
    projectSlug: workspace.selectedProjectSlug,
    selectedModelId: workspace.selectedRebuildModelId,
    projectFiles: workspace.projectFiles,
    onNotice: workspace.setNotice,
  });
  const navigateTo = (view: View, filePath?: string | null, context?: Record<string, string>) => workspace.navigateTo(view, filePath, context);
  const openProjectChatPanel = () => {
    setProjectChatPanelDismissed(false);
    rightPanelSurface.openPanel(projectChatPanel);
    if (workspace.view === "chat" && !workspace.routeContext[panelWidthContextKey]) {
      workspace.replaceRouteContext({ [panelWidthContextKey]: "55%" });
    }
  };
  const selectProjectChatConversation = (conversationId: string) => {
    openProjectChatPanel();
    navigateTo("chat", null, {
      ...workspace.routeContext,
      conversation: conversationId,
      [panelWidthContextKey]: workspace.routeContext[panelWidthContextKey] || "55%",
    });
  };

  useEffect(() => {
    if (!workspace.selectedProjectSlug || workspace.view !== "chat") {
      projectChatVisitKeyRef.current = null;
      if (projectChatPanelDismissed) setProjectChatPanelDismissed(false);
      return;
    }

    if (projectChatVisitKeyRef.current !== workspace.selectedProjectSlug) {
      projectChatVisitKeyRef.current = workspace.selectedProjectSlug;
      if (projectChatPanelDismissed) setProjectChatPanelDismissed(false);
      openProjectChatPanel();
      return;
    }

    if (!projectChatPanelDismissed && !rightPanelSurface.rightPanel) {
      openProjectChatPanel();
    }
  }, [projectChatPanelDismissed, rightPanelSurface.rightPanel, workspace.routeContext, workspace.selectedProjectSlug, workspace.view]);

  useEffect(() => {
    if (workspace.view !== "chat") return;

    const conversationId = workspace.routeContext.conversation;
    if (!conversationId || projectChat.activeConversation?.id === conversationId) return;

    openProjectChatPanel();
    void projectChat.openConversation(conversationId);
  }, [projectChat.activeConversation?.id, workspace.routeContext.conversation, workspace.view]);

  if (!workspace.selectedProjectSlug || !workspace.selectedProject) {
    return (
      <main className="app-shell project-picker-shell" style={appStyle}>
        <ToastViewport toasts={workspace.toasts} onDismiss={workspace.dismissToast} />
        <ProjectPicker
          creatingProject={workspace.creatingProject}
          error={workspace.projectsError}
          onCreateProject={workspace.createProject}
          onSelect={workspace.selectProject}
          projects={workspace.projects}
          projectsRoot={workspace.projectsRoot}
        />
      </main>
    );
  }

  const fileWorkspace = fileWorkspaceByView[workspace.view];
  const selectedAutoUpdatePath =
    workspace.selected?.path && isRequirementAutoUpdatePath(workspace.selected.path) ? workspace.selected.path : null;
  const appShellClassName = `${sidebarCollapsed ? "app-shell sidebar-collapsed" : "app-shell"}${workspace.view === "chat" ? " chat-view" : ""}${
    rightPanelSurface.rightPanel ? ` right-panel-open right-panel-${rightPanelSurface.rightPanel.kind}` : ""
  }`;
  const handleRightPanelClose = () => {
    if (workspace.view === "chat" && rightPanelSurface.rightPanel?.kind === "project-chat") {
      setProjectChatPanelDismissed(true);
    }
    rightPanelSurface.closePanel();
  };
  return (
    <main className={appShellClassName} style={appStyle}>
      <GlobalFileSearch
        projectName={workspace.status?.projectName ?? workspace.selectedProject.name}
        projectSlug={workspace.selectedProjectSlug}
        onOpenFile={workspace.openProjectFile}
        onOpenProjectHome={() => navigateTo("rebuild")}
        onSwitchProject={workspace.clearSelectedProject}
      />
      <button
        className="right-panel-open-button"
        onClick={() => rightPanelSurface.togglePanel({ kind: "agent-chat", title: "Agent Chat" })}
        type="button"
      >
        Agent
      </button>
      <ToastViewport toasts={workspace.toasts} onDismiss={workspace.dismissToast} />

      <aside className="sidebar" aria-label="Project navigation">
        <button
          className="sidebar-toggle"
          type="button"
          aria-expanded={!sidebarCollapsed}
          aria-label={sidebarCollapsed ? "Expand navigation" : "Collapse navigation"}
          title={sidebarCollapsed ? "Expand navigation" : "Collapse navigation"}
          onClick={() => setSidebarCollapsed((current) => !current)}
        >
          <span aria-hidden="true">{sidebarCollapsed ? ">" : "<"}</span>
          <span className="sidebar-toggle-label">{sidebarCollapsed ? "Expand" : "Collapse"}</span>
        </button>
        {!sidebarCollapsed ? (
          <SimplifiedNavigator
            currentView={workspace.view}
            loading={workspace.loading}
            projectFiles={workspace.projectFiles}
            selectedPath={workspace.selected?.path ?? null}
            showAiAutoUpdate={Boolean(selectedAutoUpdatePath)}
            onAiAutoUpdate={() => setAutoUpdateOpen(true)}
            onDeleteHumanInputFile={(path) => void workspace.deleteHumanInputFile(path)}
            onOpenFile={workspace.openProjectFile}
            onOpenView={(nextView, filePath) => navigateTo(nextView, filePath)}
          />
        ) : null}
      </aside>

      <section className="workspace">
        {workspace.view === "build-log" ? (
          <BuildLogWorkspace
            buildLog={workspace.buildLog}
            status={workspace.status}
            rebuild={workspace.rebuild}
            onSelectLog={(tabId, path, sectionId) => void workspace.refreshBuildLog(tabId, path, sectionId)}
          />
        ) : null}
        {workspace.view === "dashboard" ? (
          <Dashboard
            status={workspace.status}
            design={workspace.design}
            onOpenAnnotations={() => navigateTo("annotations")}
            onOpenDesign={() => navigateTo("design")}
          />
        ) : null}
        {workspace.view === "chat" ? (
          <div className="chat-history-workspace">
            <ProjectChatConversationHistory chat={projectChat} onSelectConversation={selectProjectChatConversation} />
          </div>
        ) : null}
        {fileWorkspace ? (
          <FileWorkspace
            projectSlug={workspace.selectedProjectSlug}
            models={workspace.rebuildModels}
            selectedModelId={workspace.selectedRebuildModelId}
            title={fileWorkspace.title}
            explainer={fileWorkspace.explainer}
            selected={workspace.selected}
            selectedDiff={workspace.selectedDiff}
            draft={workspace.draft}
            projectFiles={workspace.projectFiles}
            onDraft={workspace.setDraft}
            onModelChange={workspace.setSelectedRebuildModelId}
            onNotice={workspace.setNotice}
            onOpenFile={workspace.openProjectFile}
            onUploadFiles={workspace.view === "inputs" ? workspace.uploadHumanInputFiles : undefined}
            onRevert={() => void workspace.revertSelected()}
            onSave={() => void workspace.saveSelected()}
          />
        ) : null}
        {workspace.view === "design" ? (
          <DesignWorkspace
            design={workspace.design}
            selected={workspace.selected}
            selectedDiff={workspace.selectedDiff}
            draft={workspace.draft}
            loading={workspace.loading}
            onDraft={workspace.setDraft}
            onRevert={() => void workspace.revertSelected()}
            onSave={() => void workspace.saveSelected()}
          />
        ) : null}
        {workspace.view === "rebuild" ? (
          <RebuildWorkspace
            status={workspace.status}
            rebuild={workspace.rebuild}
            models={workspace.rebuildModels}
            selectedModelId={workspace.selectedRebuildModelId}
            onModelChange={workspace.setSelectedRebuildModelId}
            onStart={() => void workspace.startRebuild()}
            onResolve={(request) => void workspace.resolveHumanAttention(request)}
          />
        ) : null}
        {autoUpdateOpen && selectedAutoUpdatePath ? (
          <RequirementsAutoUpdateModal
            projectSlug={workspace.selectedProjectSlug}
            models={workspace.rebuildModels}
            selectedModelId={workspace.selectedRebuildModelId}
            sourcePath={selectedAutoUpdatePath}
            hasUnsavedSourceChanges={workspace.draft !== (workspace.selected?.content ?? "")}
            onAccepted={async (writtenPaths) => {
              if (workspace.selected?.path && isRequirementAutoUpdatePath(workspace.selected.path) && writtenPaths.includes(workspace.selected.path)) {
                await workspace.refreshSelectedFile();
              } else {
                await workspace.refreshStatus();
              }
            }}
            onClose={() => setAutoUpdateOpen(false)}
            onModelChange={workspace.setSelectedRebuildModelId}
            onNotice={workspace.setNotice}
          />
        ) : null}
      </section>
      {rightPanelSurface.rightPanel ? (
        <RightPanelSurface
          onClose={handleRightPanelClose}
          panel={rightPanelSurface.rightPanel}
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
        >
          {rightPanelSurface.rightPanel.kind === "agent-chat" ? (
            <RightPanelAgentChat
              models={workspace.rebuildModels}
              onModelChange={workspace.setSelectedRebuildModelId}
              projectFiles={workspace.projectFiles}
              projectSlug={workspace.selectedProjectSlug}
              selectedModelId={workspace.selectedRebuildModelId}
            />
          ) : rightPanelSurface.rightPanel.kind === "project-chat" ? (
            <ProjectChatPanel
              chat={projectChat}
              models={workspace.rebuildModels}
              selectedModelId={workspace.selectedRebuildModelId}
              onModelChange={workspace.setSelectedRebuildModelId}
            />
          ) : (
            <p className="chat-empty-state">This reusable panel surface is ready for contextual project tools.</p>
          )}
        </RightPanelSurface>
      ) : null}
    </main>
  );
}
