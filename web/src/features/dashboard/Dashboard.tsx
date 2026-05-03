import type { DesignState, ProjectStatus } from "../../api";
import { formatLocalDateTime } from "../../domain/formatters";

export function Dashboard({
  status,
  design,
  onOpenAnnotations,
  onOpenDesign,
  onRefresh,
}: {
  status: ProjectStatus | null;
  design: DesignState | null;
  onOpenAnnotations: () => void;
  onOpenDesign: () => void;
  onRefresh: () => void;
}) {
  return (
    <div className="panel-stack">
      <header className="page-header">
        <span className="eyebrow">Project dashboard</span>
        <h2>Current project state</h2>
        <p>Readiness, rebuild history, annotation status, and local runtime availability.</p>
      </header>

      <div className="card-grid">
        <StatusCard label="Last successful run" value={formatLocalDateTime(status?.lastSuccessfulRunAt)} />
        <StatusCard label="Scaling mode" value={status?.scalingMode ?? "Unknown"} />
        <StatusCard label="Rebuild scope" value={status?.rebuildStatus ?? "Unknown"} />
        <StatusCard label="Lint" value={status?.lintStatus ?? "Unknown"} />
      </div>

      <div className="card-grid dashboard-action-grid">
        <StatusCard label="Annotation files" value={String(status?.annotationFiles ?? 0)} onClick={onOpenAnnotations} />
        <StatusCard label="Design identity" value={design?.parsed.name ?? "Loading"} onClick={onOpenDesign} />
      </div>

      <section className="content-card">
        <div className="section-heading">
          <h3>Runtime readiness</h3>
          <button onClick={onRefresh}>Refresh</button>
        </div>
        <p>
          Cursor SDK rebuilds are{" "}
          <strong>
            {status?.cursorApiKeyAvailable ? `available from ${status.cursorApiKeySource}` : "blocked until a Cursor API key is available"}
          </strong>
          .
        </p>
        {status?.cursorApiKeyWarnings?.length ? (
          <div className="warning-callout">
            <strong>Cursor API key warning</strong>
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
