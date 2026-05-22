import type { ProjectChatController } from "./hooks/useProjectChat";
import type { DesignWorkspaceController, FileWorkspaceController, RebuildWorkspaceController } from "./workspaceControllers";
import type { View } from "../navigation/views";
import { useRouteContext } from "./contexts/RouteContext";
import { useToastContext } from "./contexts/ToastContext";
import { Dashboard } from "../features/dashboard/Dashboard";
import { DesignWorkspace } from "../features/design/DesignWorkspace";
import { FileWorkspace } from "../features/files/FileWorkspace";
import { ArtifactsView } from "../features/artifacts/ArtifactsView";
import { ProjectChatConversationHistory } from "../features/chat/ProjectChatConversationHistory";
import { ReviewWorkspace } from "./ReviewWorkspace";

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

const reviewViews = new Set<View>(["review", "questions", "topics"]);

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
      {route.view === "dashboard" ? (
        <Dashboard
          status={rebuildWorkspace.status}
          design={designWorkspace.design}
          rebuild={rebuildWorkspace.rebuild}
          buildLog={rebuildWorkspace.buildLog}
          onOpenDesign={() => route.navigateTo("design")}
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
      {reviewViews.has(route.view) ? (
        <ReviewWorkspace
          models={rebuildWorkspace.models}
          onModelChange={rebuildWorkspace.setSelectedModelId}
          onNavigateToFile={onOpenFile}
          projectSlug={projectSlug}
          selectedModelId={rebuildWorkspace.selectedModelId}
        />
      ) : null}
      {route.view === "artifacts" ? (
        <ArtifactsView projectSlug={projectSlug} />
      ) : null}
    </section>
  );
}

