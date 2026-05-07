import type { BuildLogState, BuildSummary, ProjectStatus, RebuildState } from "../../api";
import { formatLocalDateTime } from "../../domain/formatters";

function attentionItemText(item: unknown) {
  if (!item || typeof item !== "object") return String(item);

  const source = item as Record<string, unknown>;
  const severity = typeof source.severity === "string" ? source.severity : "attention";
  const category = typeof source.category === "string" ? source.category : "review";
  const summary =
    typeof source.summary === "string"
      ? source.summary
      : typeof source.issue === "string"
        ? source.issue
        : typeof source.message === "string"
          ? source.message
          : "Review needed.";
  const nextAction =
    typeof source.next_human_action === "string"
      ? source.next_human_action
      : typeof source.nextAction === "string"
        ? source.nextAction
        : "";

  return `${severity}/${category}: ${summary}${nextAction ? ` Next: ${nextAction}` : ""}`;
}

function MarkdownBlock({ content }: { content: string }) {
  if (!content.trim()) {
    return <p className="build-log-empty">No build log content found yet.</p>;
  }

  return <pre className="build-log-markdown">{content}</pre>;
}

function StatusCard({ label, value }: { label: string; value: string }) {
  return (
    <section className="status-card">
      <span className="eyebrow">{label}</span>
      <strong>{value}</strong>
    </section>
  );
}

function SummaryButton({
  summary,
  latestPath,
  selectedPath,
  selectedSectionId,
  onSelectSummary,
}: {
  summary: BuildSummary;
  latestPath: string | null;
  selectedPath: string | null;
  selectedSectionId: string | null;
  onSelectSummary: (summaryPath: string, sectionId?: string | null) => void;
}) {
  const isSelectedSummary = selectedPath === summary.path;

  return (
    <article className="build-log-summary-item">
      <button
        className={isSelectedSummary && !selectedSectionId ? "build-log-summary-button active" : "build-log-summary-button"}
        onClick={() => onSelectSummary(summary.path)}
        type="button"
      >
        <span>
          <strong>{summary.title}</strong>
          {summary.path === latestPath ? <em>Latest</em> : null}
        </span>
        <small>{formatLocalDateTime(summary.modifiedAt)}</small>
      </button>
      {summary.sections.length > 1 ? (
        <div className="build-log-section-list" aria-label={`${summary.title} sections`}>
          {summary.sections.map((section) => (
            <button
              className={isSelectedSummary && selectedSectionId === section.id ? "active" : ""}
              key={section.id}
              onClick={() => onSelectSummary(summary.path, section.id)}
              type="button"
            >
              {section.title}
            </button>
          ))}
        </div>
      ) : null}
    </article>
  );
}

export function BuildLogWorkspace({
  buildLog,
  status,
  rebuild,
  onSelectSummary,
}: {
  buildLog: BuildLogState | null;
  status: ProjectStatus | null;
  rebuild: RebuildState | null;
  onSelectSummary: (summaryPath: string, sectionId?: string | null) => void;
}) {
  const selectedSummary = buildLog?.selectedSummary ?? null;
  const latestSummary = buildLog?.latestSummary ?? null;
  const visibleSummary = selectedSummary ?? latestSummary;
  const latestPath = latestSummary?.path ?? null;
  const selectedPath = selectedSummary?.path ?? null;
  const selectedSectionId = selectedSummary?.selectedSectionId ?? null;
  const attentionCount = status?.humanAttentionCount ?? 0;

  return (
    <div className="panel-stack build-log-workspace">
      <header className="page-header">
        <span className="eyebrow">Build Log</span>
        <h2>Latest build summary and project history</h2>
        <p>Review the most recent rebuild first, then open older build summaries without browsing project files.</p>
      </header>

      <div className="card-grid">
        <StatusCard label="Current Rebuild Status" value={rebuild?.status ?? status?.rebuildStatus ?? "Unknown"} />
        <StatusCard label="Last Successful Run" value={formatLocalDateTime(status?.lastSuccessfulRunAt)} />
        <StatusCard label="Attention Needed" value={String(attentionCount)} />
        <StatusCard label="Latest Summary" value={latestSummary ? formatLocalDateTime(latestSummary.modifiedAt) : "None"} />
      </div>

      {attentionCount ? (
        <section className="warning-callout">
          <strong>Attention Needed</strong>
          <p>
            Review {attentionCount} item{attentionCount === 1 ? "" : "s"} in `change_logs/human_attention_queue.md`.
          </p>
          {status?.humanAttentionItems?.length ? (
            <ul>
              {status.humanAttentionItems.slice(0, 5).map((item, index) => (
                <li key={index}>{attentionItemText(item)}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      <section className="content-card build-log-latest-card">
        <div className="section-heading">
          <div>
            <h3>{selectedSummary ? "Selected Build Summary" : "Latest Build Summary"}</h3>
            {visibleSummary ? <p>{visibleSummary.path}</p> : null}
          </div>
        </div>
        <MarkdownBlock content={visibleSummary?.content ?? ""} />
      </section>

      <section className="content-card">
        <h3>Build Log</h3>
        <MarkdownBlock content={buildLog?.aggregateLogExcerpt ?? ""} />
      </section>

      <section className="content-card build-log-history-card">
        <h3>Older Build Summaries</h3>
        {buildLog?.summaries.length ? (
          <div className="build-log-summary-list">
            {buildLog.summaries.map((summary) => (
              <SummaryButton
                key={summary.path}
                latestPath={latestPath}
                selectedPath={selectedPath}
                selectedSectionId={selectedSectionId}
                summary={summary}
                onSelectSummary={onSelectSummary}
              />
            ))}
          </div>
        ) : (
          <p className="build-log-empty">No build summaries found in `change_logs/summaries/` yet.</p>
        )}
      </section>
    </div>
  );
}
