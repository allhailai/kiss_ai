import type { ProjectStatus, RebuildState, RequirementsSyncSignalsResponse } from "../../contracts/api";

export function RebuildWorkspace({
  status,
  rebuild,
  onOpenBuildProject,
  onOpenRequirementsSync,
  requirementsSyncSignals,
}: {
  status: ProjectStatus | null;
  rebuild: RebuildState | null;
  onOpenBuildProject: () => void;
  onOpenRequirementsSync: () => void;
  requirementsSyncSignals: RequirementsSyncSignalsResponse | null;
}) {
  return (
    <div className="panel-stack rebuild-launcher-workspace">
      <header className="page-header">
        <span className="eyebrow">Project rebuild</span>
        <h2>Build Project</h2>
        <p>Use the right panel to synchronize requirements or stream the project build.</p>
      </header>

      <section className="content-card rebuild-launcher-card" aria-label="Build actions">
        <div className="rebuild-launcher-actions">
          <button className="rebuild-launcher-action rebuild-launcher-sync" onClick={onOpenRequirementsSync} type="button">
            <span>Synchronize Requirements</span>
            <small>{requirementsSyncSignals?.summary ?? "Review Goal, Inputs, and Outputs before building."}</small>
          </button>
          <button className="rebuild-launcher-action rebuild-launcher-build" onClick={onOpenBuildProject} type="button">
            <span>Build Project</span>
            <small>{rebuild?.running ? "Build is running. Open the right panel for live progress." : rebuild?.message || "Open the build panel."}</small>
          </button>
        </div>
        {!status?.cursorApiKeyAvailable ? (
          <p className="lint-warning">
            Add a Cursor API key using `CURSOR_API_KEY`, `web/.env`, or macOS Keychain item `cursor_api_key` to enable UI-triggered builds.
          </p>
        ) : null}
      </section>
    </div>
  );
}
