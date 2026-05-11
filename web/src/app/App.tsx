import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { projectPathPrefixes } from "../domain/projectPaths";
import { buildThemeStyle } from "./theme";
import { useProjectWorkspace } from "./useProjectWorkspace";
import { RightPanelSurface } from "./RightPanelSurface";
import { RightPanelToggle } from "./RightPanelToggle";
import { useRightPanelSurface } from "./hooks/useRightPanelSurface";
import { panelWidthContextKey, projectChatDefaultPanelWidth, useRightPanelWidth } from "./hooks/useRightPanelWidth";
import { type View } from "../navigation/views";
import { BuildLogWorkspace } from "../features/buildLog/BuildLogWorkspace";
import { ProjectChatConversationHistory } from "../features/chat/ProjectChatConversationHistory";
import { ProjectChatPanel } from "../features/chat/ProjectChatPanel";
import { useProjectChat } from "../features/chat/useProjectChat";
import { Dashboard } from "../features/dashboard/Dashboard";
import { DesignWorkspace } from "../features/design/DesignWorkspace";
import { FileWorkspace } from "../features/files/FileWorkspace";
import { SimplifiedNavigator } from "../features/navigation/WorkflowMenus";
import { ProjectPicker } from "../features/projectPicker/ProjectPicker";
import { RebuildWorkspace } from "../features/rebuild/RebuildWorkspace";
import { GlobalFileSearch } from "../features/search/GlobalFileSearch";
import { ToastViewport } from "../features/toast/ToastViewport";
import { RightPanelAgentChat } from "../features/agents/RightPanelAgentChat";
import { useAgentFileContext } from "./hooks/useAgentFileContext";
import type { ChatMessageFileEdit } from "../contracts/api";

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
    explainer: `Generated outputs are AI-managed. Saved edits under ${projectPathPrefixes.output} are treated as annotations for requirements and the next rebuild.`,
  },
  annotations: {
    title: "Annotation Workspace",
    explainer: "Add annotations",
  },
};

const projectChatPanel = { kind: "project-chat", title: "Project Chat" } as const;
const agentChatPanel = { kind: "agent-chat", title: "Agent Chat" } as const;

