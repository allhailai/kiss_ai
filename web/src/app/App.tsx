import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { projectPathPrefixes } from "../domain/projectPaths";
import { resolveChatFileEditApplication } from "./chatFileEdits";
import { buildThemeStyle } from "./theme";
import { useProjectWorkspace } from "./useProjectWorkspace";
import { RightPanelSurface } from "./RightPanelSurface";
import { RightPanelToggle } from "./RightPanelToggle";
import { panelForKind, useRightPanelSurface } from "./hooks/useRightPanelSurface";
import { useRightPanelWidth } from "./hooks/useRightPanelWidth";
import { useAgentChatPanel } from "./hooks/useAgentChatPanel";
import { useProjectChat } from "./hooks/useProjectChat";
import { type View } from "../navigation/views";
import { BuildLogWorkspace } from "../features/buildLog/BuildLogWorkspace";
import { ProjectChatConversationHistory } from "../features/chat/ProjectChatConversationHistory";
import { Dashboard } from "../features/dashboard/Dashboard";
import { DesignWorkspace } from "../features/design/DesignWorkspace";
import { FileWorkspace } from "../features/files/FileWorkspace";
import { SimplifiedNavigator } from "../features/navigation/WorkflowMenus";
import { ProjectPicker } from "../features/projectPicker/ProjectPicker";
import { RebuildWorkspace } from "../features/rebuild/RebuildWorkspace";
import { RequirementsSyncRightPanel } from "../features/requirementsSync/RequirementsSyncRightPanel";
import { useRequirementsSync } from "../features/requirementsSync/useRequirementsSync";
import { GlobalFileSearch } from "../features/search/GlobalFileSearch";
import { ToastViewport } from "../features/toast/ToastViewport";
import { RightPanelAgentChat } from "../features/agents/RightPanelAgentChat";
import { makeEditableTargetForFile, useAgentFileContext } from "./hooks/useAgentFileContext";
import { readAgentChatConversationId } from "./rightPanelSurfaceStorage";
import type { ChatMessageFileEdit } from "../contracts/api";

const aiFileAssistPrompt =
  "Review the saved annotations in this file. Interpret the Git diff as user guidance, then propose edits that integrate those annotations cleanly throughout the document while preserving the document's intent, structure, and voice.";

const fileWorkspaceByView: Partial<Record<View, { title: string; explainer?: string }>> = {
  requirements: {
    title: "Human-Owned Requirements",
  },
  inputs: {
    title: "Source Data",
    explainer: `Human source material belongs under ${projectPathPrefixes.humanInput}. AI-acquired source material is listed under ${projectPathPrefixes.aiInput}.`,
  },
  outputs: {
    title: "Outputs",
    explainer: `Generated outputs are AI-managed. Saved edits under ${projectPathPrefixes.output} are treated as annotations for requirements and the next rebuild.`,
  },
};

