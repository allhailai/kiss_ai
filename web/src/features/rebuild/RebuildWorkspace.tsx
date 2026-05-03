import type { ProjectStatus, RebuildState } from "../../api";

export function RebuildWorkspace({
  status,
  rebuild,
  onStart,
  onRefresh,
}: {
  status: ProjectStatus | null;
  rebuild: RebuildState | null;
  onStart: () => void;
  onRefresh: () => void;
}) {
  return (
    <div className="panel-stack">
      <header className="page-header">
        <span className="eyebrow">Project rebuild</span>
        <h2>Run the kiss_ai rebuild loop</h2>
        <p>The backend starts one local Cursor SDK agent from the project root and asks it to follow the project rebuild command.</p>
      </header>

      <section className="content-card">
        <div className="section-heading">
          <h3>Runner status</h3>
          <button onClick={onRefresh}>Refresh</button>
        </div>
        <p>
          Current state: <strong>{rebuild?.status ?? "idle"}</strong>
        </p>
        <p>{rebuild?.message ?? "No rebuild state loaded."}</p>
        <button disabled={Boolean(rebuild?.running) || !status?.cursorApiKeyAvailable} onClick={onStart}>
          {rebuild?.running ? "Rebuild Running" : "Start Rebuild"}
        </button>
        {!status?.cursorApiKeyAvailable ? (
          <p className="lint-warning">
            Add a Cursor API key using `CURSOR_API_KEY`, `web/.env`, or macOS Keychain item `cursor_api_key` to enable
            UI-triggered rebuilds.
          </p>
        ) : (
          <p>
            Using Cursor API key from <strong>{status.cursorApiKeySource}</strong>.
          </p>
        )}
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
        <h3>Run log</h3>
        <pre className="run-log">{rebuild?.log.length ? rebuild.log.join("\n\n") : "No UI-started rebuild log yet."}</pre>
      </section>
    </div>
  );
}
