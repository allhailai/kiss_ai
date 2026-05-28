import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { hashDraftContent, resolveChatFileEditApplication } from "./chatFileEdits";
import { filesApi } from "../data/filesApi";
import { buildThemeStyle } from "./theme";
import { useProjectWorkspace } from "./useProjectWorkspace";
import { RightPanelToggle } from "./RightPanelToggle";
import { panelForKind, useRightPanelSurface, type RightPanelKind } from "./hooks/useRightPanelSurface";
import { useRightPanelWidth } from "./hooks/useRightPanelWidth";
import { useLeftNavWidth } from "./hooks/useLeftNavWidth";
import { useAgentChatPanel } from "./hooks/useAgentChatPanel";
import { useKeybindings } from "./hooks/useKeybindings";
import { useProjectChat } from "./hooks/useProjectChat";

import { ProjectPicker } from "../features/projectPicker/ProjectPicker";
import { GlobalFileSearch } from "../features/search/GlobalFileSearch";
import { ToastViewport } from "../features/toast/ToastViewport";
import { makeEditableTargetForFile, useAgentFileContext } from "./hooks/useAgentFileContext";
import { readAgentChatConversationId } from "./rightPanelSurfaceStorage";
import type { ChatMessageFileEdit, ChatMessageFileRename, ChatMessageArtifactRename } from "../contracts/api";
import { chatApi } from "../data/chatApi";
import { artifactsApi } from "../data/artifactsApi";
import { BuildProvider, type BuildContextValue } from "./contexts/BuildContext";
import { RouteProvider } from "./contexts/RouteContext";
import { ToastProvider } from "./contexts/ToastContext";
import { UpdateCheckerModal } from "./UpdateCheckerModal";
import { SettingsModal } from "./SettingsModal";
import { MainContentArea } from "./MainContentArea";
import { RightPanelOrchestrator } from "./RightPanelOrchestrator";
import { AppSidebar } from "./AppSidebar";

const aiFileAssistPrompt =
  "Review the saved annotations in this file. Interpret the Git diff as user guidance, then propose edits that integrate those annotations cleanly throughout the document while preserving the document's intent, structure, and voice.";

