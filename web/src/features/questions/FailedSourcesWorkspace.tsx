import { useCallback, useState } from "react";
import { formatLocalDateTime } from "../../domain/formatters";

export type FailedSource = {
  id: string;
  url: string;
  error: string;
  failedAt: string;
};

export function FailedSourcesWorkspace({
  projectSlug,
  failedSources,
  onRefresh,
}: {
  projectSlug: string;
  failedSources: FailedSource[];
  onRefresh: () => void;
}) {
  const [clearingId, setClearingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleClear = useCallback(async (id: string) => {
    if (clearingId) return;
    setClearingId(id);
    setError(null);
    try {
      const response = await fetch(
        `/api/projects/${encodeURIComponent(projectSlug)}/failed-sources/${encodeURIComponent(id)}`,
        {
          method: "DELETE",
        }
      );
      if (!response.ok) throw new Error("Failed to clear source");
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear source");
    } finally {
      setClearingId(null);
    }
  }, [projectSlug, onRefresh, clearingId]);

  return (
    <div className="failed-sources-workspace">
      <header className="failed-sources-header">
        <h2>Failed Sources</h2>
        <p className="failed-sources-summary">
          {failedSources.length} URL{failedSources.length !== 1 ? "s" : ""} failed or blocked.
        </p>
      </header>

      {error ? <p className="failed-sources-error">{error}</p> : null}

      {failedSources.length === 0 ? (
        <div className="failed-sources-empty">
          <p>No failed sources! All crawler and fetch operations succeeded or have been cleared.</p>
        </div>
      ) : (
        <div className="failed-sources-list">
          {failedSources.map((source) => (
            <article key={source.id} className="failed-source-card">
              <div className="failed-source-card-header">
                <span className="failed-source-card-status">Blocked / Failed</span>
                <button
                  className="failed-source-clear-btn"
                  disabled={clearingId === source.id}
                  onClick={() => handleClear(source.id)}
                  type="button"
                >
                  {clearingId === source.id ? "Clearing…" : "Clear"}
                </button>
              </div>

              <div className="failed-source-url-wrapper">
                <a
                  className="failed-source-url-link"
                  href={source.url}
                  rel="noreferrer"
                  target="_blank"
                >
                  {source.url}
                </a>
              </div>

              <p className="failed-source-error-text">
                <strong>Error:</strong> {source.error}
              </p>

              <div className="failed-source-card-meta">
                <span>Failed at {formatLocalDateTime(source.failedAt, "Unknown")}</span>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
