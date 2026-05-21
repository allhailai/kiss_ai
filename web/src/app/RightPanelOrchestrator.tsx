import type { AgentContextFile, ChatContextFile, ChatMessageFileEdit, ProjectFile, RebuildModel, RebuildState } from "../contracts/api";
import type { ProjectChatController } from "./hooks/useProjectChat";
import type { RightPanelKind, RightPanelState } from "./hooks/useRightPanelSurface";
import type { View } from "../navigation/views";
import { RightPanelSurface } from "./RightPanelSurface";
import { BuildProjectRightPanel } from "../features/rebuild/BuildProjectRightPanel";
import { RightPanelAgentChat } from "../features/agents/RightPanelAgentChat";
import { RightPanelModeSwitch } from "../shared/rightPanel/RightPanelModeSwitch";
import type { ProjectStatus } from "../contracts/api";

export type RightPanelResizeConfig = {
  maxWidthPx: number;
  minWidthPx: number;
  onCommit: () => void;
  onKeyboardResize: (direction: "wider" | "narrower") => void;
  onResize: (clientX: number) => void;
  widthPx: number;
} | undefined;

export function RightPanelOrchestrator({
  agentFileContext,
  applyChatFileEdit,
  closeRightPanel,
  draftSeed,
  fileWorkspaceProjectFiles,
  navigateTo,
  projectChat,
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
  navigateTo: (view: View) => void;
  projectChat: ProjectChatController;
  rebuildWorkspace: {
    models: RebuildModel[];
    rebuild: RebuildState | null;
    selectedModelId: string;
    setSelectedModelId: (modelId: string) => void;
    status: ProjectStatus | null;
  };
  resize: RightPanelResizeConfig;
  rightPanel: NonNullable<RightPanelState>;
  selectRightPanelKind: (kind: RightPanelKind) => void;
  startRebuild: () => void;
}) {
  return (
    <RightPanelSurface
      onClose={closeRightPanel}
      panel={rightPanel}
      resize={resize ? {
        maxWidthPx: resize.maxWidthPx,
        minWidthPx: resize.minWidthPx,
        onCommit: resize.onCommit,
        onKeyboardResize: resize.onKeyboardResize,
        onResize: resize.onResize,
        widthPx: resize.widthPx,
      } : undefined}
    >
      {rightPanel.kind === "build-project" ? (
        <BuildProjectRightPanel
          models={rebuildWorkspace.models}
          onModelChange={rebuildWorkspace.setSelectedModelId}
          onOpenQuestions={() => navigateTo("questions")}
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
            onRemoveAiEditableFile={agentFileContext.removeAiEditableFile}
            projectFiles={fileWorkspaceProjectFiles}
            selectedModelId={rebuildWorkspace.selectedModelId}
          />
        </div>
      )}
    </RightPanelSurface>
  );
}
