import type { ProjectChatController } from "./hooks/useProjectChat";
import type { DesignWorkspaceController, FileWorkspaceController, RebuildWorkspaceController } from "./workspaceControllers";
import type { View } from "../navigation/views";
import { useRouteContext } from "./contexts/RouteContext";
import { useToastContext } from "./contexts/ToastContext";

import { DesignWorkspace } from "../features/design/DesignWorkspace";
import { FileWorkspace } from "../features/files/FileWorkspace";
import { ArtifactsView } from "../features/artifacts/ArtifactsView";
import { OutputSectionPage } from "../features/outputs/OutputSectionPage";
import { SettingsPage } from "../features/settings/SettingsPage";
import { AIWorkspace } from "./AIWorkspace";

const fileWorkspaceByView: Partial<Record<View, { title?: string; explainer?: string }>> = {
  requirements: {
    title: "Project Brief",
  },
  inputs: {
    explainer: "These sources were gathered by the AI based on your project brief.",
  },
  outputs: {
    explainer: "These notes are automatically generated from your research. Add comments to improve them.",
  },
};

const reportsFileWorkspaceConfig = {
  explainer: "Edit your reports directly, or ask the AI for help.",
};

export function MainContentArea({
  designWorkspace,
  fileWorkspace,
  onAiFileAssist,
  onOpenFile,
  projectChat,
  projectSlug,
  rebuildWorkspace,
  selectProjectChatConversation,
}: {
  designWorkspace: DesignWorkspaceController;
  fileWorkspace: FileWorkspaceController;
  onAiFileAssist: () => void;
  onOpenFile: (path: string) => void;
  projectChat: ProjectChatController;
  projectSlug: string;
  rebuildWorkspace: RebuildWorkspaceController;
  selectProjectChatConversation: (conversationId: string) => void;
}) {
  const route = useRouteContext();
  const toastWorkspace = useToastContext();
  const fileWorkspaceConfig = fileWorkspaceByView[route.view];

  return (
    <section className="workspace">
      {route.view === "ai" ? (
        <AIWorkspace
          context={route.context}
          models={rebuildWorkspace.models}
          onModelChange={rebuildWorkspace.setSelectedModelId}
          onNavigateToFile={onOpenFile}
          projectChat={projectChat}
          projectSlug={projectSlug}
          selectProjectChatConversation={selectProjectChatConversation}
          selectedModelId={rebuildWorkspace.selectedModelId}
        />
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
          onAiFileAssist={onAiFileAssist}
          onNotice={toastWorkspace.setNotice}
          onOpenFile={onOpenFile}
          onRevert={() => void fileWorkspace.revertSelected()}
          onSave={() => void fileWorkspace.saveSelected()}
          projectSlug={projectSlug}
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
      {route.view === "reports" && route.filePath ? (
        <FileWorkspace
          explainer={reportsFileWorkspaceConfig.explainer}
          selected={fileWorkspace.selected}
          selectedDiff={fileWorkspace.selectedDiff}
          draft={fileWorkspace.draft}
          hasUnsavedChanges={fileWorkspace.hasUnsavedChanges}
          aiFileAssistDisabled={fileWorkspace.loading || projectChat.loading || projectChat.sending || projectChat.proposalUpdating}
          projectFiles={fileWorkspace.projectFiles}
          onDraft={fileWorkspace.setDraft}
          onAiFileAssist={onAiFileAssist}
          onNotice={toastWorkspace.setNotice}
          onOpenFile={onOpenFile}
          onRevert={() => void fileWorkspace.revertSelected()}
          onSave={() => void fileWorkspace.saveSelected()}
          projectSlug={projectSlug}
        />
      ) : null}
      {route.view === "reports" && !route.filePath ? (
        <OutputSectionPage
          models={rebuildWorkspace.models}
          projectFiles={fileWorkspace.projectFiles}
          projectSlug={projectSlug}
          selectedModelId={rebuildWorkspace.selectedModelId}
          type="report"
        />
      ) : null}
      {route.view === "artifacts" && !route.filePath ? (
        <OutputSectionPage
          models={rebuildWorkspace.models}
          projectFiles={fileWorkspace.projectFiles}
          projectSlug={projectSlug}
          selectedModelId={rebuildWorkspace.selectedModelId}
          type="artifact"
        />
      ) : null}
      {route.view === "artifacts" && route.filePath ? (
        <ArtifactsView
          lastProjectBuildAt={rebuildWorkspace.status?.lastSuccessfulRunAt ?? null}
          models={rebuildWorkspace.models}
          projectSlug={projectSlug}
          selectedBuildModelId={rebuildWorkspace.selectedModelId}
          selectedFileContent={fileWorkspace.selected}
        />
      ) : null}
      {route.view === "settings" ? (
        <SettingsPage />
      ) : null}
    </section>
  );
}
