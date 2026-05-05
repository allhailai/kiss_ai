import { useMemo } from "react";
import { buildThemeStyle } from "./theme";
import { useProjectWorkspace } from "./useProjectWorkspace";
import { type View } from "./views";
import { BuildLogWorkspace } from "../features/buildLog/BuildLogWorkspace";
import { Dashboard } from "../features/dashboard/Dashboard";
import { DesignWorkspace } from "../features/design/DesignWorkspace";
import { FileWorkspace } from "../features/files/FileWorkspace";
import { ContextualNavigator, MainWorkflowMenu } from "../features/navigation/WorkflowMenus";
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
    explainer: "Human source material belongs under inputs_human/. Upload support comes later; this lab currently browses and edits Markdown.",
  },
  outputs: {
    title: "Outputs",
    explainer: "Generated outputs can be reviewed and edited here. Saves write directly to outputs_ai/.",
  },
  annotations: {
    title: "Annotation Workspace",
    explainer: "Files under inputs_ai/ are AI-managed. Human edits here are intentionally visualized as annotations and detected through Git diff.",
  },
};

export function App() {
  const workspace = useProjectWorkspace();
  const themeStyle = useMemo(() => buildThemeStyle(workspace.design), [workspace.design]);

  if (!workspace.selectedProjectSlug || !workspace.selectedProject) {
    return (
      <main className="app-shell project-picker-shell" style={themeStyle}>
        <ToastViewport toasts={workspace.toasts} onDismiss={workspace.dismissToast} />
        <ProjectPicker
          error={workspace.projectsError}
          onRefresh={() => void workspace.refreshProjects()}
          onSelect={workspace.selectProject}
          projects={workspace.projects}
          projectsRoot={workspace.projectsRoot}
        />
      </main>
    );
  }

  const navigateTo = (view: View, filePath?: string | null) => workspace.navigateTo(view, filePath);
  const fileWorkspace = fileWorkspaceByView[workspace.view];

  return (
    <main className="app-shell" style={themeStyle}>
      <GlobalFileSearch
        projectSlug={workspace.selectedProjectSlug}
        onOpenFile={workspace.openProjectFile}
        onSwitchProject={workspace.clearSelectedProject}
      />
      <ToastViewport toasts={workspace.toasts} onDismiss={workspace.dismissToast} />

      <aside className="sidebar">
        <div className="brand">
          <span className="eyebrow">kiss_ai lab</span>
          <button className="home-link" onClick={() => navigateTo("build-log")}>
            {workspace.status?.projectName ?? workspace.selectedProject.name}
          </button>
        </div>

        {workspace.view === "build-log" || workspace.view === "dashboard" ? (
          <MainWorkflowMenu currentView={workspace.view} onOpen={(nextView) => navigateTo(nextView)} />
        ) : (
          <ContextualNavigator
            currentView={workspace.view}
            files={workspace.files}
            loading={workspace.loading}
            menuOpen={workspace.workflowMenuOpen}
            selectedPath={workspace.selected?.path ?? null}
            onToggleMenu={() => workspace.setWorkflowMenuOpen((isOpen) => !isOpen)}
            onOpenView={(nextView) => navigateTo(nextView)}
            onSelectFile={(path) => navigateTo(workspace.view, path)}
          />
        )}
      </aside>

      <section className="workspace">
        {workspace.view === "build-log" ? (
          <BuildLogWorkspace
            buildLog={workspace.buildLog}
            status={workspace.status}
            rebuild={workspace.rebuild}
            onRefresh={() => {
              void workspace.refreshBuildLog();
              void workspace.refreshStatus();
              void workspace.refreshRebuild();
            }}
            onSelectSummary={(summaryPath, sectionId) => void workspace.refreshBuildLog(summaryPath, sectionId)}
          />
        ) : null}
        {workspace.view === "dashboard" ? (
          <Dashboard
            status={workspace.status}
            design={workspace.design}
            onOpenAnnotations={() => navigateTo("annotations")}
            onOpenDesign={() => navigateTo("design")}
            onRefresh={() => void workspace.refreshStatus()}
          />
        ) : null}
        {fileWorkspace ? (
          <FileWorkspace
            title={fileWorkspace.title}
            explainer={fileWorkspace.explainer}
            selected={workspace.selected}
            selectedDiff={workspace.selectedDiff}
            draft={workspace.draft}
            projectFiles={workspace.projectFiles}
            onDraft={workspace.setDraft}
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
            onRefresh={() => {
              void workspace.refreshRebuild();
              void workspace.refreshStatus();
              void workspace.refreshRebuildModels();
            }}
          />
        ) : null}
      </section>
    </main>
  );
}
