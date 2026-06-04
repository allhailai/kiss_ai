import type { BuildLogState, DesignState, ProjectStatus, RebuildState } from "../../contracts/api";
import { BuildLogWorkspace } from "../../shared/buildLog/BuildLogWorkspace";
import { formatLocalDateTime } from "../../domain/formatters";
import { rebuildStatusLabel } from "../../domain/rebuild";

function lintStatusLabel(status: string | null | undefined) {
  switch (status) {
    case "completed_with_warnings":
      return "Completed with review notes";
    case "passed":
    case "clean":
      return "Passed";
    case "failed":
      return "Needs fixes";
    case null:
    case undefined:
      return "Unknown";
    default:
      return status.replace(/_/g, " ");
  }
}

export function Dashboard({
  buildLog,
  status,
  design,
  rebuild,
  onOpenDesign,
  onSelectLog,
}: {
  buildLog: BuildLogState | null;
  status: ProjectStatus | null;
  design: DesignState | null;
  rebuild: RebuildState | null;
  onOpenDesign: () => void;
  onSelectLog: (tabId: string, path?: string | null, sectionId?: string | null) => void;
}) {
  return (
    <div className="panel-stack">
      <header className="page-header">
        <span className="eyebrow">Project dashboard</span>
        <h2>Project Overview</h2>
        <p>Status, update history, and AI service availability.</p>
      </header>

      <div className="card-grid">
        <StatusCard label="Last successful update" value={formatLocalDateTime(status?.lastSuccessfulRunAt)} />
        <StatusCard label="Scaling mode" value={status?.scalingMode ?? "Unknown"} />
        <StatusCard label="Last research update" value={rebuildStatusLabel(status?.rebuildStatus)} />
        <StatusCard label="Quality checks" value={lintStatusLabel(status?.lintStatus)} />
        <StatusCard label="Review notes" value={String(status?.humanAttentionCount ?? 0)} />
      </div>

      <div className="card-grid dashboard-action-grid">
        <StatusCard label="Design identity" value={design?.parsed.name ?? "Loading"} onClick={onOpenDesign} />
      </div>

      <section className="content-card">
        <div className="section-heading">
          <h3>AI Service Status</h3>
        </div>
        <p>
          Research updates are{" "}
          <strong>
            {status?.cursorApiKeyAvailable ? `available from ${status.cursorApiKeySource}` : "blocked until an AI service key is configured"}
          </strong>
          .
        </p>
        {status?.cursorApiKeyWarnings?.length ? (
          <div className="warning-callout">
            <strong>AI service key warning</strong>
            <ul>
              {status.cursorApiKeyWarnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section className="content-card">
        <p className="dashboard-setup-note">
          Project initialized <strong>{formatLocalDateTime(status?.setupInitializedAt)}</strong>.
        </p>
        <h3>Git working tree</h3>
        {status?.gitStatus.length ? (
          <ul className="compact-list">
            {status.gitStatus.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : (
          <p>No local changes reported.</p>
        )}
      </section>

      <BuildLogWorkspace
        buildLog={buildLog}
        status={status}
        rebuild={rebuild}
        onSelectLog={onSelectLog}
      />
    </div>
  );
}

function StatusCard({ label, value, onClick }: { label: string; value: string; onClick?: () => void }) {
  const content = (
    <>
      <span className="eyebrow">{label}</span>
      <strong>{value}</strong>
    </>
  );

  return onClick ? (
    <button className="status-card status-card-button" onClick={onClick} type="button">
      {content}
    </button>
  ) : (
    <section className="status-card">{content}</section>
  );
}