export function App() {
  const workspace = useProjectWorkspace();
  const { designWorkspace, fileWorkspace, project, rebuildWorkspace, route, toastWorkspace } = workspace;
  const rightPanelSurface = useRightPanelSurface();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [agentDraftSeed, setAgentDraftSeed] = useState<{ id: string; draft: string } | null>(null);
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
      }) as CSSProperties,
    [rightPanelWidth.cssValue, themeStyle],
  );
  const preferredAgentChatConversationId = useMemo(
    () => readAgentChatConversationId(project.selectedProjectSlug),
    [project.selectedProjectSlug],
  );
  const refreshAfterAiFileAssistApply = async () => {
    await fileWorkspace.refreshProjectFiles();
    await fileWorkspace.refreshSelectedFile();
    await rebuildWorkspace.refreshStatus();
  };
  const projectChat = useProjectChat({
    preferredConversationId: preferredAgentChatConversationId,
    projectSlug: project.selectedProjectSlug,
    selectedModelId: rebuildWorkspace.selectedModelId,
    projectFiles: fileWorkspace.projectFiles,
    onNotice: toastWorkspace.setNotice,
    onProposalApplied: refreshAfterAiFileAssistApply,
  });
  const requirementsSync = useRequirementsSync({
    projectSlug: project.selectedProjectSlug,
    selectedModelId: rebuildWorkspace.selectedModelId,
    onNotice: toastWorkspace.setNotice,
    onApplied: async () => {
      await fileWorkspace.refreshProjectFiles();
      await fileWorkspace.refreshSelectedFile();
      await rebuildWorkspace.refreshStatus();
    },
  });
  const navigateTo = (view: View, filePath?: string | null, context?: Record<string, string>) => route.navigateTo(view, filePath, context);
  const { closeAgentPanel, isAgentPanelOpen, openAgentChatPanel, selectProjectChatConversation, toggleAgentPanel } = useAgentChatPanel({
    projectChat,
    projectSlug: project.selectedProjectSlug,
    rightPanelSurface,
    view: route.view,
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
  const openProjectFileWithAgentContext = (path: string) => {
    agentFileContext.openProjectFileWithAgentContext(path, isAgentPanelOpen);
  };
  const openRequirementsSyncPanel = () => {
    requirementsSync.showController();
    rightPanelSurface.openPanel(panelForKind("requirements-sync"));
  };
  const closeRightPanel = () => {
    if (rightPanelSurface.rightPanel?.kind === "agent-chat") {
      closeAgentPanel();
      return;
    }

    rightPanelSurface.closePanel();
  };
  useEffect(() => {
    if (rightPanelSurface.rightPanel?.kind === "requirements-sync" && !requirementsSync.open) {
      requirementsSync.showController();
    }
  }, [requirementsSync.open, requirementsSync.showController, rightPanelSurface.rightPanel?.kind]);
  const applyChatFileEdit = async (edit: ChatMessageFileEdit) => {
    const decision = await resolveChatFileEditApplication({ draft: fileWorkspace.draft, edit, selected: fileWorkspace.selected });

    if (decision.kind === "open-file") {
      route.openProjectFile(decision.path);
      toastWorkspace.setNotice(decision.message);
      return;
    }

    if (decision.kind === "notice") {
      toastWorkspace.setNotice(decision.message);
      return;
    }

    fileWorkspace.setDraft(decision.content);
    toastWorkspace.setNotice(decision.message);
  };
  const startRebuildWithRequirementsCheck = () => {
    if (requirementsSync.signals?.hasSignals) {
      const shouldContinue = window.confirm(
        `Requirements sync signals were detected: ${requirementsSync.signals.summary}\n\nContinue rebuild without synchronizing requirements?`,
      );
      if (!shouldContinue) return;
    }

    void rebuildWorkspace.startRebuild();
  };
  const assistCurrentFile = async () => {
    const selected = fileWorkspace.selected;
    if (!selected?.editable || projectChat.loading || projectChat.sending || projectChat.proposalUpdating) return;

    const savedFile = fileWorkspace.hasUnsavedChanges ? await fileWorkspace.saveSelected() : selected;
    if (!savedFile) return;

    const editableTarget = makeEditableTargetForFile(savedFile, savedFile.content);
    projectChat.startDraftConversation({ ai_editable_files: [editableTarget], context_files: [] });
    openAgentChatPanel();
    setAgentDraftSeed({ id: `${savedFile.path}:${Date.now()}`, draft: aiFileAssistPrompt });
    toastWorkspace.setNotice(`Prepared AI File Assist for ${savedFile.path}.`);
  };

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
  return (
    <main className={appShellClassName} style={appStyle}>
      <GlobalFileSearch
        projectName={rebuildWorkspace.status?.projectName ?? project.selectedProject.name}
        projectSlug={project.selectedProjectSlug}
        onOpenFile={openProjectFileWithAgentContext}
        onOpenDashboard={() => navigateTo("dashboard")}
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
            loading={fileWorkspace.treeLoading}
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
            hasUnsavedChanges={fileWorkspace.hasUnsavedChanges}
            aiFileAssistDisabled={fileWorkspace.loading || projectChat.loading || projectChat.sending || projectChat.proposalUpdating}
            projectFiles={fileWorkspace.projectFiles}
            onDraft={fileWorkspace.setDraft}
            onAiFileAssist={() => void assistCurrentFile()}
            onNotice={toastWorkspace.setNotice}
            onOpenRequirementsSync={route.view === "requirements" ? openRequirementsSyncPanel : undefined}
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
            hasUnsavedChanges={fileWorkspace.hasUnsavedChanges}
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
            onOpenRequirementsSync={openRequirementsSyncPanel}
            onShowRequirementsSyncController={requirementsSync.showController}
            onStart={startRebuildWithRequirementsCheck}
            onStartRequirementsSync={openRequirementsSyncPanel}
            requirementsSyncSignals={requirementsSync.signals}
            requirementsSyncControllerOpen={requirementsSync.open}
            requirementsSyncBusy={requirementsSync.busy}
            requirementsSyncProposals={requirementsSync.proposals}
            requirementsSyncStep={requirementsSync.step}
            onRequirementsSyncStepChange={requirementsSync.setStep}
            onResolve={(request) => void rebuildWorkspace.resolveHumanAttention(request)}
          />
        ) : null}
      </section>
      {rightPanelSurface.rightPanel ? (
        <RightPanelSurface
          onClose={closeRightPanel}
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
          {rightPanelSurface.rightPanel.kind === "requirements-sync" ? (
            <RequirementsSyncRightPanel
              controller={requirementsSync}
              models={rebuildWorkspace.models}
              onFinish={() => rightPanelSurface.closePanel()}
              onModelChange={rebuildWorkspace.setSelectedModelId}
              onOpenAgent={openAgentChatPanel}
              selectedModelId={rebuildWorkspace.selectedModelId}
            />
          ) : (
            <div className="right-panel-mode-layout">
              <div className="right-panel-mode-switch" role="group" aria-label="Right panel mode">
                <button aria-pressed="true" className="active" type="button">
                  Agent
                </button>
                <button type="button" onClick={openRequirementsSyncPanel}>
                  Requirements Sync
                </button>
              </div>
              <RightPanelAgentChat
                aiEditableFiles={agentFileContext.aiEditableFiles}
                chat={projectChat}
                contextFiles={agentFileContext.contextFiles}
                currentFile={agentFileContext.currentFile}
                draftSeed={agentDraftSeed}
                highlightedContext={agentFileContext.highlightedContext}
                models={rebuildWorkspace.models}
                onAddContextFile={agentFileContext.addContextFile}
                onApplyFileEdit={applyChatFileEdit}
                onContextFilesChange={projectChat.setContextFiles}
                onModelChange={rebuildWorkspace.setSelectedModelId}
                onModifyCurrentFile={() => agentFileContext.currentFile && agentFileContext.addEditableFile(agentFileContext.currentFile.path)}
                onRemoveAiEditableFile={agentFileContext.removeAiEditableFile}
                projectFiles={fileWorkspace.projectFiles}
                selectedModelId={rebuildWorkspace.selectedModelId}
              />
            </div>
          )}
        </RightPanelSurface>
      ) : null}
    </main>
  );
}
