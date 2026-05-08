import { useMemo, useState } from "react";
import { projectPathPrefixes } from "../domain/projectPaths";
import { buildThemeStyle } from "./theme";
import { useProjectWorkspace } from "./useProjectWorkspace";
import { type View } from "../navigation/views";
import { BuildLogWorkspace } from "../features/buildLog/BuildLogWorkspace";
import { Dashboard } from "../features/dashboard/Dashboard";
import { DesignWorkspace } from "../features/design/DesignWorkspace";
import { FileWorkspace } from "../features/files/FileWorkspace";
import { isRequirementAutoUpdatePath, RequirementsAutoUpdateModal } from "../features/files/RequirementsAutoUpdateModal";
import { SimplifiedNavigator } from "../features/navigation/WorkflowMenus";
import { ProjectPicker } from "../features/projectPicker/ProjectPicker";
import { RebuildWorkspace } from "../features/rebuild/RebuildWorkspace";
import { GlobalFileSearch } from "../features/search/GlobalFileSearch";
import { ToastViewport } from "../features/toast/ToastViewport";

const fileWorkspaceByView: Partial<Record<View, { title: string; explainer?: string }>> = {
  requirements: {
    title: "Human-Owned Requirements",
  },
  inputs: {
    title: "Human Inputs",
    explainer: `Human source material belongs under ${projectPathPrefixes.humanInput}. Upload support comes later; this lab currently browses and edits Markdown.`,
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

export function App() {
  const workspace = useProjectWorkspace();
  const [autoUpdateOpen, setAutoUpdateOpen] = useState(false);
  const themeStyle = useMemo(() => buildThemeStyle(workspace.design), [workspace.design]);

  if (!workspace.selectedProjectSlug || !workspace.selectedProject) {
    return (
      <main className="app-shell project-picker-shell" style={themeStyle}>
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

  const navigateTo = (view: View, filePath?: string | null) => workspace.navigateTo(view, filePath);
  const fileWorkspace = fileWorkspaceByView[workspace.view];
  const selectedAutoUpdatePath =
    workspace.selected?.path && isRequirementAutoUpdatePath(workspace.selected.path) ? workspace.selected.path : null;

  return (
    <main className="app-shell" style={themeStyle}>
      <GlobalFileSearch
        projectName={workspace.status?.projectName ?? workspace.selectedProject.name}
        projectSlug={workspace.selectedProjectSlug}
        onOpenFile={workspace.openProjectFile}
        onOpenProjectHome={() => navigateTo("rebuild")}
        onSwitchProject={workspace.clearSelectedProject}
      />
      <ToastViewport toasts={workspace.toasts} onDismiss={workspace.dismissToast} />

      <aside className="sidebar">
        <SimplifiedNavigator
          currentView={workspace.view}
          loading={workspace.loading}
          projectFiles={workspace.projectFiles}
          selectedPath={workspace.selected?.path ?? null}
          showAiAutoUpdate={Boolean(selectedAutoUpdatePath)}
          onAiAutoUpdate={() => setAutoUpdateOpen(true)}
          onOpenFile={workspace.openProjectFile}
          onOpenView={(nextView, filePath) => navigateTo(nextView, filePath)}
        />
      </aside>

      <section className="workspace">
        {workspace.view === "build-log" ? (
          <BuildLogWorkspace
            buildLog={workspace.buildLog}
            status={workspace.status}
            rebuild={workspace.rebuild}
            onSelectSummary={(summaryPath, sectionId) => void workspace.refreshBuildLog(summaryPath, sectionId)}
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
    </main>
  );
}
