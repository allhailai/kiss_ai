import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { projectPathPrefixes } from "../domain/projectPaths";
import { resolveChatFileEditApplication } from "./chatFileEdits";
import { buildThemeStyle } from "./theme";
import { useProjectWorkspace } from "./useProjectWorkspace";
import { RightPanelSurface } from "./RightPanelSurface";
import { RightPanelToggle } from "./RightPanelToggle";
import { panelForKind, useRightPanelSurface, type RightPanelKind } from "./hooks/useRightPanelSurface";
import { useRightPanelWidth } from "./hooks/useRightPanelWidth";
import { useLeftNavWidth } from "./hooks/useLeftNavWidth";
import { useAgentChatPanel } from "./hooks/useAgentChatPanel";
import { useKeybindings } from "./hooks/useKeybindings";
import { useProjectChat } from "./hooks/useProjectChat";
import { api } from "../data/apiClient";
import { errorMessage } from "../domain/errors";
import { type View } from "../navigation/views";
import { ProjectChatConversationHistory } from "../features/chat/ProjectChatConversationHistory";
import { Dashboard } from "../features/dashboard/Dashboard";
import { DesignWorkspace } from "../features/design/DesignWorkspace";
import { FileWorkspace } from "../features/files/FileWorkspace";
import { SimplifiedNavigator } from "../features/navigation/WorkflowMenus";
import { ProjectPicker } from "../features/projectPicker/ProjectPicker";
import { BuildProjectRightPanel } from "../features/rebuild/BuildProjectRightPanel";
import { QuestionsWorkspace } from "../features/questions/QuestionsWorkspace";
import { SuggestionsWorkspace } from "../features/suggestions/SuggestionsWorkspace";
import { TopicsWorkspace } from "../features/topics/TopicsWorkspace";

import { GlobalFileSearch } from "../features/search/GlobalFileSearch";
import { ToastViewport } from "../features/toast/ToastViewport";
import { RightPanelAgentChat } from "../features/agents/RightPanelAgentChat";
import { RightPanelModeSwitch } from "../shared/rightPanel/RightPanelModeSwitch";
import { makeEditableTargetForFile, useAgentFileContext } from "./hooks/useAgentFileContext";
import { readAgentChatConversationId } from "./rightPanelSurfaceStorage";
import type { ChatMessageFileEdit, KissAiUpdateCheckResponse, SystemSettingsResponse } from "../contracts/api";

const aiFileAssistPrompt =
  "Review the saved annotations in this file. Interpret the Git diff as user guidance, then propose edits that integrate those annotations cleanly throughout the document while preserving the document's intent, structure, and voice.";

const fileWorkspaceByView: Partial<Record<View, { title?: string; explainer?: string }>> = {
  requirements: {
    title: "Project Definition",
  },
  inputs: {
    explainer: "Sources are AI-managed. Use annotations to guide the AI.",
  },
  outputs: {
    explainer: "Outputs are AI-managed. Use annotations to guide the AI.",
  },
};