export function App() {
  const workspace = useProjectWorkspace();
  const { designWorkspace, fileWorkspace, project, rebuildWorkspace, route, toastWorkspace } = workspace;
  const rightPanelSurface = useRightPanelSurface();
  const [projectChatPanelDismissed, setProjectChatPanelDismissed] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const projectChatVisitKeyRef = useRef<string | null>(null);
  const themeStyle = useMemo(() => buildThemeStyle(designWorkspace.design), [designWorkspace.design]);
  const rightPanelWidth = useRightPanelWidth({
    panelKind: rightPanelSurface.rightPanel?.kind ?? null,
    replaceRouteContext: route.replaceRouteContext,
    routeContext: route.routeContext,
    view: route.view,
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
    projectSlug: project.selectedProjectSlug,
    selectedModelId: rebuildWorkspace.selectedModelId,
    projectFiles: fileWorkspace.projectFiles,
    onNotice: toastWorkspace.setNotice,
  });
  const navigateTo = (view: View, filePath?: string | null, context?: Record<string, string>) => route.navigateTo(view, filePath, context);
  const isAgentPanelOpen = rightPanelSurface.rightPanel?.kind === agentChatPanel.kind;
  const agentFileContext = useAgentFileContext({
    draft: fileWorkspace.draft,
    openProjectFile: route.openProjectFile,
    projectFiles: fileWorkspace.projectFiles,
    projectSlug: project.selectedProjectSlug,
    selected: fileWorkspace.selected,
  });
  const openProjectFileWithAgentContext = (path: string) => {
    agentFileContext.openProjectFileWithAgentContext(path, isAgentPanelOpen);
  };
  const applyChatFileEdit = (edit: ChatMessageFileEdit) => {
    if (!edit.proposedContent) {
      toastWorkspace.setNotice("This chat edit does not include draft content to apply.");
      return;
    }

    if (fileWorkspace.selected?.path !== edit.path) {
      route.openProjectFile(edit.path);
      toastWorkspace.setNotice(`Opened ${edit.path}. Apply the chat edit again after the file loads.`);
      return;
    }

    if (edit.contentHashBefore && fileWorkspace.selected.contentHash !== edit.contentHashBefore) {
      toastWorkspace.setNotice("The saved file changed after this chat edit was proposed. Ask chat to regenerate the edit.");
      return;
    }

    fileWorkspace.setDraft(edit.proposedContent);
    toastWorkspace.setNotice("Applied the chat edit to the unsaved editor draft. Review and save when ready.");
  };
  const openProjectChatPanel = () => {
    setProjectChatPanelDismissed(false);
    rightPanelSurface.openPanel(projectChatPanel);
    if (route.view === "chat" && !route.routeContext[panelWidthContextKey]) {
      route.replaceRouteContext({ [panelWidthContextKey]: projectChatDefaultPanelWidth });
    }
  };
  const selectProjectChatConversation = (conversationId: string) => {
    openProjectChatPanel();
    navigateTo("chat", null, {
      ...route.routeContext,
      conversation: conversationId,
      [panelWidthContextKey]: route.routeContext[panelWidthContextKey] || projectChatDefaultPanelWidth,
    });
  };
  const toggleAgentPanel = () => {
    if (rightPanelSurface.rightPanel?.kind === agentChatPanel.kind) {
      rightPanelSurface.closePanel();
      return;
    }

    rightPanelSurface.openPanel(agentChatPanel);
  };

  useEffect(() => {
    if (!project.selectedProjectSlug || route.view !== "chat") {
      projectChatVisitKeyRef.current = null;
      if (projectChatPanelDismissed) setProjectChatPanelDismissed(false);
      return;
    }

    if (projectChatVisitKeyRef.current !== project.selectedProjectSlug) {
      projectChatVisitKeyRef.current = project.selectedProjectSlug;
      if (projectChatPanelDismissed) setProjectChatPanelDismissed(false);
      openProjectChatPanel();
      return;
    }

    if (!projectChatPanelDismissed && !rightPanelSurface.rightPanel) {
      openProjectChatPanel();
    }
  }, [projectChatPanelDismissed, project.selectedProjectSlug, rightPanelSurface.rightPanel, route.routeContext, route.view]);

  useEffect(() => {
    if (route.view !== "chat") return;

    const conversationId = route.routeContext.conversation;
    if (!conversationId || projectChat.activeConversation?.id === conversationId) return;

    openProjectChatPanel();
    void projectChat.openConversation(conversationId);
  }, [projectChat.activeConversation?.id, route.routeContext.conversation, route.view]);

  if (!project.selectedProjectSlug || !project.selectedProject) {
    return (
      <main className="app-shell project-picker-shell" style={appStyle}>
        <ToastViewport toasts={toastWorkspace.toasts} onDismiss={toastWorkspace.dismissToast} />
        <ProjectPicker
          creatingProject={project.creatingProject}
          error={project.projectsError}
          onCreateProject={project.createProject}
          onSelect={project.selectProject}
          projects={project.projects}
          projectsRoot={project.projectsRoot}
        />
      </main>
    );
  }

  const fileWorkspaceConfig = fileWorkspaceByView[route.view];
  const appShellClassName = `${sidebarCollapsed ? "app-shell sidebar-collapsed" : "app-shell"}${
    rightPanelSurface.rightPanel ? ` right-panel-open right-panel-${rightPanelSurface.rightPanel.kind}` : ""
  }`;
  const handleRightPanelClose = () => {
    if (route.view === "chat" && rightPanelSurface.rightPanel?.kind === "project-chat") {
      setProjectChatPanelDismissed(true);
    }
    rightPanelSurface.closePanel();
  };
  return (
    <main className={appShellClassName} style={appStyle}>
      <GlobalFileSearch
        projectName={rebuildWorkspace.status?.projectName ?? project.selectedProject.name}
        projectSlug={project.selectedProjectSlug}
        onOpenFile={openProjectFileWithAgentContext}
        onOpenProjectHome={() => navigateTo("rebuild")}
        onSwitchProject={project.clearSelectedProject}
      />
      <RightPanelToggle active={isAgentPanelOpen} label="Agent" onToggle={toggleAgentPanel} />
      <ToastViewport toasts={toastWorkspace.toasts} onDismiss={toastWorkspace.dismissToast} />

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
            currentView={route.view}
            loading={fileWorkspace.loading}
            projectFiles={fileWorkspace.projectFiles}
            selectedPath={fileWorkspace.selected?.path ?? null}
            onDeleteHumanInputFile={(path) => void fileWorkspace.deleteHumanInputFile(path)}
            onOpenFile={openProjectFileWithAgentContext}
            onOpenView={(nextView, filePath) => navigateTo(nextView, filePath)}
          />
        ) : null}
      </aside>

      <section className="workspace">
        {route.view === "build-log" ? (
          <BuildLogWorkspace
            buildLog={rebuildWorkspace.buildLog}
            status={rebuildWorkspace.status}
            rebuild={rebuildWorkspace.rebuild}
            onSelectLog={(tabId, path, sectionId) => void rebuildWorkspace.refreshBuildLog(tabId, path, sectionId)}
          />
        ) : null}
        {route.view === "dashboard" ? (
          <Dashboard
            status={rebuildWorkspace.status}
            design={designWorkspace.design}
            onOpenAnnotations={() => navigateTo("annotations")}
            onOpenDesign={() => navigateTo("design")}
          />
        ) : null}
        {route.view === "chat" ? (
          <div className="chat-history-workspace">
            <ProjectChatConversationHistory chat={projectChat} onSelectConversation={selectProjectChatConversation} />
          </div>
        ) : null}
        {fileWorkspaceConfig ? (
          <FileWorkspace
            title={fileWorkspaceConfig.title}
            explainer={fileWorkspaceConfig.explainer}
            selected={fileWorkspace.selected}
            selectedDiff={fileWorkspace.selectedDiff}
            draft={fileWorkspace.draft}
            projectFiles={fileWorkspace.projectFiles}
            onDraft={fileWorkspace.setDraft}
            onNotice={toastWorkspace.setNotice}
            onOpenFile={openProjectFileWithAgentContext}
            onUploadFiles={route.view === "inputs" ? fileWorkspace.uploadHumanInputFiles : undefined}
            onRevert={() => void fileWorkspace.revertSelected()}
            onSave={() => void fileWorkspace.saveSelected()}
          />
        ) : null}
        {route.view === "design" ? (
          <DesignWorkspace
            design={designWorkspace.design}
            selected={fileWorkspace.selected}
            selectedDiff={fileWorkspace.selectedDiff}
            draft={fileWorkspace.draft}
            loading={fileWorkspace.loading}
            onDraft={fileWorkspace.setDraft}
            onRevert={() => void fileWorkspace.revertSelected()}
            onSave={() => void fileWorkspace.saveSelected()}
          />
        ) : null}
        {route.view === "rebuild" ? (
          <RebuildWorkspace
            status={rebuildWorkspace.status}
            rebuild={rebuildWorkspace.rebuild}
            models={rebuildWorkspace.models}
            selectedModelId={rebuildWorkspace.selectedModelId}
            onModelChange={rebuildWorkspace.setSelectedModelId}
            onStart={() => void rebuildWorkspace.startRebuild()}
            onResolve={(request) => void rebuildWorkspace.resolveHumanAttention(request)}
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
              activeFiles={agentFileContext.editableFiles}
              chat={projectChat}
              chooserFile={agentFileContext.chooserFile}
              contextRefs={agentFileContext.sourceFiles}
              currentFile={agentFileContext.currentFile}
              highlightedContext={agentFileContext.highlightedContext}
              models={rebuildWorkspace.models}
              onAddContextRef={agentFileContext.addSourceFile}
              onApplyFileEdit={applyChatFileEdit}
              onCloseChooser={agentFileContext.closeChooser}
              onContextRefsChange={agentFileContext.setSourceFiles}
              onModelChange={rebuildWorkspace.setSelectedModelId}
              onModifyCurrentFile={() => agentFileContext.currentFile && agentFileContext.addEditableFile(agentFileContext.currentFile.path)}
              onRemoveActiveFile={agentFileContext.removeEditableFile}
              projectFiles={fileWorkspace.projectFiles}
              selectedModelId={rebuildWorkspace.selectedModelId}
            />
          ) : (
            <ProjectChatPanel
              chat={projectChat}
              models={rebuildWorkspace.models}
              selectedModelId={rebuildWorkspace.selectedModelId}
              onModelChange={rebuildWorkspace.setSelectedModelId}
            />
          )}
        </RightPanelSurface>
      ) : null}
    </main>
  );
}
