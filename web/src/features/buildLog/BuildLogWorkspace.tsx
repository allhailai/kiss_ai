import type { BuildLogState, BuildLogTab, ProjectStatus, RebuildState } from "../../contracts/api";
import { formatLocalDateTime } from "../../domain/formatters";
import { humanAttentionItemText } from "../../domain/humanAttention";
import { humanAttentionQueuePath } from "../../domain/projectPaths";

function MarkdownBlock({ content, emptyMessage = "No build log content found yet." }: { content: string; emptyMessage?: string }) {
  if (!content.trim()) {
    return <p className="build-log-empty">{emptyMessage}</p>;
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
  const selectedPath = selectedFile?.path ?? "";
  const showFilePicker = activeTab.id === "build-summary";

  return (
    <section className="content-card build-log-tab-panel">
      <div className="section-heading build-log-picker-heading">
        <div>
          <h3>{activeTab.label}</h3>
        </div>
        {showFilePicker ? (
          <label className="build-log-file-picker">
            <span>Build Summaries</span>
            <select
              value={selectedPath}
              onChange={(event) => onSelectLog(activeTab.id, event.target.value)}
              disabled={!activeTab.files.length}
            >
              {activeTab.files.length ? null : <option value="">No files found</option>}
              {activeTab.files.map((file) => (
                <option key={file.path} value={file.path}>
                  {file.title} ({formatLocalDateTime(file.modifiedAt)})
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      <MarkdownBlock content={selectedFile?.content ?? ""} emptyMessage={activeTab.emptyMessage} />
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
  const activeTabId = buildLog?.activeTabId ?? "build-summary";
  const activeTab = buildLog?.tabs.find((tab) => tab.id === activeTabId) ?? buildLog?.tabs[0] ?? null;
  const latestSummary = buildLog?.tabs.find((tab) => tab.id === "build-summary")?.files[0] ?? null;
  const attentionCount = status?.humanAttentionCount ?? 0;

  return (
    <div className="panel-stack build-log-workspace">
      <header className="page-header build-log-header">
        <div>
          <span className="eyebrow">Build Log</span>
          <h2>Latest build summary and project history</h2>
        </div>
        <div className="build-log-metrics" aria-label="Build log status summary">
          <BuildLogMetric label="Status" value={rebuild?.status ?? status?.rebuildStatus ?? "Unknown"} />
          <BuildLogMetric label="Last success" value={formatLocalDateTime(status?.lastSuccessfulRunAt)} />
          <BuildLogMetric label="Attention" value={String(attentionCount)} />
          <BuildLogMetric label="Latest summary" value={latestSummary ? formatLocalDateTime(latestSummary.modifiedAt) : "None"} />
        </div>
      </header>

      {attentionCount ? (
        <section className="warning-callout">
          <strong>Attention Needed</strong>
          <p>
            Review {attentionCount} item{attentionCount === 1 ? "" : "s"} in `{humanAttentionQueuePath}`.
          </p>
          {status?.humanAttentionItems?.length ? (
            <ul>
              {status.humanAttentionItems.slice(0, 5).map((item, index) => (
                <li key={index}>{humanAttentionItemText(item)}</li>
              ))}
            </ul>
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
