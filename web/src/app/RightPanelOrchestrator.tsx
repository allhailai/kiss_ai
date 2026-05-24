import type { AgentContextFile, ChatContextFile, ChatMessageFileEdit, ProjectFile, RebuildModel, RebuildState } from "../contracts/api";
import type { ProjectChatController } from "./hooks/useProjectChat";
import type { RightPanelKind, RightPanelState } from "./hooks/useRightPanelSurface";
import { useRouteContext } from "./contexts/RouteContext";
import { RightPanelSurface, type RightPanelResizeControls } from "./RightPanelSurface";
import { BuildProjectRightPanel } from "../features/rebuild/BuildProjectRightPanel";
import { RightPanelAgentChat } from "../features/agents/RightPanelAgentChat";
import { RightPanelModeSwitch } from "../shared/rightPanel/RightPanelModeSwitch";
import type { ProjectStatus } from "../contracts/api";
import { artifactsApi } from "../data/artifactsApi";



export function RightPanelOrchestrator({
  agentFileContext,
  applyChatFileEdit,
  closeRightPanel,
  draftSeed,
  fileWorkspaceProjectFiles,
  projectChat,
  projectSlug,
  rebuildWorkspace,
  resize,
  rightPanel,
  selectRightPanelKind,
  startRebuild,
}: {
  agentFileContext: {
    aiEditableFiles: AgentContextFile[];
    contextFiles: ChatContextFile[];
    currentFile: AgentContextFile | null;
    highlightedContext: { path: string; target: "editable" | "context" } | null;
    addContextFile: (path: string) => void;
    addEditableFile: (path: string) => void;
    removeAiEditableFile: (path: string) => void;
  };
  applyChatFileEdit: (edit: ChatMessageFileEdit) => Promise<void>;
  closeRightPanel: () => void;
  draftSeed: { id: string; draft: string } | null;
  fileWorkspaceProjectFiles: ProjectFile[];
  projectChat: ProjectChatController;
  projectSlug: string;
  rebuildWorkspace: {
    models: RebuildModel[];
    rebuild: RebuildState | null;
    selectedModelId: string;
    setSelectedModelId: (modelId: string) => void;
    status: ProjectStatus | null;
  };
  resize?: RightPanelResizeControls;
  rightPanel: NonNullable<RightPanelState>;
  selectRightPanelKind: (kind: RightPanelKind) => void;
  startRebuild: () => void;
}) {
  const route = useRouteContext();
  return (
    <RightPanelSurface
      onClose={closeRightPanel}
      panel={rightPanel}
      resize={resize}
    >
      {rightPanel.kind === "build-project" ? (
        <BuildProjectRightPanel
          models={rebuildWorkspace.models}
          onModelChange={rebuildWorkspace.setSelectedModelId}
          onOpenQuestions={() => route.navigateTo("questions")}
          onSelectPanel={selectRightPanelKind}
          onStart={startRebuild}
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
            draftSeed={draftSeed}
            highlightedContext={agentFileContext.highlightedContext}
            models={rebuildWorkspace.models}
            onAddContextFile={agentFileContext.addContextFile}
            onApplyFileEdit={applyChatFileEdit}
            onContextFilesChange={projectChat.setContextFiles}
            onModelChange={rebuildWorkspace.setSelectedModelId}
            onModifyCurrentFile={() => agentFileContext.currentFile && agentFileContext.addEditableFile(agentFileContext.currentFile.path)}
            onNavigateToArtifact={(slug) => route.navigateTo("artifacts", slug)}
            onRebuildArtifact={(slug, modelId) => {
              void artifactsApi.build(projectSlug, slug, modelId);
              route.navigateTo("artifacts", slug);
            }}
            onRemoveAiEditableFile={agentFileContext.removeAiEditableFile}
            projectFiles={fileWorkspaceProjectFiles}
            projectSlug={projectSlug}
            selectedModelId={rebuildWorkspace.selectedModelId}
          />
        </div>
      )}
    </RightPanelSurface>
  );
}
