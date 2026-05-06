import { requirementsExplainer, views, workflowMenuViews, type View } from "../../app/views";
import type { ProjectFile } from "../../api";
import { humanizePathSegment } from "../../domain/files";
import { FileTreeNav } from "./FileTreeNav";

export function MainWorkflowMenu({
  currentView,
  onOpen,
}: {
  currentView: View;
  onOpen: (view: View) => void;
}) {
  return (
    <nav className="nav-list" aria-label="Main workflows">
      {workflowMenuViews.map((item) => (
        <button className={item.id === currentView ? "nav-item active" : "nav-item"} key={item.id} onClick={() => onOpen(item.id)}>
          <strong>{item.label}</strong>
          <span>{item.description}</span>
        </button>
      ))}
    </nav>
  );
}

export function ContextualNavigator({
  currentView,
  files,
  loading,
  menuOpen,
  selectedPath,
  showAiAutoUpdate,
  onAiAutoUpdate,
  onToggleMenu,
  onOpenView,
  onSelectFile,
}: {
  currentView: View;
  files: ProjectFile[];
  loading: boolean;
  menuOpen: boolean;
  selectedPath: string | null;
  showAiAutoUpdate?: boolean;
  onAiAutoUpdate?: () => void;
  onToggleMenu: () => void;
  onOpenView: (view: View) => void;
  onSelectFile: (path: string) => void;
}) {
  const current = views.find((item) => item.id === currentView) ?? views[0];
  const showLocalFiles = ["requirements", "inputs", "outputs", "annotations", "design"].includes(currentView);
  const showFileTree = currentView === "inputs" || currentView === "outputs" || currentView === "annotations";

  return (
    <div className="context-nav">
      <div className="workflow-switcher">
        <button className="workflow-trigger" onClick={onToggleMenu} aria-expanded={menuOpen}>
          <span>
            <strong>{current.label}</strong>
            <em>{current.description}</em>
          </span>
          <b>⌄</b>
        </button>

        {menuOpen ? (
          <nav className="workflow-menu" aria-label="Switch workflow">
            {workflowMenuViews.map((item) => (
              <button
                className={item.id === currentView ? "workflow-option active" : "workflow-option"}
                key={item.id}
                onClick={() => onOpenView(item.id)}
              >
                <strong>{item.label}</strong>
                <span>{item.description}</span>
              </button>
            ))}
          </nav>
        ) : null}
      </div>

      {showLocalFiles ? (
        <nav className="local-nav" aria-label={`${current.label} items`}>
          <span className="eyebrow">{files.length} items</span>
          {loading ? <p>Loading...</p> : null}
          {files.length === 0 && !loading ? <p>No Markdown files found for this workflow yet.</p> : null}
          {showFileTree ? (
            <FileTreeNav files={files} selectedPath={selectedPath} onSelectFile={onSelectFile} />
          ) : (
            files.map((file) => {
              const visibleName = humanizePathSegment(file.name);

              return (
                <button
                  className={["local-nav-item", selectedPath === file.path ? "active" : ""].filter(Boolean).join(" ")}
                  key={file.path}
                  onClick={() => onSelectFile(file.path)}
                  title={file.path}
                >
                  <span>{visibleName}</span>
                </button>
              );
            })
          )}
          {showAiAutoUpdate ? (
            <button className="local-nav-action" onClick={onAiAutoUpdate} type="button">
              <strong>AI Auto Update</strong>
              <span>Propagate concepts across root requirements</span>
            </button>
          ) : null}
          {currentView === "requirements" ? <p className="local-nav-note">{requirementsExplainer}</p> : null}
        </nav>
      ) : (
        <div className="local-nav-empty">
          <span className="eyebrow">{current.label}</span>
          <p>This workflow uses the main workspace and does not need a file list yet.</p>
        </div>
      )}
    </div>
  );
}