export function App() {
  const workspace = useProjectWorkspace();
  const { designWorkspace, fileWorkspace, project, rebuildWorkspace, route, toastWorkspace } = workspace;
  const rightPanelSurface = useRightPanelSurface();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const leftNavWidth = useLeftNavWidth({ projectSlug: project.selectedProjectSlug ?? "", collapsed: sidebarCollapsed });
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
    onAgentComplete: refreshAfterAiFileAssistApply,
    onNotice: toastWorkspace.setNotice,
    onProposalApplied: refreshAfterAiFileAssistApply,
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

  const applyChatFileEdit = async (edit: ChatMessageFileEdit, editIndex: number, messageId: string): Promise<boolean> => {
    const decision = await resolveChatFileEditApplication({ draft: fileWorkspace.draft, edit, selected: fileWorkspace.selected });

    if (decision.kind === "open-file") {
      route.openProjectFile(decision.path);
      toastWorkspace.setNotice(decision.message);
      return false;
    }

    if (decision.kind === "notice") {
      toastWorkspace.setNotice(decision.message);
      return false;
    }

    if (decision.kind === "create") {
      // Write the new file directly to disk — the hash of "" is the expectedContentHash
      // because the file doesn't exist yet (backend treats missing file as empty content)
      try {
        const emptyHash = await hashDraftContent("");
        await filesApi.saveFile(project.selectedProjectSlug!, decision.path, decision.content, emptyHash);
        toastWorkspace.setNotice(`Created and saved ${decision.path}.`);
        await fileWorkspace.refreshProjectFiles();
        // Navigate to the new file
        route.openProjectFile(decision.path);
      } catch (err) {
        toastWorkspace.setNotice(err instanceof Error ? err.message : `Failed to create ${decision.path}.`);
        return false;
      }
    } else {
      fileWorkspace.setDraft(decision.content);

      // Auto-save all AI file edits — the user already reviewed the proposal by clicking Apply
      await fileWorkspace.saveSelected();
      toastWorkspace.setNotice(`Applied and saved ${edit.path}.`);

      // Refresh project files and the current file so left nav + ArtifactsView update
      await fileWorkspace.refreshProjectFiles();
      await fileWorkspace.refreshSelectedFile();
    }

    // Persist the "applied" status server-side so it survives refresh
    const conversationId = projectChat.activeConversation?.id;
    if (conversationId && project.selectedProjectSlug) {
      try {
        const updated = await chatApi.markFileEditApplied(project.selectedProjectSlug, conversationId, messageId, editIndex);
        projectChat.setActiveConversation(updated);
      } catch {
        // Non-critical — the edit was still applied to the file, just the status badge won't persist
        console.warn("[kiss_ai] Could not persist file edit applied status.");
      }
    }

    return true;
  };

  const applyChatFileRename = async (rename: ChatMessageFileRename, renameIndex: number, messageId: string): Promise<boolean> => {
    if (!project.selectedProjectSlug) return false;

    try {
      await filesApi.renameOutputFile(project.selectedProjectSlug, rename.from, rename.to);
      toastWorkspace.setNotice(`Renamed ${rename.from.split("/").pop()} to ${rename.to.split("/").pop()}.`);
      await fileWorkspace.refreshProjectFiles();
      await rebuildWorkspace.refreshStatus();
    } catch (err) {
      toastWorkspace.setNotice(err instanceof Error ? err.message : `Failed to rename ${rename.from}.`);
      return false;
    }

    // Persist the "applied" status server-side
    const conversationId = projectChat.activeConversation?.id;
    if (conversationId) {
      try {
        const updated = await chatApi.markFileRenameApplied(project.selectedProjectSlug, conversationId, messageId, renameIndex);
        projectChat.setActiveConversation(updated);
      } catch {
        console.warn("[kiss_ai] Could not persist file rename applied status.");
      }
    }

    return true;
  };

  const applyChatArtifactRename = async (rename: ChatMessageArtifactRename, renameIndex: number, messageId: string): Promise<boolean> => {
    if (!project.selectedProjectSlug) return false;

    try {
      await artifactsApi.rename(project.selectedProjectSlug, rename.from, rename.to);
      toastWorkspace.setNotice(`Renamed artifact ${rename.from} to ${rename.to}.`);
      await fileWorkspace.refreshProjectFiles();
      await rebuildWorkspace.refreshStatus();
    } catch (err) {
      toastWorkspace.setNotice(err instanceof Error ? err.message : `Failed to rename artifact ${rename.from}.`);
      return false;
    }

    // Persist the "applied" status server-side
    const conversationId = projectChat.activeConversation?.id;
    if (conversationId) {
      try {
        const updated = await chatApi.markArtifactRenameApplied(project.selectedProjectSlug, conversationId, messageId, renameIndex);
        projectChat.setActiveConversation(updated);
      } catch {
        console.warn("[kiss_ai] Could not persist artifact rename applied status.");
      }
    }

    return true;
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
            onOpenDashboard={() => route.navigateTo("dashboard")}
            onOpenProjectHome={() => route.navigateTo("dashboard")}
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
            onAiFileAssist={() => void assistCurrentFile()}
            onOpenFile={openProjectFileWithAgentContext}
            projectChat={projectChat}
            projectSlug={project.selectedProjectSlug}
            rebuildWorkspace={rebuildWorkspace}
            selectProjectChatConversation={selectProjectChatConversation}
          />

          {rightPanelSurface.rightPanel ? (
            <RightPanelOrchestrator
              agentFileContext={agentFileContext}
              applyChatFileEdit={applyChatFileEdit}
              applyChatFileRename={applyChatFileRename}
              applyChatArtifactRename={applyChatArtifactRename}
              closeRightPanel={closeRightPanel}
              draftSeed={agentDraftSeed}
              fileWorkspaceProjectFiles={fileWorkspace.projectFiles}
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