export function App() {
  const workspace = useProjectWorkspace();
  const { designWorkspace, fileWorkspace, project, rebuildWorkspace, route, toastWorkspace } = workspace;
  const rightPanelSurface = useRightPanelSurface();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const sidebarResizingRef = useRef(false);
  const leftNavWidth = useLeftNavWidth({ projectSlug: project.selectedProjectSlug ?? "", collapsed: sidebarCollapsed });
  const [agentDraftSeed, setAgentDraftSeed] = useState<{ id: string; draft: string } | null>(null);
  const [updateModalOpen, setUpdateModalOpen] = useState(false);
  const [updateCheck, setUpdateCheck] = useState<KissAiUpdateCheckResponse | null>(null);
  const [updateCheckLoading, setUpdateCheckLoading] = useState(false);
  const [updateDownloadLoading, setUpdateDownloadLoading] = useState(false);
  const [updateError, setUpdateError] = useState("");
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [settings, setSettings] = useState<SystemSettingsResponse | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsError, setSettingsError] = useState("");
  const [settingsMessage, setSettingsMessage] = useState("");
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

  const navigateTo = (view: View, filePath?: string | null, context?: Record<string, string>) => route.navigateTo(view, filePath, context);
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
  const checkLatestKissAi = async () => {
    if (updateCheckLoading || updateDownloadLoading) return;

    setUpdateModalOpen(true);
    setUpdateCheck(null);
    setUpdateError("");
    setUpdateCheckLoading(true);
    try {
      setUpdateCheck(await api.checkKissAiUpdate());
    } catch (error) {
      setUpdateError(errorMessage(error, "Could not check for the latest KISS AI version."));
    } finally {
      setUpdateCheckLoading(false);
    }
  };
  const downloadLatestKissAi = async () => {
    if (updateDownloadLoading) return;

    setUpdateError("");
    setUpdateDownloadLoading(true);
    try {
      await api.updateKissAi();
      window.location.reload();
    } catch (error) {
      setUpdateError(errorMessage(error, "Could not download the latest KISS AI version."));
      setUpdateDownloadLoading(false);
    }
  };
  const openSettingsModal = async () => {
    if (settingsLoading || settingsSaving) return;

    setSettingsModalOpen(true);
    setSettings(null);
    setSettingsError("");
    setSettingsMessage("");
    setSettingsLoading(true);
    try {
      setSettings(await api.systemSettings());
    } catch (error) {
      setSettingsError(errorMessage(error, "Could not load settings."));
    } finally {
      setSettingsLoading(false);
    }
  };
  const saveCursorApiKey = async (cursorApiKey: string) => {
    if (settingsSaving) return;

    setSettingsError("");
    setSettingsMessage("");
    setSettingsSaving(true);
    try {
      const result = await api.saveCursorApiKey({ cursorApiKey });
      setSettingsMessage(result.message);
      setSettings(await api.systemSettings());
    } catch {
      setSettingsError("Failed! Please try again. If this issue persists, contact AllHail.AI");
    } finally {
      setSettingsSaving(false);
    }
  };

  useEffect(() => {
    if (rightPanelSurface.rightPanel?.kind === "build-project") {
      void rebuildWorkspace.refreshRebuild();
    }
  }, [rebuildWorkspace.refreshRebuild, rightPanelSurface.rightPanel?.kind]);
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
          onCheckLatest={() => void checkLatestKissAi()}
          onCloseUpdateModal={() => setUpdateModalOpen(false)}
          onDownloadLatest={() => void downloadLatestKissAi()}
          onOpenSettings={() => void openSettingsModal()}
          onCloseSettings={() => setSettingsModalOpen(false)}
          onSaveCursorApiKey={saveCursorApiKey}
          onSelect={project.selectProject}
          projects={project.projects}
          projectsRoot={project.projectsRoot}
          settings={settings}
          settingsError={settingsError}
          settingsLoading={settingsLoading}
          settingsMessage={settingsMessage}
          settingsModalOpen={settingsModalOpen}
          settingsSaving={settingsSaving}
          updateCheck={updateCheck}
          updateCheckLoading={updateCheckLoading}
          updateDownloadLoading={updateDownloadLoading}
          updateError={updateError}
          updateModalOpen={updateModalOpen}
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
        onOpenProjectHome={() => navigateTo("dashboard")}
        onSwitchProject={project.clearSelectedProject}
      />
      <RightPanelToggle active={isAgentPanelOpen} label="AI" onToggle={toggleAgentPanel} />
      <ToastViewport toasts={toastWorkspace.toasts} onDismiss={toastWorkspace.dismissToast} />

      <button
        aria-label="Open navigation"
        className="sidebar-open-button"
        onClick={() => setSidebarCollapsed(false)}
        type="button"
      >
        Nav
      </button>

      <aside className="sidebar" aria-label="Project navigation">
        {leftNavWidth.isResizable ? (
          <div
            aria-label="Resize navigation"
            aria-orientation="vertical"
            aria-valuemax={Math.round(leftNavWidth.maxWidthPx)}
            aria-valuemin={Math.round(leftNavWidth.minWidthPx)}
            aria-valuenow={Math.round(leftNavWidth.widthPx)}
            className="sidebar-resize-handle"
            onKeyDown={(event: ReactKeyboardEvent<HTMLDivElement>) => {
              if (event.key === "ArrowRight") {
                event.preventDefault();
                leftNavWidth.resizeByKeyboard("wider");
              } else if (event.key === "ArrowLeft") {
                event.preventDefault();
                leftNavWidth.resizeByKeyboard("narrower");
              }
            }}
            onPointerCancel={(event: ReactPointerEvent<HTMLDivElement>) => {
              if (!sidebarResizingRef.current) return;
              sidebarResizingRef.current = false;
              event.currentTarget.releasePointerCapture(event.pointerId);
              leftNavWidth.commitWidth();
            }}
            onPointerDown={(event: ReactPointerEvent<HTMLDivElement>) => {
              event.preventDefault();
              sidebarResizingRef.current = true;
              event.currentTarget.setPointerCapture(event.pointerId);
              leftNavWidth.resizeFromClientX(event.clientX);
            }}
            onPointerMove={(event: ReactPointerEvent<HTMLDivElement>) => {
              if (!sidebarResizingRef.current) return;
              leftNavWidth.resizeFromClientX(event.clientX);
            }}
            onPointerUp={(event: ReactPointerEvent<HTMLDivElement>) => {
              if (!sidebarResizingRef.current) return;
              sidebarResizingRef.current = false;
              event.currentTarget.releasePointerCapture(event.pointerId);
              leftNavWidth.commitWidth();
            }}
            role="separator"
            tabIndex={0}
            title="Drag to resize navigation"
          />
        ) : null}
        <button
          aria-label="Close navigation"
          className="sidebar-close-button"
          onClick={() => setSidebarCollapsed(true)}
          title="Close navigation"
          type="button"
        >
          x
        </button>
        <SimplifiedNavigator
          currentView={route.view}
          humanInputEmptyDirectories={fileWorkspace.humanInputEmptyDirectories}
          openQuestionsCount={rebuildWorkspace.status?.openQuestionsCount}
          blockingQuestionsCount={rebuildWorkspace.status?.blockingQuestionsCount}
          pendingSuggestionsCount={rebuildWorkspace.status?.pendingSuggestionsCount}
          seedTopicsCount={rebuildWorkspace.status?.seedTopicsCount}
          loading={fileWorkspace.treeLoading}
          projectFiles={fileWorkspace.projectFiles}
          selectedPath={fileWorkspace.selected?.path ?? null}
          onCreateFolder={(name) => void fileWorkspace.createHumanInputFolder(name)}
          onCreateTextFile={(name, folder) => void fileWorkspace.createHumanInputTextFile(name, folder)}
          onDeleteFolder={(folder) => void fileWorkspace.deleteHumanInputFolder(folder)}
          onDeleteHumanInputFile={(path) => void fileWorkspace.deleteHumanInputFile(path)}
          onMoveFile={(sourcePath, targetFolder) => void fileWorkspace.moveHumanInputFile(sourcePath, targetFolder)}
          onUploadFiles={fileWorkspace.uploadHumanInputFiles}
          onOpenFile={openProjectFileWithAgentContext}
          onOpenView={(nextView, filePath) => navigateTo(nextView, filePath)}
        />
      </aside>

      <section className="workspace">
        {route.view === "dashboard" ? (
          <Dashboard
            status={rebuildWorkspace.status}
            design={designWorkspace.design}
            rebuild={rebuildWorkspace.rebuild}
            buildLog={rebuildWorkspace.buildLog}
            onOpenDesign={() => navigateTo("design")}
            onSelectLog={(tabId, path, sectionId) => void rebuildWorkspace.refreshBuildLog(tabId, path, sectionId)}
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

            onOpenFile={openProjectFileWithAgentContext}
            onRevert={() => void fileWorkspace.revertSelected()}
            onSave={() => void fileWorkspace.saveSelected()}
            projectSlug={project.selectedProjectSlug}
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
        {route.view === "questions" ? (
          <QuestionsWorkspace
            models={rebuildWorkspace.models}
            onModelChange={rebuildWorkspace.setSelectedModelId}
            onNavigateToFile={openProjectFileWithAgentContext}
            projectSlug={project.selectedProjectSlug}
            selectedModelId={rebuildWorkspace.selectedModelId}
          />
        ) : null}
        {route.view === "suggestions" ? (
          <SuggestionsWorkspace
            onNavigateToFile={openProjectFileWithAgentContext}
            projectSlug={project.selectedProjectSlug}
          />
        ) : null}
        {route.view === "topics" ? (
          <TopicsWorkspace
            onNavigateToFile={openProjectFileWithAgentContext}
            projectSlug={project.selectedProjectSlug}
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
          {rightPanelSurface.rightPanel.kind === "build-project" ? (
            <BuildProjectRightPanel
              models={rebuildWorkspace.models}
              onModelChange={rebuildWorkspace.setSelectedModelId}
              onOpenQuestions={() => navigateTo("questions")}
              onSelectPanel={selectRightPanelKind}
              onStart={startRebuildWithRequirementsCheck}
              rebuild={rebuildWorkspace.rebuild}
              selectedModelId={rebuildWorkspace.selectedModelId}
              status={rebuildWorkspace.status}
            />
          ) : (
            <div className="right-panel-mode-layout">
              <RightPanelModeSwitch activeKind="agent-chat" onSelect={selectRightPanelKind} />
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
