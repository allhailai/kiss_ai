import type { ProjectChatController } from "./hooks/useProjectChat";
import type { DesignWorkspaceController, FileWorkspaceController, RebuildWorkspaceController } from "./workspaceControllers";
import type { View } from "../navigation/views";
import { useRouteContext } from "./contexts/RouteContext";
import { useToastContext } from "./contexts/ToastContext";
import { Dashboard } from "../features/dashboard/Dashboard";
import { DesignWorkspace } from "../features/design/DesignWorkspace";
import { FileWorkspace } from "../features/files/FileWorkspace";
import { ProjectChatConversationHistory } from "../features/chat/ProjectChatConversationHistory";
import { QuestionsWorkspace } from "../features/questions/QuestionsWorkspace";
import { SuggestionsWorkspace } from "../features/suggestions/SuggestionsWorkspace";
import { TopicsWorkspace } from "../features/topics/TopicsWorkspace";

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
      {route.view === "questions" ? (
        <QuestionsWorkspace
          models={rebuildWorkspace.models}
          onModelChange={rebuildWorkspace.setSelectedModelId}
          onNavigateToFile={onOpenFile}
          projectSlug={projectSlug}
          selectedModelId={rebuildWorkspace.selectedModelId}
        />
      ) : null}
      {route.view === "suggestions" ? (
        <SuggestionsWorkspace
          onNavigateToFile={onOpenFile}
          projectSlug={projectSlug}
        />
      ) : null}
      {route.view === "topics" ? (
        <TopicsWorkspace
          onNavigateToFile={onOpenFile}
          projectSlug={projectSlug}
        />
      ) : null}
    </section>
  );
}
