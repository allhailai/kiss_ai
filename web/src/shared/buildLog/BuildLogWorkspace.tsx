import type { BuildLogState, BuildLogTab, ProjectStatus, RebuildState } from "../../contracts/api";
import { formatLocalDateTime } from "../../domain/formatters";
import { friendlyHumanAttentionItems } from "../../domain/humanAttention";
import { rebuildStatusLabel } from "../../domain/rebuild";

function MarkdownBlock({
  content,
  emptyMessage = "No build log content found yet.",
  technicalSummary,
}: {
  content: string;
  emptyMessage?: string;
  technicalSummary?: string | null;
}) {
  if (!content.trim()) {
    return <p className="build-log-empty">{emptyMessage}</p>;
  }

  if (technicalSummary) {
    return (
      <details className="build-log-technical-markdown">
        <summary>{technicalSummary}</summary>
        <p>These details are mostly for troubleshooting and audits.</p>
        <pre className="build-log-markdown">{content}</pre>
      </details>
    );
  }

  return <pre className="build-log-markdown">{content}</pre>;
}

function BuildLogMetric({ label, value }: { label: string; value: string }) {
  return (
    <span className="build-log-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </span>
  );
}

function BuildLogTabPanel({
  activeTab,
  onSelectLog,
}: {
  activeTab: BuildLogTab | null;
  onSelectLog: (tabId: string, path?: string | null, sectionId?: string | null) => void;
}) {
  if (!activeTab) {
    return (
      <section className="content-card build-log-tab-panel">
        <p className="build-log-empty">No log tabs are available yet.</p>
      </section>
    );
  }

  const selectedFile = activeTab.selectedFile;
  const technicalSummary =
    activeTab.id === "human-attention-queue"
      ? "Technical review-note log"
      : null;

  return (
    <section className="content-card build-log-tab-panel">
      <div className="section-heading build-log-picker-heading">
        <div>
          <h3>{activeTab.label}</h3>
        </div>
      </div>

      <MarkdownBlock content={selectedFile?.content ?? ""} emptyMessage={activeTab.emptyMessage} technicalSummary={technicalSummary} />
    </section>
  );
}

export function BuildLogWorkspace({
  buildLog,
  status,
  rebuild,
  onSelectLog,
}: {
  buildLog: BuildLogState | null;
  status: ProjectStatus | null;
  rebuild: RebuildState | null;
  onSelectLog: (tabId: string, path?: string | null, sectionId?: string | null) => void;
}) {
  const activeTabId = buildLog?.activeTabId ?? "build-log";
  const activeTab = buildLog?.tabs.find((tab) => tab.id === activeTabId) ?? buildLog?.tabs[0] ?? null;
  const attentionCount = status?.humanAttentionCount ?? 0;
  const reviewNotes = friendlyHumanAttentionItems(status?.humanAttentionItems ?? []);

  return (
    <div className="panel-stack build-log-workspace">
      <header className="page-header build-log-header">
        <h2>Build Log</h2>
        <div className="build-log-metrics" aria-label="Build log status summary">
          <BuildLogMetric label="Status" value={rebuildStatusLabel(rebuild?.status ?? status?.rebuildStatus)} />
          <BuildLogMetric label="Last success" value={formatLocalDateTime(status?.lastSuccessfulRunAt)} />
          <BuildLogMetric label="Review notes" value={String(attentionCount)} />

        </div>
      </header>

      {attentionCount ? (
        <section className="build-log-review-notes">
          <strong>Review Notes</strong>
          <p>The build finished. These optional notes can help improve source confidence or project settings.</p>
          {reviewNotes.length ? (
            <div className="build-log-review-note-list">
              {reviewNotes.slice(0, 5).map((item, index) => (
                <article className="build-log-review-note" key={`${item.title}-${index}`}>
                  <h3>{item.title}</h3>
                  <p>{item.summary}</p>
                  {item.action ? <strong>{item.action}</strong> : null}
                  {item.technicalDetails.length ? (
                    <details>
                      <summary>Technical details</summary>
                      <ul>
                        {item.technicalDetails.map((detail) => (
                          <li key={detail}>{detail}</li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                </article>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="build-log-tab-shell">
        <div className="build-log-tabs" role="tablist" aria-label="Build log types">
          {buildLog?.tabs.map((tab) => (
            <button
              className={tab.id === activeTabId ? "build-log-tab active" : "build-log-tab"}
              key={tab.id}
              onClick={() => onSelectLog(tab.id)}
              role="tab"
              type="button"
              aria-selected={tab.id === activeTabId}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <BuildLogTabPanel activeTab={activeTab} onSelectLog={onSelectLog} />
      </section>
    </div>
  );
}
